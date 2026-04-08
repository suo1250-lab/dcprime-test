import base64
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List
from datetime import date
from database import get_db
from models import WordTest, WordTestItem
from config import ANTHROPIC_API_KEY, XAI_API_KEY, GEMINI_API_KEY

router = APIRouter(prefix="/word-tests", tags=["word-tests"])

class ItemIn(BaseModel):
    item_no: int
    question: str
    answer: str

class WordTestIn(BaseModel):
    title: str
    grade: str
    direction: str
    test_date: date
    items: List[ItemIn] = []

class WordTestUpdate(BaseModel):
    title: str
    grade: str
    direction: str
    test_date: date

class WordTestOut(BaseModel):
    id: int
    title: str
    grade: str
    direction: str
    test_date: date
    item_count: int
    class Config:
        from_attributes = True

class ItemOut(BaseModel):
    id: int
    item_no: int
    question: str
    answer: str
    class Config:
        from_attributes = True

class WordTestDetailOut(BaseModel):
    id: int
    title: str
    grade: str
    direction: str
    test_date: date
    items: List[ItemOut]
    class Config:
        from_attributes = True

@router.get("", response_model=List[WordTestOut])
def list_word_tests(db: Session = Depends(get_db)):
    rows = (
        db.query(WordTest, func.count(WordTestItem.id).label("cnt"))
        .outerjoin(WordTestItem, WordTestItem.word_test_id == WordTest.id)
        .group_by(WordTest.id)
        .order_by(WordTest.test_date.desc())
        .all()
    )
    return [WordTestOut(id=t.id, title=t.title, grade=t.grade, direction=t.direction, test_date=t.test_date, item_count=cnt) for t, cnt in rows]

@router.post("", response_model=WordTestDetailOut)
def create_word_test(body: WordTestIn, db: Session = Depends(get_db)):
    test = WordTest(title=body.title, grade=body.grade, direction=body.direction, test_date=body.test_date)
    db.add(test)
    db.flush()
    for item in body.items:
        db.add(WordTestItem(word_test_id=test.id, item_no=item.item_no, question=item.question, answer=item.answer))
    db.commit()
    db.refresh(test)
    return test

