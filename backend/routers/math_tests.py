from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from pathlib import Path
from config import UPLOAD_DIR
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


class TagsIn(BaseModel):
    tags: dict  # {"1": "함수", "2": "인수분해", ...}


class PointWeightsIn(BaseModel):
    point_weights: dict  # {"1": 3.0, "2": 3.0, ...}


class MathTestOut(BaseModel):
    id: int
    title: str
    grade: str
    test_date: date
    num_questions: int
    has_answers: bool
    tags: dict = {}
    tips: dict = {}
    point_weights: dict = {}
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
        num_questions=t.num_questions, has_answers=_has_answers(t.answers or []),
        tags=t.tags or {}, tips=t.tips or {}, point_weights=t.point_weights or {}
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
        num_questions=test.num_questions, has_answers=False, tags={}, tips={}, point_weights={}
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
        num_questions=test.num_questions, has_answers=_has_answers(test.answers or []),
        tags=test.tags or {}, tips=test.tips or {}, point_weights=test.point_weights or {}
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


@router.get("/{test_id}/tags")
def get_tags(test_id: int, db: Session = Depends(get_db)):
    test = db.query(MathTest).filter(MathTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Not found")
    return {"tags": test.tags or {}}


@router.put("/{test_id}/tags")
def update_tags(test_id: int, body: TagsIn, db: Session = Depends(get_db)):
    test = db.query(MathTest).filter(MathTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Not found")
    test.tags = body.tags
    db.commit()
    return {"ok": True}


@router.delete("/{test_id}", status_code=204)
def delete_math_test(test_id: int, db: Session = Depends(get_db)):
    test = db.query(MathTest).filter(MathTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Not found")
    db.delete(test)
    db.commit()


def _extract_hwp_text(path: str) -> str:
    """HWP 파일에서 PrvText(미리보기 텍스트) 추출"""
    try:
        import olefile
        f = olefile.OleFileIO(path)
        prv = f.openstream('PrvText').read()
        return prv.decode('utf-16-le', errors='ignore')
    except Exception as e:
        return f"HWP 텍스트 추출 실패: {e}"


def _extract_pdf_text(path: str) -> str:
    """PDF에서 텍스트 추출"""
    try:
        import pdfplumber
        text = ""
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                text += (page.extract_text() or "") + "\n"
        return text
    except Exception as e:
        return f"PDF 텍스트 추출 실패: {e}"


@router.get("/{test_id}/tips")
def get_tips(test_id: int, db: Session = Depends(get_db)):
    test = db.query(MathTest).filter(MathTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Not found")
    return {"tips": test.tips or {}}


@router.put("/{test_id}/tips")
def update_tips(test_id: int, body: dict, db: Session = Depends(get_db)):
    test = db.query(MathTest).filter(MathTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Not found")
    test.tips = body.get("tips", {})
    db.commit()
    return {"ok": True}


@router.get("/{test_id}/point-weights")
def get_point_weights(test_id: int, db: Session = Depends(get_db)):
    test = db.query(MathTest).filter(MathTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Not found")
    return {"point_weights": test.point_weights or {}}


@router.put("/{test_id}/point-weights")
def update_point_weights(test_id: int, body: PointWeightsIn, db: Session = Depends(get_db)):
    test = db.query(MathTest).filter(MathTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Not found")
    test.point_weights = body.point_weights
    db.commit()
    return {"ok": True}


@router.post("/{test_id}/analyze-paper")
async def analyze_paper(
    request: Request,
    test_id: int,
    paper: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """HWP/PDF 시험지 업로드 → AI가 문항별 개념태그+학습팁 자동 생성 후 DB 저장"""
    import re, json
    from ai_utils import ai_text_call

    test = db.query(MathTest).filter(MathTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "시험을 찾을 수 없습니다")

    content = await paper.read()
    suffix = Path(paper.filename or "paper.hwp").suffix.lower()
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = UPLOAD_DIR / f"paper_analyze_{test_id}{suffix}"
    tmp_path.write_bytes(content)

    if suffix == ".hwp":
        paper_text = _extract_hwp_text(str(tmp_path))
    elif suffix == ".pdf":
        paper_text = _extract_pdf_text(str(tmp_path))
    else:
        raise HTTPException(400, "HWP 또는 PDF 파일만 지원됩니다")

    num_q = test.num_questions or 17
    prompt = f"""다음은 수학 시험지의 텍스트입니다 (수식 일부는 이미지라 누락됨).
시험명: {test.title}, 학년: {test.grade}, 문항 수: {num_q}문항

시험지 텍스트:
{paper_text[:4000]}

위 시험지를 분석하여 각 문항(1번~{num_q}번)에 대해:
1. 핵심 출제 개념/유형 태그 (예: "나머지정리와 인수정리", "이차함수의 최대·최소")
2. 해당 문항에서 학생이 틀리기 쉬운 이유와 학습 조언 한 문장 (한국어, 구체적으로)

반드시 아래 JSON 형식으로만 응답하세요. 다른 설명 없이 JSON만:
{{
  "tags": {{
    "1": "개념태그",
    "2": "개념태그",
    ...
    "{num_q}": "개념태그"
  }},
  "tips": {{
    "1": "틀리기 쉬운 이유 — 학습 조언",
    "2": "틀리기 쉬운 이유 — 학습 조언",
    ...
    "{num_q}": "틀리기 쉬운 이유 — 학습 조언"
  }}
}}"""

    try:
        raw = ai_text_call(prompt, max_tokens=4000)
        # JSON 추출 (마크다운 코드블록 처리)
        m = re.search(r'\{[\s\S]+\}', raw)
        if not m:
            raise HTTPException(500, f"AI 응답 파싱 실패: {raw[:200]}")
        data = json.loads(m.group(0))
    except json.JSONDecodeError as e:
        raise HTTPException(500, f"AI JSON 파싱 오류: {e}")

    test.tags = data.get("tags", {})
    test.tips = data.get("tips", {})
    db.commit()

    return {"tags": test.tags, "tips": test.tips, "num_questions": num_q}
