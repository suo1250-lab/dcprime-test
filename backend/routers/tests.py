import json
import re
import tempfile
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from ai_utils import ai_call
from config import MAX_UPLOAD_PDF
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date
from database import get_db
import models

router = APIRouter(prefix="/tests", tags=["tests"])


class TestCreate(BaseModel):
    title: str
    grade: str
    subject: str
    question_count: int
    answers: dict          # {"1": "3", "2": "1", ...}
    test_date: date


class TestOut(BaseModel):
    id: int
    title: str
    grade: str
    subject: str
    question_count: int
    answers: dict
    test_date: date

    class Config:
        from_attributes = True


@router.get("", response_model=list[TestOut])
def list_tests(grade: Optional[str] = None, subject: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.Test)
    if grade:
        q = q.filter(models.Test.grade == grade)
    if subject:
        q = q.filter(models.Test.subject == subject)
    return q.order_by(models.Test.test_date.desc()).all()


@router.get("/{test_id}", response_model=TestOut)
def get_test(test_id: int, db: Session = Depends(get_db)):
    test = db.get(models.Test, test_id)
    if not test:
        raise HTTPException(404, "테스트를 찾을 수 없습니다")
    return test


@router.post("", response_model=TestOut, status_code=201)
def create_test(data: TestCreate, db: Session = Depends(get_db)):
    test = models.Test(**data.model_dump())
    db.add(test)
    db.commit()
    db.refresh(test)
    return test


@router.put("/{test_id}", response_model=TestOut)
def update_test(test_id: int, data: TestCreate, db: Session = Depends(get_db)):
    test = db.get(models.Test, test_id)
    if not test:
        raise HTTPException(404, "테스트를 찾을 수 없습니다")
    for k, v in data.model_dump().items():
        setattr(test, k, v)
    db.commit()
    db.refresh(test)
    return test


@router.get("/{test_id}/tags")
def get_tags(test_id: int, db: Session = Depends(get_db)):
    tags = db.query(models.TestQuestionTag).filter(models.TestQuestionTag.test_id == test_id).all()
    return {str(t.question_no): t.tag for t in tags}


@router.put("/{test_id}/tags")
def save_tags(test_id: int, tags: dict, db: Session = Depends(get_db)):
    # tags = {"1": "이차방정식", "2": "함수", ...}
    db.query(models.TestQuestionTag).filter(models.TestQuestionTag.test_id == test_id).delete()
    for qno, tag in tags.items():
        if tag and tag.strip():
            db.add(models.TestQuestionTag(test_id=test_id, question_no=int(qno), tag=tag.strip()))
    db.commit()
    return {"saved": len(tags)}


@router.delete("/{test_id}", status_code=204)
def delete_test(test_id: int, db: Session = Depends(get_db)):
    test = db.get(models.Test, test_id)
    if not test:
        raise HTTPException(404, "테스트를 찾을 수 없습니다")
    db.delete(test)
    db.commit()


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]+?)```")

def _extract_answers(pdf_path: str) -> dict:
    prompt = """이 이미지는 시험 답안지입니다.
각 문항 번호와 정답을 추출하여 JSON 객체로만 응답하세요. 다른 텍스트 없이 JSON만:
{"1": "3", "2": "①", "3": "2", ...}

객관식은 번호(1~5 또는 ①~⑤), 주관식은 답 텍스트 그대로."""

    text = ai_call(pdf_path, prompt, max_tokens=2000)

    m = _JSON_FENCE_RE.search(text.strip())
    if m:
        text = m.group(1).strip()
    result = json.loads(text.strip())
    if not isinstance(result, dict):
        raise ValueError(f"AI 응답이 dict 형식이 아닙니다: {type(result)}")
    return result


@router.post("/extract-pdf")
async def extract_pdf_answers(pdf: UploadFile = File(...)):
    if not pdf.filename or not pdf.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "PDF 파일만 업로드 가능합니다")
    pdf_bytes = await pdf.read()
    if len(pdf_bytes) > MAX_UPLOAD_PDF:
        raise HTTPException(413, "PDF 파일이 너무 큽니다 (최대 200MB)")
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name
        answers = _extract_answers(tmp_path)
    except json.JSONDecodeError:
        raise HTTPException(500, "AI 응답 파싱 실패. 다시 시도해주세요.")
    except Exception as e:
        raise HTTPException(500, f"AI 추출 실패: {e}")
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)

    return {"answers": answers, "question_count": len(answers)}
