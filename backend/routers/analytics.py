import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
import models
from models import student_classes
from ai_utils import ai_text_call

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]+?)```")

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/questions/{test_id}")
def question_stats(test_id: int, db: Session = Depends(get_db)):
    """문항별 정답률/오답률 + 정답자/오답자가 속한 반 분포"""
    test = db.get(models.Test, test_id)
    if not test:
        raise HTTPException(404, "테스트를 찾을 수 없습니다")

    # 전체 응시자
    total_students = (
        db.query(func.count(models.TestResult.id))
        .filter_by(test_id=test_id)
        .scalar()
    )
    if total_students == 0:
        return {"test_id": test_id, "total_students": 0, "questions": []}

    # 문항별 집계
    rows = (
        db.query(
            models.QuestionResult.question_no,
            models.QuestionResult.is_correct,
            func.count(models.QuestionResult.id).label("cnt"),
        )
        .join(models.TestResult)
        .filter(models.TestResult.test_id == test_id)
        .group_by(models.QuestionResult.question_no, models.QuestionResult.is_correct)
        .all()
    )

    stats: dict[int, dict] = {}
    for q_no, is_correct, cnt in rows:
        if q_no not in stats:
            stats[q_no] = {"question_no": q_no, "correct": 0, "incorrect": 0}
        if is_correct:
            stats[q_no]["correct"] = cnt
        else:
            stats[q_no]["incorrect"] = cnt

    # 정답자/오답자 반 분포
    class_rows = (
        db.query(
            models.QuestionResult.question_no,
            models.QuestionResult.is_correct,
            models.Class.name,
            func.count(models.QuestionResult.id).label("cnt"),
        )
        .join(models.TestResult, models.QuestionResult.result_id == models.TestResult.id)
        .join(models.Student, models.TestResult.student_id == models.Student.id)
        .outerjoin(student_classes, student_classes.c.student_id == models.Student.id)
        .outerjoin(models.Class, models.Class.id == student_classes.c.class_id)
        .filter(models.TestResult.test_id == test_id)
        .group_by(
            models.QuestionResult.question_no,
            models.QuestionResult.is_correct,
            models.Class.name,
        )
        .all()
    )

    for q_no, is_correct, class_name, cnt in class_rows:
        if q_no not in stats:
            continue
        key = "correct_classes" if is_correct else "incorrect_classes"
        if key not in stats[q_no]:
            stats[q_no][key] = []
        stats[q_no][key].append({"class_name": class_name or "미배정", "count": cnt})

    questions = sorted(stats.values(), key=lambda x: x["question_no"])
    for q in questions:
        total = q["correct"] + q["incorrect"]
        q["correct_rate"] = round(q["correct"] / total * 100, 1) if total else 0
        q["incorrect_rate"] = round(q["incorrect"] / total * 100, 1) if total else 0

    return {
        "test_id": test_id,
        "test_title": test.title,
        "total_students": total_students,
        "questions": questions,
    }


@router.get("/assign/{test_id}")
def auto_assign(test_id: int, db: Session = Depends(get_db)):
    """점수 기준 자동 반 배정 추천"""
    rules = db.query(models.ClassRule).filter_by(test_id=test_id).all()
    if not rules:
        raise HTTPException(400, "이 테스트에 배정 규칙이 없습니다")

    results = (
        db.query(models.TestResult)
        .filter_by(test_id=test_id)
        .all()
    )

    assignments = []
    for r in results:
        pct = round(r.score / r.total * 100) if r.total else 0
        matched_class = None
        for rule in rules:
            if rule.min_score <= pct <= rule.max_score:
                matched_class = rule.class_
                break
        assignments.append({
            "student_id": r.student_id,
            "student_name": r.student.name,
            "score": r.score,
            "total": r.total,
            "score_pct": pct,
            "recommended_class_id": matched_class.id if matched_class else None,
            "recommended_class_name": matched_class.name if matched_class else "미배정",
        })

    return {"test_id": test_id, "assignments": assignments}


@router.get("/weakness/{student_id}/{test_id}")
def get_weakness(student_id: int, test_id: int, db: Session = Depends(get_db)):
    result = db.query(models.TestResult).filter(
        models.TestResult.student_id == student_id,
        models.TestResult.test_id == test_id
    ).first()
    if not result:
        raise HTTPException(404, "결과를 찾을 수 없습니다")

    tags_map = {t.question_no: t.tag for t in
                db.query(models.TestQuestionTag).filter(models.TestQuestionTag.test_id == test_id).all()}

    tag_stats = {}
    for qr in result.question_results:
        tag = tags_map.get(qr.question_no, "미분류")
        if tag not in tag_stats:
            tag_stats[tag] = {"tag": tag, "wrong": 0, "total": 0, "wrong_questions": []}
        tag_stats[tag]["total"] += 1
        if not qr.is_correct:
            tag_stats[tag]["wrong"] += 1
            tag_stats[tag]["wrong_questions"].append(qr.question_no)

    result_list = []
    for stat in tag_stats.values():
        stat["wrong_rate"] = round(stat["wrong"] / stat["total"] * 100) if stat["total"] else 0
        result_list.append(stat)
    result_list.sort(key=lambda x: x["wrong"], reverse=True)

    student = db.get(models.Student, student_id)
    test = db.get(models.Test, test_id)
    return {
        "student_name": student.name if student else "",
        "test_title": test.title if test else "",
        "grade": student.grade if student else "",
        "score": result.score,
        "total": result.total,
        "tags": result_list
    }


@router.post("/weakness/{student_id}/{test_id}/generate")
def generate_worksheet(student_id: int, test_id: int, db: Session = Depends(get_db)):
    import json
    from fastapi.responses import HTMLResponse

    result = db.query(models.TestResult).filter(
        models.TestResult.student_id == student_id,
        models.TestResult.test_id == test_id
    ).first()
    if not result:
        raise HTTPException(404, "결과를 찾을 수 없습니다")

    student = db.get(models.Student, student_id)
    test = db.get(models.Test, test_id)

    tags_map = {t.question_no: t.tag for t in
                db.query(models.TestQuestionTag).filter(models.TestQuestionTag.test_id == test_id).all()}

    # Get weak tags (wrong > 0)
    tag_stats = {}
    for qr in result.question_results:
        tag = tags_map.get(qr.question_no, None)
        if not tag:
            continue  # skip untagged
        if tag not in tag_stats:
            tag_stats[tag] = {"wrong": 0, "total": 0}
        tag_stats[tag]["total"] += 1
        if not qr.is_correct:
            tag_stats[tag]["wrong"] += 1

    weak_tags = [tag for tag, s in tag_stats.items() if s["wrong"] > 0]
    if not weak_tags:
        raise HTTPException(400, "태그된 문항 중 틀린 문항이 없습니다")

    subject = test.subject if test else "수학"
    grade = student.grade if student else ""

    prompt = f"""학생 정보: {grade}, 과목: {subject}
취약 유형: {', '.join(weak_tags)}

위 취약 유형별로 {grade} 수준에 맞는 연습 문제를 각 5문제씩 만들어주세요.
문제는 실제 시험 형식으로 구체적으로 작성하세요.

JSON으로만 응답:
{{
  "유형명": [
    {{"problem": "문제 내용", "answer": "정답", "hint": "풀이 힌트(선택)"}},
    ...
  ]
}}"""

    try:
        text = ai_text_call(prompt, max_tokens=4000)
        m = _JSON_FENCE_RE.search(text.strip())
        if m:
            text = m.group(1).strip()
        problems = json.loads(text.strip())
    except Exception as e:
        raise HTTPException(500, f"AI 생성 실패: {e}")

    from datetime import date
    today = date.today().strftime("%Y년 %m월 %d일")
    student_name = student.name if student else ""
    test_title = test.title if test else ""

    sections_html = ""
    answer_html = ""

    for tag, probs in problems.items():
        rows = ""
        ans_rows = ""
        for i, p in enumerate(probs, 1):
            hint = f'<div class="hint">힌트: {p["hint"]}</div>' if p.get("hint") else ""
            rows += f'<div class="problem"><span class="pno">{i}.</span><span class="ptxt">{p["problem"]}</span>{hint}<div class="blank"></div></div>'
            ans_rows += f'<span class="ans-item"><b>{i}.</b> {p["answer"]}</span>'
        sections_html += f'<div class="section"><div class="tag-label">{tag}</div>{rows}</div>'
        answer_html += f'<div class="ans-block"><b>[{tag}]</b> {ans_rows}</div>'

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>취약 유형 집중 문제 - {student_name}</title>
<style>
  @page {{ margin: 20mm; }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.6; }}
  .header {{ border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }}
  .header h1 {{ font-size: 17px; color: #4f46e5; }}
  .header .meta {{ font-size: 12px; color: #555; text-align: right; }}
  .section {{ margin-bottom: 28px; page-break-inside: avoid; }}
  .tag-label {{ background: #eef2ff; color: #4f46e5; font-weight: bold; padding: 4px 12px; border-radius: 4px; display: inline-block; margin-bottom: 10px; font-size: 12px; letter-spacing: 0.3px; }}
  .problem {{ padding: 8px 0 8px 16px; border-bottom: 1px solid #f0f0f0; }}
  .pno {{ color: #4f46e5; font-weight: bold; margin-right: 8px; }}
  .hint {{ font-size: 11px; color: #888; margin-top: 2px; margin-left: 20px; }}
  .blank {{ height: 28px; border-bottom: 1px solid #999; margin: 6px 20px 0; }}
  .answer-key {{ margin-top: 32px; border-top: 2px dashed #ddd; padding-top: 14px; }}
  .answer-key h2 {{ font-size: 12px; color: #888; margin-bottom: 10px; }}
  .ans-block {{ margin-bottom: 8px; font-size: 12px; }}
  .ans-item {{ margin-right: 16px; }}
  .print-btn {{ margin-bottom: 20px; padding: 8px 20px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }}
  @media print {{ .print-btn {{ display: none; }} }}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">인쇄 / PDF 저장</button>
<div class="header">
  <h1>취약 유형 집중 문제</h1>
  <div class="meta">
    이름: <b>{student_name}</b> ({grade})<br>
    시험: {test_title}<br>
    취약 유형: {', '.join(weak_tags)}<br>
    {today}
  </div>
</div>
{sections_html}
<div class="answer-key">
  <h2>▼ 정답</h2>
  {answer_html}
</div>
</body>
</html>"""

    return HTMLResponse(content=html)


@router.post("/assign/{test_id}/ai")
def ai_recommend_assign(test_id: int, db: Session = Depends(get_db)):
    """AI 기반 반 편성 추천"""
    import json

    test = db.get(models.Test, test_id)
    if not test:
        raise HTTPException(404, "테스트를 찾을 수 없습니다")

    results = db.query(models.TestResult).filter_by(test_id=test_id).all()
    if not results:
        raise HTTPException(400, "응시 결과가 없습니다")

    classes = db.query(models.Class).all()
    if not classes:
        raise HTTPException(400, "등록된 반이 없습니다")

    class_info = "\n".join([
        f"- {c.name} (학년: {c.grade or '미지정'}, 과목: {c.subject or '미지정'})"
        for c in classes
    ])
    student_scores = "\n".join([
        f"- {r.student.name} ({r.student.grade}): {r.score}/{r.total} ({round(r.score/r.total*100) if r.total else 0}%)"
        for r in results
    ])

    prompt = f"""다음 학생들을 입학시험 결과를 기반으로 아래 반 중 하나에 배정해주세요.

시험: {test.title} ({test.grade}, {test.subject})

배정 가능한 반:
{class_info}

학생별 점수:
{student_scores}

각 학생에 대해 적합한 반을 추천하고 이유를 간단히 설명하세요.
반드시 JSON 배열로만 응답하세요:
[
  {{"student_name": "학생명", "recommended_class": "반 이름", "reason": "배정 이유 1-2문장"}},
  ...
]"""

    try:
        text = ai_text_call(prompt, max_tokens=3000)
        m = _JSON_FENCE_RE.search(text.strip())
        if m:
            text = m.group(1).strip()
        recommendations = json.loads(text.strip())
    except Exception as e:
        raise HTTPException(500, f"AI 추천 실패: {e}")

    class_map = {c.name: c for c in classes}
    enriched = []
    for rec in recommendations:
        result_row = next((r for r in results if r.student.name == rec["student_name"]), None)
        class_obj = class_map.get(rec["recommended_class"])
        if not class_obj:
            for c in classes:
                if rec["recommended_class"] in c.name or c.name in rec["recommended_class"]:
                    class_obj = c
                    break
        enriched.append({
            "student_id": result_row.student_id if result_row else None,
            "student_name": rec["student_name"],
            "score": result_row.score if result_row else 0,
            "total": result_row.total if result_row else 0,
            "score_pct": round(result_row.score / result_row.total * 100) if result_row and result_row.total else 0,
            "recommended_class_id": class_obj.id if class_obj else None,
            "recommended_class_name": rec["recommended_class"],
            "reason": rec.get("reason", ""),
        })

    return {"test_id": test_id, "assignments": enriched}


@router.get("/math/questions/{test_id}")
def math_question_stats(test_id: int, db: Session = Depends(get_db)):
    """수학 시험 문항별 오답률 분석"""
    test = db.get(models.MathTest, test_id)
    if not test:
        raise HTTPException(404, "시험을 찾을 수 없습니다")

    subs = db.query(models.MathSubmission).filter(
        models.MathSubmission.math_test_id == test_id,
        models.MathSubmission.status == "graded",
    ).all()

    if not subs:
        return {"test_id": test_id, "test_title": test.title, "total_students": 0, "questions": []}

    tags_map = test.tags or {}
    stats: dict[int, dict] = {}
    for s in subs:
        for item in s.items:
            q = item.question_no
            if q not in stats:
                stats[q] = {"question_no": q, "correct": 0, "incorrect": 0, "tag": tags_map.get(str(q))}
            if item.is_correct:
                stats[q]["correct"] += 1
            else:
                stats[q]["incorrect"] += 1

    questions = sorted(stats.values(), key=lambda x: x["question_no"])
    for q in questions:
        total = q["correct"] + q["incorrect"]
        q["correct_rate"] = round(q["correct"] / total * 100, 1) if total else 0
        q["incorrect_rate"] = round(q["incorrect"] / total * 100, 1) if total else 0

    avg_scores = [round(s.score / s.total * 100, 1) for s in subs if s.total and s.total > 0]
    return {
        "test_id": test_id,
        "test_title": test.title,
        "grade": test.grade,
        "total_students": len(subs),
        "avg_score": round(sum(avg_scores) / len(avg_scores), 1) if avg_scores else None,
        "questions": questions,
    }


@router.post("/assign/{test_id}/confirm")
def confirm_assign(test_id: int, overrides: dict[int, int], db: Session = Depends(get_db)):
    """
    반 배정 확정. overrides = {student_id: class_id, ...}
    먼저 auto_assign 결과를 가져와 overrides로 덮어쓴 후 DB에 저장.
    """
    results = db.query(models.TestResult).filter_by(test_id=test_id).all()
    rules = db.query(models.ClassRule).filter_by(test_id=test_id).all()

    updated = []
    for r in results:
        if r.student_id in overrides:
            class_id = overrides[r.student_id]
        else:
            pct = round(r.score / r.total * 100) if r.total else 0
            class_id = None
            for rule in rules:
                if rule.min_score <= pct <= rule.max_score:
                    class_id = rule.class_id
                    break

        student = db.get(models.Student, r.student_id)
        if student:
            if class_id is not None:
                cls = db.get(models.Class, class_id)
                if cls and cls not in student.classes:
                    student.classes.append(cls)
            updated.append({"student_id": r.student_id, "class_id": class_id})

    db.commit()
    return {"updated": len(updated), "assignments": updated}
