"""
입학테스트 스캔본 PDF → Supabase historical_students 적재 스크립트

폴더 구조:
  입학테스트 스캔본/
    배정확정/         → outcome = "배정확정"
    등록불가 및 포기/ → outcome = "등록불가"

필요 패키지:
  pip3 install pymupdf anthropic psycopg2-binary --break-system-packages
"""

import os
import json
import base64
import psycopg2
from psycopg2.extras import execute_values
from urllib.parse import urlparse
from pathlib import Path
import anthropic

# ── 설정 ──────────────────────────────────────────────────────────────────────
NAS_ROOT = "/DCPRIME/3. 선생님/3. 선생님/원장/입학테스트 스캔본"
FOLDERS = {
    "배정확정": "배정확정",
    "등록불가 및 포기": "등록불가",
}

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres.kofiuihaklvscrabqaqc:dcprime0979!@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres"
)
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

EXTRACT_PROMPT = """이 이미지는 학원 입학테스트 답안지입니다. 아래 정보를 JSON으로 추출해주세요.

추출 항목:
- name: 학생 이름 (문자열)
- grade: 학년 (고1/고2/고3/중1/중2/중3/초5/초6 중 하나, 없으면 null)
- school: 학교명 (없으면 null)
- subject: 과목 (수학/영어/국어/과학 중 하나, 없으면 null)
- score: 획득 점수 (숫자, 없으면 null)
- total: 만점 (숫자, 없으면 null)
- question_results: 문항별 정오답 객체 {"1": true/false, "2": true/false, ...}
  - O 표시 = true (정답), X 표시 = false (오답)
  - 채점 표시가 없는 문항은 포함하지 마세요

반드시 JSON만 반환하고 다른 텍스트는 쓰지 마세요.
예시: {"name": "홍길동", "grade": "고1", "school": "능곡고", "subject": "수학", "score": 85, "total": 100, "question_results": {"1": true, "2": false, "3": true}}
"""


def pdf_to_images(pdf_path: str) -> list[bytes]:
    """PDF 각 페이지를 PNG bytes로 변환"""
    import fitz  # pymupdf
    doc = fitz.open(pdf_path)
    images = []
    for page in doc:
        mat = fitz.Matrix(2.0, 2.0)  # 2배 해상도
        pix = page.get_pixmap(matrix=mat)
        images.append(pix.tobytes("png"))
    doc.close()
    return images


def extract_with_claude(images: list[bytes], client: anthropic.Anthropic) -> dict:
    """Claude Vision으로 답안지 정보 추출"""
    content = []
    for i, img_bytes in enumerate(images[:4]):  # 최대 4페이지
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": base64.standard_b64encode(img_bytes).decode()
            }
        })
    content.append({"type": "text", "text": EXTRACT_PROMPT})

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": content}]
    )
    raw = response.content[0].text.strip()
    # JSON 블록 파싱
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw)


def main():
    if not ANTHROPIC_API_KEY:
        print("❌ ANTHROPIC_API_KEY 환경변수를 설정해주세요")
        return

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    p = urlparse(DATABASE_URL)
    conn = psycopg2.connect(
        host=p.hostname, port=p.port or 5432,
        dbname=p.path.lstrip("/"), user=p.username, password=p.password,
    )
    cur = conn.cursor()

    # 이미 처리된 파일 목록
    cur.execute("SELECT source_file FROM historical_students WHERE source_file IS NOT NULL")
    already_done = {row[0] for row in cur.fetchall()}
    print(f"이미 처리된 파일: {len(already_done)}개")

    total_ok = 0
    total_skip = 0
    total_err = 0

    for folder_name, outcome in FOLDERS.items():
        folder_path = Path(NAS_ROOT) / folder_name
        if not folder_path.exists():
            print(f"⚠️  폴더 없음: {folder_path}")
            continue

        pdfs = list(folder_path.glob("*.pdf")) + list(folder_path.glob("*.PDF"))
        print(f"\n📂 {folder_name} ({outcome}): {len(pdfs)}개")

        for pdf_path in pdfs:
            rel_name = str(pdf_path.name)

            if rel_name in already_done:
                print(f"  ⏭️  스킵: {rel_name}")
                total_skip += 1
                continue

            print(f"  🔍 처리중: {rel_name} ... ", end="", flush=True)
            try:
                images = pdf_to_images(str(pdf_path))
                data = extract_with_claude(images, client)

                name = data.get("name") or rel_name
                grade = data.get("grade")
                school = data.get("school")
                subject = data.get("subject")
                score = data.get("score")
                total_q = data.get("total")
                score_pct = round(score / total_q * 100) if score and total_q else None
                q_results = data.get("question_results", {})

                cur.execute(
                    """INSERT INTO historical_students
                       (name, grade, school, subject, score, total, score_pct, outcome, source_file)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (name, grade, school, subject, score, total_q, score_pct, outcome, rel_name)
                )
                hs_id = cur.fetchone()[0]

                if q_results:
                    rows = [
                        (hs_id, int(qno), bool(is_correct))
                        for qno, is_correct in q_results.items()
                        if isinstance(is_correct, bool)
                    ]
                    execute_values(
                        cur,
                        "INSERT INTO historical_question_results (historical_student_id, question_no, is_correct) VALUES %s",
                        rows
                    )

                conn.commit()
                print(f"✓ {name} / {grade} / {subject} / {score}/{total_q} / 문항{len(q_results)}개")
                total_ok += 1

            except Exception as e:
                conn.rollback()
                print(f"❌ 오류: {e}")
                total_err += 1

    cur.close()
    conn.close()
    print(f"\n완료: 성공 {total_ok}개 | 스킵 {total_skip}개 | 오류 {total_err}개")


if __name__ == "__main__":
    main()