@router.get("/{test_id}", response_model=WordTestDetailOut)
def get_word_test(test_id: int, db: Session = Depends(get_db)):
    test = db.query(WordTest).filter(WordTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Not found")
    return test

@router.put("/{test_id}", response_model=WordTestOut)
def update_word_test(test_id: int, body: WordTestUpdate, db: Session = Depends(get_db)):
    test = db.query(WordTest).filter(WordTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Not found")
    test.title = body.title
    test.grade = body.grade
    test.direction = body.direction
    test.test_date = body.test_date
    db.commit()
    db.refresh(test)
    cnt = db.query(func.count(WordTestItem.id)).filter(WordTestItem.word_test_id == test_id).scalar()
    return WordTestOut(id=test.id, title=test.title, grade=test.grade, direction=test.direction, test_date=test.test_date, item_count=cnt)

@router.delete("/{test_id}", status_code=204)
def delete_word_test(test_id: int, db: Session = Depends(get_db)):
    test = db.query(WordTest).filter(WordTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Not found")
    db.delete(test)
    db.commit()

@router.get("/{test_id}/items/by-day")
def get_items_by_day(test_id: int, day_start: int = 1, day_end: int = 999, db: Session = Depends(get_db)):
    """단어장에서 day 범위에 해당하는 단어만 반환"""
    test = db.query(WordTest).filter(WordTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Not found")
    items = [i for i in test.items if i.day is not None and day_start <= i.day <= day_end]
    if not items:
        items = test.items  # day 정보 없으면 전체 반환
    return {
        "title": test.title,
        "direction": test.direction,
        "items": [{"item_no": idx + 1, "question": i.question, "answer": i.answer, "day": i.day} for idx, i in enumerate(items)],
    }


@router.put("/{test_id}/items", response_model=WordTestDetailOut)
def update_items(test_id: int, items: List[ItemIn], db: Session = Depends(get_db)):
    test = db.query(WordTest).filter(WordTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Not found")
    db.query(WordTestItem).filter(WordTestItem.word_test_id == test_id).delete()
    for item in items:
        db.add(WordTestItem(word_test_id=test_id, item_no=item.item_no, question=item.question, answer=item.answer))
    db.commit()
    db.refresh(test)
    return test


def _pdf_to_images_b64(pdf_bytes: bytes) -> list[tuple[str, str]]:
    """PDF를 페이지별 base64 이미지로 변환. (data, media_type) 튜플 리스트 반환."""
    import fitz  # PyMuPDF
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    images = []
    for page in doc:
        mat = fitz.Matrix(2.0, 2.0)  # 2x 해상도
        pix = page.get_pixmap(matrix=mat)
        png_bytes = pix.tobytes("png")
        images.append((base64.standard_b64encode(png_bytes).decode(), "image/png"))
    doc.close()
    return images


def _direction_label(direction: str) -> str:
    return {
        "EN_KR": "영어(문제) → 한국어(정답)",
        "KR_EN": "한국어(문제) → 영어(정답)",
        "MIXED": "한영/영한 혼합 (각 문항의 방향이 다를 수 있습니다)",
    }.get(direction, "한국어(문제) → 영어(정답)")


def _extract_prompt(direction: str) -> str:
    dir_label = _direction_label(direction)
    mixed_note = (
        "\n각 문항의 문제와 정답 방향을 개별적으로 파악하여 추출하세요."
        if direction == "MIXED" else ""
    )
    return f"""이 이미지는 영어 단어 시험지 또는 정답지입니다.
방향: {dir_label}{mixed_note}

문항 번호, 문제(question), 정답(answer)을 모두 추출하여 JSON 배열로만 응답하세요. 다른 텍스트 없이 JSON만:
[
  {{"item_no": 1, "question": "문제", "answer": "정답"}},
  ...
]"""


def _extract_with_gemini(images: list, direction: str) -> list:
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=GEMINI_API_KEY)
    parts = [types.Part.from_text(text=_extract_prompt(direction))]
    for data, media_type in images:
        parts.append(types.Part.from_bytes(data=base64.b64decode(data), mime_type=media_type))
    response = client.models.generate_content(
        model="gemini-2.5-pro-exp-03-25",
        contents=parts,
    )
    text = response.text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else ""
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


def _extract_with_grok(images: list, direction: str) -> list:
    from openai import OpenAI
    client  = OpenAI(api_key=XAI_API_KEY, base_url="https://api.x.ai/v1")
    content = []
    for data, media_type in images:
        content.append({"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{data}"}})
    content.append({"type": "text", "text": _extract_prompt(direction)})
    resp = client.chat.completions.create(
        model="grok-2-vision-latest",
        messages=[{"role": "user", "content": content}],
        max_tokens=4000,
    )
    text = resp.choices[0].message.content.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else ""
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


@router.post("/{test_id}/extract-pdf")
async def extract_pdf(test_id: int, pdf: UploadFile = File(...), db: Session = Depends(get_db)):
    test = db.query(WordTest).filter(WordTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Not found")

    if not GEMINI_API_KEY and not XAI_API_KEY and not ANTHROPIC_API_KEY:
        raise HTTPException(400, "AI API 키가 설정되지 않았습니다.")

    if not pdf.filename or not pdf.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "PDF 파일만 업로드 가능합니다")

    pdf_bytes = await pdf.read()
    try:
        images = _pdf_to_images_b64(pdf_bytes)
    except Exception as e:
        raise HTTPException(500, f"PDF 변환 실패: {e}")

    try:
        if GEMINI_API_KEY:
            items = _extract_with_gemini(images, test.direction)
            ai_used = "gemini"
        elif XAI_API_KEY:
            items = _extract_with_grok(images, test.direction)
            ai_used = "grok"
        else:
            from config import ANTHROPIC_API_KEY as _akey
            import anthropic
            client = anthropic.Anthropic(api_key=_akey)
            content = []
            for data, media_type in images:
                content.append({"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}})
            content.append({"type": "text", "text": _extract_prompt(test.direction)})
            resp = client.messages.create(model="claude-sonnet-4-6", max_tokens=4000, messages=[{"role": "user", "content": content}])
            text = resp.content[0].text.strip()
            if text.startswith("```"):
                parts = text.split("```")
                text = parts[1] if len(parts) > 1 else ""
                if text.startswith("json"):
                    text = text[4:]
            items = json.loads(text.strip())
            ai_used = "claude"
    except json.JSONDecodeError:
        raise HTTPException(500, "AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.")
    except Exception as e:
        raise HTTPException(500, f"AI 추출 실패: {e}")

    return {"items": items, "ai": ai_used}
