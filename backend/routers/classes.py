from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
import models

router = APIRouter(prefix="/classes", tags=["classes"])


class ClassCreate(BaseModel):
    name: str
    grade: str
    subject: str


class ClassOut(BaseModel):
    id: int
    name: str
    grade: str
    subject: str

    class Config:
        from_attributes = True


class ClassRuleCreate(BaseModel):
    test_id: int
    class_id: int
    min_score: int
    max_score: int


class ClassRuleOut(BaseModel):
    id: int
    test_id: int
    class_id: int
    min_score: int
    max_score: int
    class_name: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("", response_model=list[ClassOut])
def list_classes(grade: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.Class)
    if grade:
        q = q.filter(models.Class.grade == grade)
    return q.order_by(models.Class.grade, models.Class.name).all()


@router.post("", response_model=ClassOut, status_code=201)
def create_class(data: ClassCreate, db: Session = Depends(get_db)):
    cls = models.Class(**data.model_dump())
    db.add(cls)
    db.commit()
    db.refresh(cls)
    return cls


@router.get("/{class_id}/members")
def get_class_members(class_id: int, db: Session = Depends(get_db)):
    cls = db.get(models.Class, class_id)
    if not cls:
        raise HTTPException(404, "반을 찾을 수 없습니다")
    students = sorted(cls.students, key=lambda s: (s.grade, s.name))
    return {
        "class_id": class_id,
        "class_name": cls.name,
        "grade": cls.grade,
        "subject": cls.subject,
        "students": [
            {"id": s.id, "name": s.name, "grade": s.grade, "school": s.school or ""}
            for s in students
        ],
    }


@router.delete("/{class_id}", status_code=204)
def delete_class(class_id: int, db: Session = Depends(get_db)):
    cls = db.get(models.Class, class_id)
    if not cls:
        raise HTTPException(404, "반을 찾을 수 없습니다")
    db.delete(cls)
    db.commit()


# 반 배정 규칙
@router.get("/rules/{test_id}", response_model=list[ClassRuleOut])
def get_rules(test_id: int, db: Session = Depends(get_db)):
    rules = db.query(models.ClassRule).filter_by(test_id=test_id).all()
    result = []
    for r in rules:
        out = ClassRuleOut(
            id=r.id,
            test_id=r.test_id,
            class_id=r.class_id,
            min_score=r.min_score,
            max_score=r.max_score,
            class_name=r.class_.name if r.class_ else None,
        )
        result.append(out)
    return result


@router.post("/rules", response_model=ClassRuleOut, status_code=201)
def create_rule(data: ClassRuleCreate, db: Session = Depends(get_db)):
    rule = models.ClassRule(**data.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return ClassRuleOut(
        id=rule.id,
        test_id=rule.test_id,
        class_id=rule.class_id,
        min_score=rule.min_score,
        max_score=rule.max_score,
        class_name=rule.class_.name if rule.class_ else None,
    )


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.get(models.ClassRule, rule_id)
    if not rule:
        raise HTTPException(404, "규칙을 찾을 수 없습니다")
    db.delete(rule)
    db.commit()
