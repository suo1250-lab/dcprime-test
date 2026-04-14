from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from models import TeacherWordConfig, Class, Student

router = APIRouter(prefix="/word-config", tags=["word-config"])

class TeacherConfigIn(BaseModel):
    word_test_id: Optional[int] = None
    day_start: Optional[int] = None
    day_end: Optional[int] = None

class ClassConfigIn(BaseModel):
    word_test_id: Optional[int] = None
    word_day_start: Optional[int] = None
    word_day_end: Optional[int] = None

@router.get("/teachers")
def list_teacher_configs(db: Session = Depends(get_db)):
    # Get all unique teacher names from students
    teacher_names = [r[0] for r in db.query(Student.teacher).filter(Student.teacher != None).distinct().all()]
    configs = {c.teacher_name: c for c in db.query(TeacherWordConfig).all()}
    result = []
    for name in sorted(set(teacher_names)):
        c = configs.get(name)
        result.append({
            "teacher_name": name,
            "word_test_id": c.word_test_id if c else None,
            "word_test_title": c.word_test.title if c and c.word_test else None,
            "day_start": c.day_start if c else None,
            "day_end": c.day_end if c else None,
        })
    return result

@router.put("/teachers/{teacher_name}")
def upsert_teacher_config(teacher_name: str, body: TeacherConfigIn, db: Session = Depends(get_db)):
    if body.day_start is not None and body.day_end is not None and body.day_start > body.day_end:
        raise HTTPException(400, "day_start는 day_end보다 작거나 같아야 합니다")
    c = db.query(TeacherWordConfig).filter(TeacherWordConfig.teacher_name == teacher_name).first()
    if c:
        c.word_test_id = body.word_test_id
        c.day_start = body.day_start
        c.day_end = body.day_end
    else:
        c = TeacherWordConfig(teacher_name=teacher_name, word_test_id=body.word_test_id,
                              day_start=body.day_start, day_end=body.day_end)
        db.add(c)
    db.commit()
    return {"status": "ok"}

@router.get("/classes")
def list_class_configs(db: Session = Depends(get_db)):
    classes = db.query(Class).order_by(Class.name).all()
    return [{
        "id": c.id,
        "name": c.name,
        "grade": c.grade,
        "word_test_id": c.word_test_id,
        "word_test_title": c.word_test.title if c.word_test else None,
        "word_day_start": c.word_day_start,
        "word_day_end": c.word_day_end,
    } for c in classes]

@router.put("/classes/{class_id}")
def update_class_config(class_id: int, body: ClassConfigIn, db: Session = Depends(get_db)):
    c = db.query(Class).filter(Class.id == class_id).first()
    if not c:
        raise HTTPException(404, "Not found")
    if body.word_day_start is not None and body.word_day_end is not None and body.word_day_start > body.word_day_end:
        raise HTTPException(400, "day_start는 day_end보다 작거나 같아야 합니다")
    c.word_test_id = body.word_test_id
    c.word_day_start = body.word_day_start
    c.word_day_end = body.word_day_end
    db.commit()
    return {"status": "ok"}
