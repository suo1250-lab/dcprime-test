from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from database import get_db
from models import MathTest, MathSubmission, MathSubmissionItem, Student

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


@router.get("", response_model=List[MathSubmissionOut])
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
        result.append(MathSubmissionOut(**_build_out(s, class_avg, class_rank, class_total)))
    return result


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
