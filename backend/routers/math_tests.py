from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from datetime import date
from database import get_db
from models import MathTest

router = APIRouter(prefix="/math-tests", tags=["math-tests"])


class MathTestIn(BaseModel):
    title: str
    grade: str
    test_date: date
    num_questions: int = 0


class MathTestUpdate(BaseModel):
    title: str
    grade: str
    test_date: date
    num_questions: int


class AnswersIn(BaseModel):
    answers: List[int]


class MathTestOut(BaseModel):
    id: int
    title: str
    grade: str
    test_date: date
    num_questions: int
    has_answers: bool
    class Config:
        from_attributes = True


class MathTestDetailOut(MathTestOut):
    answers: List[int]


def _has_answers(answers: list) -> bool:
    return bool(answers) and any(a > 0 for a in answers)


@router.get("", response_model=List[MathTestOut])
def list_math_tests(db: Session = Depends(get_db)):
    tests = db.query(MathTest).order_by(MathTest.test_date.desc()).all()
    return [MathTestOut(
        id=t.id, title=t.title, grade=t.grade, test_date=t.test_date,
        num_questions=t.num_questions, has_answers=_has_answers(t.answers or [])
    ) for t in tests]


@router.post("", response_model=MathTestOut)
def create_math_test(body: MathTestIn, db: Session = Depends(get_db)):
    test = MathTest(
        title=body.title, grade=body.grade,
        test_date=body.test_date, num_questions=body.num_questions,
        answers=[],
    )
    db.add(test)
    db.commit()
    db.refresh(test)
    return MathTestOut(
        id=test.id, title=test.title, grade=test.grade, test_date=test.test_date,
        num_questions=test.num_questions, has_answers=False
    )


@router.put("/{test_id}", response_model=MathTestOut)
def update_math_test(test_id: int, body: MathTestUpdate, db: Session = Depends(get_db)):
    test = db.query(MathTest).filter(MathTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Not found")
    test.title = body.title
    test.grade = body.grade
    test.test_date = body.test_date
    if body.num_questions != test.num_questions:
        test.num_questions = body.num_questions
        # 정답 배열 길이 맞춤
        answers = list(test.answers or [])
        if len(answers) < body.num_questions:
            answers += [0] * (body.num_questions - len(answers))
        else:
            answers = answers[:body.num_questions]
        test.answers = answers
    db.commit()
    db.refresh(test)
    return MathTestOut(
        id=test.id, title=test.title, grade=test.grade, test_date=test.test_date,
        num_questions=test.num_questions, has_answers=_has_answers(test.answers or [])
    )


@router.get("/{test_id}/answers")
def get_answers(test_id: int, db: Session = Depends(get_db)):
    test = db.query(MathTest).filter(MathTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Not found")
    answers = list(test.answers or [])
    if len(answers) < test.num_questions:
        answers += [0] * (test.num_questions - len(answers))
    return {"answers": answers}


@router.put("/{test_id}/answers")
def update_answers(test_id: int, body: AnswersIn, db: Session = Depends(get_db)):
    test = db.query(MathTest).filter(MathTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Not found")
    test.answers = body.answers
    test.num_questions = len(body.answers)
    db.commit()
    return {"ok": True}


@router.delete("/{test_id}", status_code=204)
def delete_math_test(test_id: int, db: Session = Depends(get_db)):
    test = db.query(MathTest).filter(MathTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Not found")
    db.delete(test)
    db.commit()
