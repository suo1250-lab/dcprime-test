import re
from pathlib import Path
from logger import get_logger

log = get_logger("math_submissions")
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, BackgroundTasks
from limiter import limiter
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from database import get_db, SessionLocal
from models import MathTest, MathSubmission, MathSubmissionItem, Student
from config import UPLOAD_DIR, MAX_UPLOAD_IMAGE

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]+?)```")

router = APIRouter(prefix="/math-submissions", tags=["math-submissions"])


class SubmissionItemOut(BaseModel):
    question_no: int
    student_answer: Optional[int]
    correct_answer: int
    is_correct: bool
    tag: Optional[str] = None
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
                    "tag": (s.math_test.tags or {}).get(str(i.question_no)) if s.math_test else None,
                }
                for i in s.items
            ]
        result.append(row)
    return result


def _bg_grade_math(submission_id: int, image_path: str, answers: list):
    """백그라운드에서 OMR CV 채점 (OpenCV 마크 인식)"""
    from omr_cv import grade_omr

    db = SessionLocal()
    try:
        sub = db.query(MathSubmission).filter(MathSubmission.id == submission_id).first()
        if not sub:
            return

        debug_dir = str(UPLOAD_DIR / "omr_debug")
        result = grade_omr(image_path, len(answers), debug_dir=debug_dir)
        student_answers = result["answers"]

        log.info(f"[MathSubmission] CV결과: sub_id={submission_id} flipped={result['flipped']} answers={student_answers}")
        if result["flipped"]:
            log.info(f"[MathSubmission] 좌우반전 감지 후 보정: sub_id={submission_id}")

        score = 0
        for qno, (stu, cor) in enumerate(zip(student_answers, answers), 1):
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
        log.info(f"[MathSubmission] 채점완료: sub_id={submission_id} {score}/{len(answers)}")
    except Exception as e:
        db.rollback()
        sub = db.query(MathSubmission).filter(MathSubmission.id == submission_id).first()
        if sub:
            sub.status = "error"
            db.commit()
        log.error(f"[MathSubmission] 채점실패: {e}")
    finally:
        db.close()


def _bg_grade_math_bulk(submission_id: int, image_path: str, answers: list):
    """합본 채점: OMR CV로 학생 코드 인식 + 답안 채점"""
    from omr_cv import grade_omr, decode_student_code

    db = SessionLocal()
    try:
        sub = db.query(MathSubmission).filter(MathSubmission.id == submission_id).first()
        if not sub:
            return

        result = grade_omr(image_path, len(answers))
        student_answers = result["answers"]
        student_code = result["student_code"]

        if result["flipped"]:
            log.info(f"[MathSubmission] 합본 좌우반전 감지 후 보정: sub_id={submission_id}")

        # 학생 코드로 DB 조회 (학년/반/번호 매칭)
        info = decode_student_code(student_code)
        if info["class_no"] is not None and info["student_no"] is not None:
            student = db.query(Student).filter(
                Student.class_number == info["class_no"],
                Student.student_number == info["student_no"],
            ).first()
            if student:
                sub.student_id = student.id
                sub.student_name = student.name
                log.info(f"[MathSubmission] 학생 코드 {student_code} → {student.name}")
            else:
                sub.student_name = f"코드:{student_code}"
                log.warning(f"[MathSubmission] 학생 코드 {student_code} 매칭 실패")
        else:
            sub.student_name = f"코드:{student_code}"
            log.warning(f"[MathSubmission] 학생 코드 인식 불완전: {student_code}")

        score = 0
        for qno, (stu, cor) in enumerate(zip(student_answers, answers), 1):
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
        log.info(f"[MathSubmission] 합본채점완료: sub_id={submission_id} {sub.student_name} {score}/{len(answers)}")
    except Exception as e:
        db.rollback()
        sub = db.query(MathSubmission).filter(MathSubmission.id == submission_id).first()
        if sub:
            sub.status = "error"
            db.commit()
        log.error(f"[MathSubmission] 합본채점실패: {e}")
    finally:
        db.close()


@router.post("/bulk", status_code=201)
@limiter.limit("30/minute")
async def upload_bulk_omr(
    request: Request,
    background_tasks: BackgroundTasks,
    test_id: int = Form(...),
    images: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    """여러 학생 OMR 합본 업로드 - AI가 각 이미지에서 학생 이름 자동 인식 후 채점"""
    test = db.query(MathTest).filter(MathTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "시험을 찾을 수 없습니다")
    if not test.answers or not any(a > 0 for a in test.answers):
        raise HTTPException(400, "정답이 등록되지 않은 시험입니다")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    created = []
    for image in images:
        image_bytes = await image.read()
        if len(image_bytes) > MAX_UPLOAD_IMAGE:
            continue

        sub = MathSubmission(
            math_test_id=test.id,
            student_id=None,
            student_name="인식중...",
            status="pending",
            total=test.num_questions,
        )
        db.add(sub)
        db.flush()

        ext = Path(image.filename).suffix if image.filename else ".jpg"
        img_path = UPLOAD_DIR / f"math_sub_{sub.id}{ext}"
        img_path.write_bytes(image_bytes)
        sub.image_path = str(img_path)
        db.commit()

        background_tasks.add_task(_bg_grade_math_bulk, sub.id, str(img_path), list(test.answers))
        created.append({"id": sub.id, "filename": image.filename})

    return {"created": len(created), "submissions": created}


@router.post("", status_code=201)
@limiter.limit("120/minute")
async def upload_omr(
    request: Request,
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

    image_bytes = await image.read()
    if len(image_bytes) > MAX_UPLOAD_IMAGE:
        raise HTTPException(413, "이미지 파일이 너무 큽니다 (최대 20MB)")

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
    img_path.write_bytes(image_bytes)
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
    tags_map = s.math_test.tags or {} if s.math_test else {}
    return MathSubmissionDetailOut(
        **_build_out(s, class_avg, class_rank, class_total),
        items=[SubmissionItemOut(
            question_no=i.question_no,
            student_answer=i.student_answer,
            correct_answer=i.correct_answer,
            is_correct=i.is_correct,
            tag=tags_map.get(str(i.question_no)),
        ) for i in s.items]
    )


@router.delete("/{sub_id}", status_code=204)
def delete_submission(sub_id: int, db: Session = Depends(get_db)):
    s = db.query(MathSubmission).filter(MathSubmission.id == sub_id).first()
    if not s:
        raise HTTPException(404, "Not found")
    db.delete(s)
    db.commit()
