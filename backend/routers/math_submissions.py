import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from database import get_db, SessionLocal
from models import MathTest, MathSubmission, MathSubmissionItem, Student
from config import UPLOAD_DIR

router = APIRouter(prefix="/math-submissions", tags=["math-submissions"])


class SubmissionItemOut(BaseModel):
    question_no: int
    student_answer: Optional[int]
    correct_answer: int
    is_correct: bool
    class Config:
        from_attributes = True


class MathSubmissionOut(BaseModel):
    id: int
    math_test_id: Optional[int]
    test_title: str
    test_date: Optional[str]
    student_id: Optional[int]
    student_name: str
    status: str
    score: Optional[int]
    total: Optional[int]
    submitted_at: str
    class_avg: Optional[float] = None
    class_rank: Optional[int] = None
    class_total: Optional[int] = None


class MathSubmissionDetailOut(MathSubmissionOut):
    items: List[SubmissionItemOut]


def _build_out(s: MathSubmission, class_avg=None, class_rank=None, class_total=None) -> dict:
    return {
        "id": s.id,
        "math_test_id": s.math_test_id,
        "test_title": s.math_test.title if s.math_test else "",
        "test_date": str(s.math_test.test_date) if s.math_test else None,
        "student_id": s.student_id,
        "student_name": s.student_name,
        "status": s.status,
        "score": s.score,
        "total": s.total,
        "submitted_at": str(s.submitted_at),
        "class_avg": class_avg,
        "class_rank": class_rank,
        "class_total": class_total,
    }


def _calc_class_stats(db: Session, math_test_id: int, student_id: int):
    """같은 시험의 모든 채점 완료 제출에서 반 평균·석차 계산"""
    subs = db.query(MathSubmission).filter(
        MathSubmission.math_test_id == math_test_id,
        MathSubmission.status == "graded",
        MathSubmission.score.isnot(None),
        MathSubmission.total.isnot(None),
    ).all()
    if not subs:
        return None, None, len(subs)
    scores = [(s.student_id, s.score / s.total * 100) for s in subs if s.total and s.total > 0]
    if not scores:
        return None, None, 0
    avg = sum(pct for _, pct in scores) / len(scores)
    my_score = next((pct for sid, pct in scores if sid == student_id), None)
    rank = None
    if my_score is not None:
        rank = sum(1 for _, pct in scores if pct > my_score) + 1
    return round(avg, 1), rank, len(scores)


@router.get("")
def list_submissions(
    student_id: Optional[int] = None,
    test_id: Optional[int] = None,
    detail: bool = False,
    db: Session = Depends(get_db)
):
    q = db.query(MathSubmission)
    if student_id:
        q = q.filter(MathSubmission.student_id == student_id)
    if test_id:
        q = q.filter(MathSubmission.math_test_id == test_id)
    subs = q.order_by(MathSubmission.submitted_at.desc()).all()

    result = []
    for s in subs:
        class_avg, class_rank, class_total = None, None, None
        if detail and s.student_id and s.math_test_id and s.status == "graded":
            class_avg, class_rank, class_total = _calc_class_stats(db, s.math_test_id, s.student_id)
        row = _build_out(s, class_avg, class_rank, class_total)
        if detail:
            row["items"] = [
                {
                    "question_no": i.question_no,
                    "student_answer": i.student_answer,
                    "correct_answer": i.correct_answer,
                    "is_correct": i.is_correct,
                }
                for i in s.items
            ]
        result.append(row)
    return result


def _bg_grade_math(submission_id: int, image_path: str, answers: list):
    """백그라운드에서 OMR AI 채점"""
    from ai_utils import ai_text_call
    import json as _json

    db = SessionLocal()
    try:
        sub = db.query(MathSubmission).filter(MathSubmission.id == submission_id).first()
        if not sub:
            return

        prompt = f"""이것은 수학 시험 OMR 답안지입니다. 각 문항의 마킹된 번호(1~5)를 읽어주세요.
정답지: {answers}  (인덱스 0 = 1번 문항 정답, ...)
각 문항에서 학생이 마킹한 번호를 읽고 다음 JSON으로만 응답하세요:
[{{"question_no":1,"student_answer":3}},{{"question_no":2,"student_answer":1}},...]
마킹이 불분명하면 student_answer를 null로."""

        text = ai_text_call(prompt, max_tokens=1000, fast=True)
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json").strip()
        results = _json.loads(text.strip())

        score = 0
        for r in results:
            qno = r["question_no"]
            stu = r.get("student_answer")
            cor = answers[qno - 1] if 0 < qno <= len(answers) else 0
            is_correct = (stu is not None and stu == cor)
            if is_correct:
                score += 1
            db.add(MathSubmissionItem(
                submission_id=submission_id,
                question_no=qno,
                student_answer=stu,
                correct_answer=cor,
                is_correct=is_correct,
            ))
        sub.score = score
        sub.total = len(answers)
        sub.status = "graded"
        db.commit()
        print(f"[MathSubmission] 채점완료: sub_id={submission_id} {score}/{len(answers)}")
    except Exception as e:
        db.rollback()
        sub = db.query(MathSubmission).filter(MathSubmission.id == submission_id).first()
        if sub:
            sub.status = "error"
            db.commit()
        print(f"[MathSubmission] 채점실패: {e}")
    finally:
        db.close()


@router.post("", status_code=201)
async def upload_omr(
    background_tasks: BackgroundTasks,
    student_name: str = Form(...),
    test_id: int = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    test = db.query(MathTest).filter(MathTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "시험을 찾을 수 없습니다")
    if not test.answers or not any(a > 0 for a in test.answers):
        raise HTTPException(400, "정답이 등록되지 않은 시험입니다")

    student = db.query(Student).filter(Student.name == student_name).first()
    ext = Path(image.filename).suffix if image.filename else ".jpg"

    sub = MathSubmission(
        math_test_id=test.id,
        student_id=student.id if student else None,
        student_name=student_name,
        status="pending",
        total=test.num_questions,
    )
    db.add(sub)
    db.flush()

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    img_path = UPLOAD_DIR / f"math_sub_{sub.id}{ext}"
    with open(img_path, "wb") as f:
        shutil.copyfileobj(image.file, f)
    sub.image_path = str(img_path)
    db.commit()

    background_tasks.add_task(_bg_grade_math, sub.id, str(img_path), list(test.answers))
    return {"id": sub.id, "status": "pending"}


@router.get("/{sub_id}", response_model=MathSubmissionDetailOut)
def get_submission(sub_id: int, db: Session = Depends(get_db)):
    s = db.query(MathSubmission).filter(MathSubmission.id == sub_id).first()
    if not s:
        raise HTTPException(404, "Not found")
    class_avg, class_rank, class_total = None, None, None
    if s.student_id and s.math_test_id and s.status == "graded":
        class_avg, class_rank, class_total = _calc_class_stats(db, s.math_test_id, s.student_id)
    return MathSubmissionDetailOut(
        **_build_out(s, class_avg, class_rank, class_total),
        items=[SubmissionItemOut(
            question_no=i.question_no,
            student_answer=i.student_answer,
            correct_answer=i.correct_answer,
            is_correct=i.is_correct,
        ) for i in s.items]
    )


@router.delete("/{sub_id}", status_code=204)
def delete_submission(sub_id: int, db: Session = Depends(get_db)):
    s = db.query(MathSubmission).filter(MathSubmission.id == sub_id).first()
    if not s:
        raise HTTPException(404, "Not found")
    db.delete(s)
    db.commit()
