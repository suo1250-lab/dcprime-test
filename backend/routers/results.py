from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
import models

router = APIRouter(prefix="/results", tags=["results"])


class QuestionInput(BaseModel):
    question_no: int
    is_correct: bool


class ResultCreate(BaseModel):
    student_id: int
    test_id: int
    question_results: list[QuestionInput]


class QuestionResultOut(BaseModel):
    question_no: int
    is_correct: bool

    class Config:
        from_attributes = True


class ResultOut(BaseModel):
    id: int
    student_id: int
    test_id: int
    score: int
    total: int
    question_results: list[QuestionResultOut]

    class Config:
        from_attributes = True


class ResultSummary(BaseModel):
    id: int
    student_id: int
    student_name: str
    test_id: int
    test_title: str
    subject: str
    grade: str
    score: int
    total: int
    score_pct: Optional[int]
    test_date: Optional[str]


@router.get("", response_model=List[ResultSummary])
def list_results(test_id: Optional[int] = None, student_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.TestResult).options(
        joinedload(models.TestResult.student),
        joinedload(models.TestResult.test),
    )
    if test_id:
        q = q.filter(models.TestResult.test_id == test_id)
    if student_id:
        q = q.filter(models.TestResult.student_id == student_id)
    rows = q.order_by(models.TestResult.created_at.desc()).all()
    out = []
    for r in rows:
        student = r.student
        test    = r.test
        pct = round(r.score / r.total * 100) if r.total else None
        out.append(ResultSummary(
            id=r.id, student_id=r.student_id,
            student_name=student.name if student else "",
            test_id=r.test_id,
            test_title=test.title if test else "",
            subject=test.subject if test else "",
            grade=test.grade if test else "",
            score=r.score, total=r.total, score_pct=pct,
            test_date=str(test.test_date) if test else None,
        ))
    return out


@router.get("/{result_id}/detail")
def get_result_detail(result_id: int, db: Session = Depends(get_db)):
    r = db.query(models.TestResult).filter(models.TestResult.id == result_id).first()
    if not r:
        raise HTTPException(404, "Not found")
    return {
        "id": r.id, "student_id": r.student_id, "test_id": r.test_id,
        "score": r.score, "total": r.total,
        "question_results": [{"question_no": q.question_no, "is_correct": q.is_correct} for q in r.question_results],
    }


@router.post("", response_model=ResultOut, status_code=201)
def create_result(data: ResultCreate, db: Session = Depends(get_db)):
    test = db.get(models.Test, data.test_id)
    if not test:
        raise HTTPException(404, "테스트를 찾을 수 없습니다")

    # 기존 결과 있으면 삭제 후 재입력
    existing = (
        db.query(models.TestResult)
        .filter_by(student_id=data.student_id, test_id=data.test_id)
        .first()
    )
    if existing:
        db.delete(existing)
        db.flush()

    score = sum(1 for q in data.question_results if q.is_correct)
    result = models.TestResult(
        student_id=data.student_id,
        test_id=data.test_id,
        score=score,
        total=len(data.question_results),
    )
    db.add(result)
    db.flush()

    for q in data.question_results:
        db.add(models.QuestionResult(
            result_id=result.id,
            question_no=q.question_no,
            is_correct=q.is_correct,
        ))

    db.commit()
    db.refresh(result)
    return result


@router.delete("/{result_id}", status_code=204)
def delete_result(result_id: int, db: Session = Depends(get_db)):
    r = db.query(models.TestResult).filter(models.TestResult.id == result_id).first()
    if not r:
        raise HTTPException(404, "Not found")
    db.delete(r)
    db.commit()


@router.get("/by-test/{test_id}", response_model=list[ResultOut])
def results_by_test(test_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.TestResult)
        .filter_by(test_id=test_id)
        .all()
    )


@router.get("/by-student/{student_id}", response_model=list[ResultOut])
def results_by_student(student_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.TestResult)
        .filter_by(student_id=student_id)
        .all()
    )


@router.get("/export/excel")
def export_excel(test_id: Optional[int] = None, student_id: Optional[int] = None, db: Session = Depends(get_db)):
    from openpyxl import Workbook
    from fastapi.responses import StreamingResponse
    import io

    q = db.query(models.TestResult).options(
        joinedload(models.TestResult.student).subqueryload(models.Student.classes),
        joinedload(models.TestResult.test),
    )
    if test_id:
        q = q.filter(models.TestResult.test_id == test_id)
    if student_id:
        q = q.filter(models.TestResult.student_id == student_id)
    rows = q.order_by(models.TestResult.created_at.desc()).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "성적"
    ws.append(["학생명", "학년", "반", "시험명", "과목", "점수", "총점", "백분율(%)", "시행일"])

    for r in rows:
        student = r.student
        test    = r.test
        class_name = student.classes[0].name if student and student.classes else ""
        pct = round(r.score / r.total * 100) if r.total else ""
        ws.append([
            student.name if student else "",
            test.grade if test else "",
            class_name,
            test.title if test else "",
            test.subject if test else "",
            r.score,
            r.total,
            pct,
            str(test.test_date) if test and test.test_date else "",
        ])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=results.xlsx"},
    )
