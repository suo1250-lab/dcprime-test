"""
NAS 폴더 감시 자동채점 모듈 v2
/app/nas/미채점/단어시험/   → 단어시험 자동채점  → WordSubmission 저장
/app/nas/미채점/입학테스트/ → 입학테스트 자동채점 → TestResult 저장

완료 파일: {GRADED}/YYYYMMDD_반이름_학생이름.pdf
오류 파일: {ERROR_DIR}/
미매칭:    {UNMATCHED_DIR}/  (DB에 학생 없는 경우)
"""
import re
import io
import time
import shutil
import json
import tempfile
from difflib import SequenceMatcher
from pathlib import Path
from datetime import date
from threading import Thread, Semaphore
from logger import get_logger

log = get_logger("watcher")

# 동시 AI 처리 최대 3개 제한 (rate limit + DB 연결 풀 보호)
_PROCESS_SEMAPHORE = Semaphore(3)
_SEMAPHORE_TIMEOUT = 120  # 초: AI API 응답 대기 최대 시간

# M-3: regex 모듈 레벨에서 한 번만 컴파일
_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]+?)```")
_DAY_SPLIT_RE  = re.compile(r'(DAY\s*\d+)', re.IGNORECASE)
from watchdog.observers.polling import PollingObserver as Observer
from watchdog.events import FileSystemEventHandler
from config import (
    UNGRADED_WORD, UNGRADED_ENTRANCE, UNGRADED_MATH,
    GRADED_WORD, GRADED_ENTRANCE, GRADED_MATH,
    ERROR_DIR, UNMATCHED_DIR, LOCAL_BACKUP,
    ANSWER_ENTRANCE, ANSWER_WORD, ANSWER_MATH,
)
from ai_utils import ai_call as _ai_call_util, ai_text_call
from database import SessionLocal
import models

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
PDF_EXT    = {".pdf"}
HWP_EXT    = {".hwp", ".hwpx"}


def _ensure_dirs():
    for d in [UNGRADED_WORD, UNGRADED_ENTRANCE, UNGRADED_MATH,
              GRADED_WORD, GRADED_ENTRANCE, GRADED_MATH,
              ERROR_DIR, UNMATCHED_DIR, LOCAL_BACKUP,
              ANSWER_ENTRANCE, ANSWER_WORD, ANSWER_MATH]:
        d.mkdir(parents=True, exist_ok=True)


def _save_local_backup(data: bytes, name: str):
    """NAS 장애 대비 로컬 복사본 저장"""
    try:
        (LOCAL_BACKUP / name).write_bytes(data)
    except Exception:
        pass


# ── AI 공통 호출 ──────────────────────────────────────────────
def _ai_call(file_path: str, prompt: str, max_tokens: int = 2000) -> str:
    """
    이미지(jpg/png/webp) 또는 PDF를 AI에 전달하여 텍스트 응답 반환.
    ai_utils 모듈에 위임.
    """
    return _ai_call_util(file_path, prompt, max_tokens)


def _parse_json(text: str):
    text = text.strip()
    m = _JSON_FENCE_RE.search(text)
    if m:
        text = m.group(1).strip()
    if not text:
        raise ValueError("AI 응답이 비어있습니다")
    return json.loads(text)


# ── PDF 유틸 ───────────────────────────────────────────────────
def _extract_pdf_pages(src_doc, pages: list) -> bytes:
    """fitz 문서에서 특정 페이지만 추출 → 새 PDF bytes 반환"""
    import fitz
    new_doc = fitz.open()
    for pg in pages:
        new_doc.insert_pdf(src_doc, from_page=pg, to_page=pg)
    buf = io.BytesIO()
    new_doc.save(buf)
    new_doc.close()
    return buf.getvalue()


# ── 학생 수 자동 감지 ─────────────────────────────────────────
def _detect_students_in_pdf(pdf_path: str, paper_type: str) -> list:
    """
    PDF 전체를 AI로 스캔 → 학생 목록 + 페이지 범위 반환.
    Returns: [{"name": "홍길동", "class_name": "A반", "pages": [0, 1]}, ...]
    페이지 번호는 0-based.
    """
    if paper_type == "word":
        prompt = """이 PDF는 영어 단어 시험지 묶음입니다.
각 학생의 시험지가 몇 페이지에 걸쳐 있는지 분석하세요.
다음 JSON 배열로만 응답하세요 (다른 텍스트 없이):
[
  {"name": "학생이름", "class_name": "반이름(없으면 빈문자열)", "pages": [0]},
  {"name": "학생이름2", "class_name": "", "pages": [1, 2]}
]
페이지 번호는 0부터 시작합니다."""
    else:
        prompt = """이 PDF는 입학 시험 답안지 묶음입니다.
각 학생의 답안지가 몇 페이지에 걸쳐 있는지 분석하세요.
다음 JSON 배열로만 응답하세요 (다른 텍스트 없이):
[
  {"name": "학생이름", "class_name": "반이름(없으면 빈문자열)", "pages": [0, 1]},
  {"name": "학생이름2", "class_name": "", "pages": [2, 3]}
]
페이지 번호는 0부터 시작합니다."""

    text = _ai_call(pdf_path, prompt, max_tokens=1000)
    return _parse_json(text)


# ── 파일명 생성 ────────────────────────────────────────────────
def _make_graded_filename(student: models.Student, db, suffix: str = ".pdf") -> str:
    """YYYYMMDD_반이름_학생이름{suffix} 형식"""
    today      = date.today().strftime("%Y%m%d")
    class_name = student.classes[0].name if student.classes else ""
    return f"{today}_{class_name}_{student.name}{suffix}"


def _unique_dest(dest: Path) -> Path:
    """동명 파일 충돌 방지: 파일명_2.pdf, 파일명_3.pdf ..."""
    if not dest.exists():
        return dest
    stem, suffix = dest.stem, dest.suffix
    i = 2
    while True:
        candidate = dest.parent / f"{stem}_{i}{suffix}"
        if not candidate.exists():
            return candidate
        i += 1


def _move_to_error(filepath: Path):
    try:
        shutil.move(str(filepath), str(ERROR_DIR / filepath.name))
    except Exception:
        pass


def _save_unmatched(pdf_bytes: bytes, student_name: str):
    """DB 미매칭 학생 파일 → 미매칭 폴더"""
    today = date.today().strftime("%Y%m%d")
    dest  = _unique_dest(UNMATCHED_DIR / f"미매칭_{today}_{student_name}.pdf")
    try:
        dest.write_bytes(pdf_bytes)
        log.info(f"[Watcher] 미매칭 저장: {dest.name}")
    except Exception as e:
        log.error(f"[Watcher] 미매칭 저장 실패: {e}")


# ── 시험지 정보 읽기 ───────────────────────────────────────────
def _read_paper_info(file_path: str, paper_type: str) -> dict:
    """이미지 또는 PDF에서 학생 기본 정보 추출"""
    if paper_type == "word":
        prompt = """이 시험지에서 다음 정보를 JSON으로 추출하세요. 다른 텍스트 없이 JSON만 반환:
{"student_name": "학생 이름", "class_name": "반 이름(없으면 빈 문자열)", "direction": "KR_EN 또는 EN_KR 또는 MIXED"}
direction: 한국어→영어면 KR_EN, 영어→한국어면 EN_KR, 혼합이면 MIXED. 판단 불가면 KR_EN."""
    else:
        prompt = """이 답안지에서 다음 정보를 JSON으로 추출하세요. 다른 텍스트 없이 JSON만 반환:
{"student_name": "학생 이름", "class_name": "반 이름(없으면 빈 문자열)", "test_title": "시험 제목 (예: 2025년 3월 고1 수학)"}"""

    text = _ai_call(file_path, prompt, max_tokens=500)
    return _parse_json(text)


# ── 채점 함수 ──────────────────────────────────────────────────
def _grade_word_no_key(file_path: str, direction: str = "KR_EN") -> list:
    """단어시험 채점 (답지 없이 AI 자체 지식으로). direction: KR_EN | EN_KR | MIXED
    is_correct: true=O, false=X, null=△(애매)
    """
    direction_label = {
        "KR_EN": "한국어를 보고 영어로 쓰는 시험입니다",
        "EN_KR": "영어를 보고 한국어로 쓰는 시험입니다",
        "MIXED": "한영/영한 혼합 시험입니다. 각 문항 방향에 맞게 채점하세요",
    }.get(direction, "영어 단어 시험입니다")

    prompt = f"""이것은 학생이 손으로 작성한 영어 단어 시험지입니다. {direction_label}
정답지 없이 AI 지식으로 직접 채점하세요. 필체가 엉망이어도 최대한 판독하세요.

채점 기준:
- 명확히 맞으면 is_correct: true (O)
- 명확히 틀리면 is_correct: false (X)
- 필체 판독 불가 / 철자 일부 틀림 / 애매한 경우 is_correct: null (△)

JSON 배열로만 응답:
[{{"item_no": 1, "question": "문제어", "student_answer": "학생이 쓴 내용", "correct_answer": "정답", "is_correct": true}}, ...]"""
    text = _ai_call(file_path, prompt, max_tokens=3000)
    return _parse_json(text)


def _grade_entrance(file_path: str, answers: dict) -> list:
    """입학테스트 채점"""
    # M-1: 답안 값을 문자열로 강제 변환하고 개행/제어문자 제거하여 프롬프트 인젝션 방어
    answer_key = "\n".join(
        [f"{no}번: {str(ans).replace(chr(10), ' ').replace(chr(13), ' ')[:20]}"
         for no, ans in sorted(answers.items(), key=lambda x: int(x[0]))]
    )
    prompt = f"""이것은 학생이 작성한 입학 시험 답안지입니다.
아래 정답지를 참고하여 각 문항의 학생 답과 정오를 판별하세요.

정답지:
{answer_key}

JSON 배열로만 응답:
[{{"question_no": 1, "student_answer": "3", "is_correct": true}}, ...]"""
    text = _ai_call(file_path, prompt, max_tokens=2000)
    return _parse_json(text)


# ── DB 매칭 ────────────────────────────────────────────────────
def _name_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def _match_student(db, name: str, class_name: str = ""):
    # 1. 정확히 일치
    students = db.query(models.Student).filter(models.Student.name == name).all()
    if students:
        if len(students) == 1:
            return students[0]
        if class_name:
            cls = db.query(models.Class).filter(
                models.Class.name.ilike(f"%{class_name}%")
            ).first()
            if cls:
                matched = [s for s in students if any(c.id == cls.id for c in s.classes)]
                if matched:
                    return matched[0]
        return students[0]

    # 2. 반 기반 유사 매칭: 같은 반 학생 중 SequenceMatcher 유사도로 찾기
    SIMILARITY_THRESHOLD = 0.6
    if class_name:
        cls = db.query(models.Class).filter(
            models.Class.name.ilike(f"%{class_name}%")
        ).first()
        if cls:
            class_students = db.query(models.Student).filter(
                models.Student.classes.any(models.Class.id == cls.id)
            ).all()
            candidates = [
                (s, _name_similarity(name, s.name))
                for s in class_students
            ]
            candidates = [(s, r) for s, r in candidates if r >= SIMILARITY_THRESHOLD]
            if candidates:
                candidates.sort(key=lambda x: -x[1])
                best, best_ratio = candidates[0]
                # 동점 후보 없거나 2위와 차이가 0.1 이상이면 확정
                if len(candidates) == 1 or (len(candidates) >= 2 and candidates[0][1] - candidates[1][1] >= 0.1):
                    log.info(f"[Watcher] 반 기반 유사 매칭: '{name}' → '{best.name}' ({class_name}, {best_ratio:.2f})")
                    return best

    # 3. 전체 유사 매칭 (반 정보 없는 경우 fallback)
    all_students = db.query(models.Student).all()
    candidates = [
        (s, _name_similarity(name, s.name))
        for s in all_students
    ]
    candidates = [(s, r) for s, r in candidates if r >= SIMILARITY_THRESHOLD]
    if candidates:
        candidates.sort(key=lambda x: -x[1])
        best, best_ratio = candidates[0]
        if len(candidates) == 1 or (len(candidates) >= 2 and candidates[0][1] - candidates[1][1] >= 0.1):
            log.info(f"[Watcher] 유사 매칭: '{name}' → '{best.name}' ({best_ratio:.2f})")
            return best

    return None


def _match_word_test(db, word_range: str):
    wt = db.query(models.WordTest).filter(
        models.WordTest.title.ilike(f"%{word_range}%")
    ).first()
    if wt:
        return wt
    numbers = re.findall(r'\d+', word_range)
    if numbers:
        for candidate in db.query(models.WordTest).all():
            cand_numbers = re.findall(r'\d+', candidate.title)
            if set(numbers) & set(cand_numbers):
                return candidate
    return None


def _find_word_config(db, student):
    """반 설정 우선, 없으면 선생님 설정 사용. (word_test_id, day_start, day_end) 반환."""
    if student.classes:
        cls = student.classes[0]
        if cls and cls.word_test_id:
            return cls.word_test_id, cls.word_day_start, cls.word_day_end
    if student.teacher:
        config = db.query(models.TeacherWordConfig).filter(
            models.TeacherWordConfig.teacher_name == student.teacher
        ).first()
        if config and config.word_test_id:
            return config.word_test_id, config.day_start, config.day_end
    return None, None, None


def _read_student_answers(file_path: str, direction: str) -> list:
    """시험지에서 학생이 쓴 문제+답 읽기. AI가 정오 판단하지 않고 읽기만."""
    dir_label = {"KR_EN": "한국어(문제)→영어(답)", "EN_KR": "영어(문제)→한국어(답)"}.get(direction, "")
    prompt = f"""이 시험지에서 각 문항의 문제와 학생이 쓴 답을 읽으세요. {dir_label}
정오 판단은 절대 하지 마세요. 읽은 내용만 JSON 배열로 (다른 텍스트 없이):
[{{"item_no": 1, "question": "문제 텍스트", "student_answer": "학생이 쓴 답"}}, ...]"""
    text = _ai_call(file_path, prompt, max_tokens=3000)
    return _parse_json(text)


def _grade_with_word_list(student_answers: list, word_items: list, day_start=None, day_end=None,
                          correct_threshold: float = 0.85, ambiguous_threshold: float = 0.65) -> list:
    """DB 단어장과 비교하여 채점. day 범위 필터 및 채점 강도 임계값 적용."""
    if day_start is not None and day_end is not None:
        filtered = [i for i in word_items if i.day is not None and day_start <= i.day <= day_end]
        if not filtered:
            filtered = word_items  # day 정보 없으면 전체 사용
    else:
        filtered = word_items

    key_map = {item.question.strip().lower(): item for item in filtered}

    results = []
    for sa in student_answers:
        question = sa.get("question", "").strip()
        student_ans = sa.get("student_answer", "").strip()

        key_item = key_map.get(question.lower())
        if not key_item:
            for k, v in key_map.items():
                if question.lower() in k or k in question.lower():
                    key_item = v
                    break

        if key_item:
            correct_answer = key_item.answer.strip()
            ratio = SequenceMatcher(None, student_ans.lower().strip(), correct_answer.lower().strip()).ratio()
            if ratio >= correct_threshold:
                is_correct = True   # O
            elif ratio >= ambiguous_threshold:
                is_correct = None   # △ (애매 – 선생님 확인)
            else:
                is_correct = False  # X
        else:
            correct_answer = ""
            is_correct = None

        results.append({
            "item_no": sa.get("item_no", 0),
            "question": question,
            "student_answer": student_ans,
            "correct_answer": correct_answer,
            "is_correct": is_correct,
        })
    return results


def _match_test(db, test_title: str):
    t = db.query(models.Test).filter(
        models.Test.title.ilike(f"%{test_title}%")
    ).first()
    if t:
        return t
    for word in test_title.split():
        if len(word) < 2:
            continue
        t = db.query(models.Test).filter(
            models.Test.title.ilike(f"%{word}%")
        ).first()
        if t:
            return t
    return None


# ── 핵심 채점 처리 ─────────────────────────────────────────────
# [버그 수정] out_suffix 파라미터 추가
#   - 이미지 입력(jpg/png): 원본 확장자 유지 (process_word_file에서 filepath.suffix 전달)
#   - PDF 입력: .pdf 유지 (process_pdf_file에서 ".pdf" 전달)
#
# [버그 수정] image_path 일관성
#   - core 함수는 DB flush만 하고 commit은 caller가 담당
#   - caller가 _unique_dest 결정 후 image_path 설정 → 그후 commit
#   - 실제 저장 경로와 DB 경로 불일치 방지
def _process_word_core(file_path: Path, db, out_suffix: str = ".pdf") -> tuple:
    """
    단어시험: 정보 추출 → AI 채점 → 학생 매칭 → DB flush (commit은 caller)
    매칭 실패 시 status="unmatched"로 DB 저장 후 ValueError("미매칭저장:이름") 발생
    Returns: (new_name: str, submission: models.WordSubmission)
    """
    info         = _read_paper_info(str(file_path), "word")
    student_name = info.get("student_name", "").strip()
    class_name   = info.get("class_name", "").strip()
    direction    = info.get("direction", "KR_EN").strip() or "KR_EN"

    if not student_name:
        raise ValueError("학생 이름을 읽지 못했습니다")

    # 학생 매칭 (반 기반 우선)
    student = _match_student(db, student_name, class_name)

    if not student:
        # 채점 먼저 (미매칭 저장용)
        results = _grade_word_no_key(str(file_path), direction)
        if not results:
            raise ValueError("AI 채점 결과가 비어있습니다")
        score = sum(1 for r in results if r.get("is_correct") is True)

        # 미매칭: 원본 파일을 미매칭 폴더에 복사 후 image_path 설정
        today = date.today().strftime("%Y%m%d")
        unmatched_dest = _unique_dest(UNMATCHED_DIR / f"미매칭_{today}_{student_name}{file_path.suffix}")
        try:
            shutil.copy2(str(file_path), str(unmatched_dest))
        except Exception as copy_err:
            log.error(f"[Watcher] 미매칭 파일 복사 실패: {copy_err}")
            unmatched_dest = None

        submission = models.WordSubmission(
            word_test_id=None,
            student_name=student_name,
            grade=class_name or "미상",
            direction=direction,
            status="unmatched",
            score=score,
            total=len(results),
            image_path=str(unmatched_dest) if unmatched_dest else None,
        )
        db.add(submission)
        db.flush()
        for r in results:
            db.add(models.WordSubmissionItem(
                submission_id=submission.id,
                item_no=r["item_no"],
                question=r.get("question", ""),
                correct_answer=r.get("correct_answer", ""),
                student_answer=r.get("student_answer", ""),
                is_correct=r.get("is_correct"),
            ))
        db.flush()
        log.warning(f"[Watcher] ⚠ 미매칭 저장: {student_name} ({score}/{len(results)})")
        raise ValueError(f"미매칭저장:{student_name}")

    new_name = _make_graded_filename(student, db, suffix=out_suffix)

    # 단어장 설정 조회 (반 우선 → 선생님 fallback)
    word_test_id, day_start, day_end = _find_word_config(db, student)

    if word_test_id:
        # 답지 기반 채점
        word_test_obj = db.get(models.WordTest, word_test_id)
        if word_test_obj is None:
            log.warning(f"[Watcher] ⚠ word_test_id={word_test_id} 가 삭제된 상태 → 무채점 모드로 fallback")
            results = _grade_word_no_key(str(file_path), direction)
        else:
            student_answers = _read_student_answers(str(file_path), direction)
            c_thr = word_test_obj.correct_threshold if word_test_obj.correct_threshold is not None else 0.85
            a_thr = word_test_obj.ambiguous_threshold if word_test_obj.ambiguous_threshold is not None else 0.65
            results = _grade_with_word_list(student_answers, word_test_obj.items, day_start, day_end,
                                            correct_threshold=c_thr, ambiguous_threshold=a_thr)
            direction = word_test_obj.direction
            log.info(f"[Watcher] 답지 기반 채점: {word_test_obj.title} DAY{day_start}-{day_end} (정답={c_thr}, 애매={a_thr})")
    else:
        results = _grade_word_no_key(str(file_path), direction)

    if not results:
        raise ValueError("AI 채점 결과가 비어있습니다")

    score = sum(1 for r in results if r.get("is_correct") is True)

    submission = models.WordSubmission(
        word_test_id=word_test_id,
        student_name=student.name,
        grade=student.grade,
        direction=direction,
        status="confirmed",
        score=score,
        total=len(results),
        image_path=None,
    )
    db.add(submission)
    db.flush()

    for r in results:
        db.add(models.WordSubmissionItem(
            submission_id=submission.id,
            item_no=r["item_no"],
            question=r.get("question", ""),
            correct_answer=r.get("correct_answer", ""),
            student_answer=r.get("student_answer", ""),
            is_correct=r.get("is_correct"),
        ))

    db.flush()
    log.info(f"[Watcher] ✓ {new_name} | 단어시험({direction}) | {score}/{len(results)}")
    return new_name, submission


def _process_entrance_core(file_path: Path, db, out_suffix: str = ".pdf") -> tuple:
    """
    입학테스트: 정보 추출 → AI 채점 → DB flush (commit은 caller)
    Returns: (new_name: str, result: models.TestResult)
    """
    info         = _read_paper_info(str(file_path), "entrance")
    student_name = info.get("student_name", "").strip()
    class_name   = info.get("class_name", "").strip()
    test_title   = info.get("test_title", "").strip()

    if not student_name:
        raise ValueError("학생 이름을 읽지 못했습니다")

    student = _match_student(db, student_name, class_name)
    if not student:
        raise ValueError(f"미매칭:{student_name}")

    test = _match_test(db, test_title)
    if not test:
        raise ValueError(f"시험 미매칭: {test_title}")

    results = _grade_entrance(str(file_path), test.answers)
    if not results:
        raise ValueError("AI 채점 결과가 비어있습니다")

    score = sum(1 for r in results if r.get("is_correct"))

    existing = db.query(models.TestResult).filter_by(
        student_id=student.id, test_id=test.id
    ).first()
    if existing:
        db.delete(existing)
        db.flush()

    result = models.TestResult(
        student_id=student.id,
        test_id=test.id,
        score=score,
        total=len(results),
    )
    db.add(result)
    db.flush()

    for r in results:
        db.add(models.QuestionResult(
            result_id=result.id,
            question_no=r["question_no"],
            is_correct=r.get("is_correct", False),
        ))

    db.flush()
    new_name = _make_graded_filename(student, db, suffix=out_suffix)
    log.info(f"[Watcher] ✓ {new_name} | {test.title} | {score}/{len(results)}")
    return new_name, result


# ── 단일 이미지 파일 처리 ──────────────────────────────────────
def process_word_file(filepath: Path):
    """이미지 단어시험 파일 처리. 원본 확장자 유지."""
    db = SessionLocal()
    try:
        log.info(f"[Watcher] 단어시험 처리 시작: {filepath.name}")
        new_name, submission = _process_word_core(filepath, db, out_suffix=filepath.suffix)
        dest = _unique_dest(GRADED_WORD / new_name)
        # 파일 먼저 이동 후 commit (역순이면 commit 후 이동 실패 시 DB-파일 불일치 발생)
        _save_local_backup(filepath.read_bytes(), dest.name)
        shutil.move(str(filepath), str(dest))
        submission.image_path = str(dest)
        db.commit()
    except ValueError as e:
        if str(e).startswith("미매칭저장:"):
            # DB에 미매칭 submission이 flush된 상태 → commit 후 원본 삭제
            db.commit()
            filepath.unlink(missing_ok=True)
        else:
            log.error(f"[Watcher] ✗ {filepath.name}: {e}")
            db.rollback()
            _move_to_error(filepath)
    except Exception as e:
        log.error(f"[Watcher] ✗ {filepath.name}: {e}")
        db.rollback()
        _move_to_error(filepath)
    finally:
        db.close()


def process_entrance_file(filepath: Path):
    """이미지 입학테스트 파일 처리. 원본 확장자 유지."""
    db = SessionLocal()
    try:
        log.info(f"[Watcher] 입학테스트 처리 시작: {filepath.name}")
        new_name, _ = _process_entrance_core(filepath, db, out_suffix=filepath.suffix)
        dest = _unique_dest(GRADED_ENTRANCE / new_name)
        _save_local_backup(filepath.read_bytes(), dest.name)
        shutil.move(str(filepath), str(dest))
        db.commit()
    except Exception as e:
        log.error(f"[Watcher] ✗ {filepath.name}: {e}")
        db.rollback()
        if str(e).startswith("미매칭:"):
            _save_unmatched(filepath.read_bytes(), str(e).split(":", 1)[1].strip())
            filepath.unlink(missing_ok=True)
        else:
            _move_to_error(filepath)
    finally:
        db.close()


# ── 멀티페이지 PDF 처리 v2 ──────────────────────────────────────
def process_pdf_file(filepath: Path, paper_type: str):
    """
    PDF 처리 v2 플로우:
      1. AI로 전체 PDF 스캔 → 학생 수 + 페이지 범위 감지 (케이스 1-1/1-2 자동 구분)
      2. 학생별 페이지 추출 → 임시 PDF (fitz)
      3. 임시 PDF로 AI 채점 → DB flush
      4. _unique_dest 결정 → image_path 설정 → DB commit
      5. YYYYMMDD_반_이름.pdf 로 채점완료 저장
      6. 원본 합본 PDF 삭제
    미매칭 학생 → 미매칭/ 폴더 저장
    전체 실패   → 미채점오류/ 이동
    """
    import fitz

    log.info(f"[Watcher] PDF 처리 시작: {filepath.name} (타입: {paper_type})")

    try:
        doc = fitz.open(str(filepath))
    except Exception as e:
        log.error(f"[Watcher] ✗ PDF 열기 실패: {e}")
        _move_to_error(filepath)
        return

    total_pages = len(doc)
    log.info(f"[Watcher] 총 {total_pages}페이지")

    # Step 1: AI로 학생 목록 + 페이지 범위 스캔
    try:
        students_info = _detect_students_in_pdf(str(filepath), paper_type)
        log.info(f"[Watcher] AI 감지: {len(students_info)}명")
    except Exception as e:
        log.error(f"[Watcher] ✗ 학생 감지 실패: {e}")
        doc.close()
        _move_to_error(filepath)
        return

    if not students_info:
        log.info("[Watcher] 학생 감지 결과 없음")
        doc.close()
        _move_to_error(filepath)
        return

    success_count = 0
    fail_count    = 0

    # Step 2-5: 학생별 순차 처리
    for s_info in students_info:
        s_name = s_info.get("name", "미상").strip()
        pages  = s_info.get("pages", [])

        if not pages:
            log.error(f"[Watcher] ✗ {s_name}: 페이지 정보 없음")
            fail_count += 1
            continue

        valid_pages = [p for p in pages if isinstance(p, int) and 0 <= p < total_pages]
        if not valid_pages:
            log.error(f"[Watcher] ✗ {s_name}: 유효하지 않은 페이지 {pages}")
            fail_count += 1
            continue

        # Step 2: 해당 페이지만 추출 → PDF bytes
        try:
            pdf_bytes = _extract_pdf_pages(doc, valid_pages)
        except Exception as e:
            log.error(f"[Watcher] ✗ {s_name}: 페이지 추출 실패: {e}")
            fail_count += 1
            continue

        # 임시 PDF 파일로 저장 (_ai_call이 파일 경로 요구)
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as _tmp:
            _tmp.write(pdf_bytes)
            tmp_path = Path(_tmp.name)

        db = SessionLocal()
        try:
            # Step 3: 채점 + DB flush
            if paper_type == "word":
                new_name, submission = _process_word_core(tmp_path, db, out_suffix=".pdf")
            else:
                new_name, _ = _process_entrance_core(tmp_path, db, out_suffix=".pdf")

            # Step 4: 실제 저장 경로 결정 → 파일 먼저 저장 → image_path 업데이트 → commit
            graded_dir = GRADED_WORD if paper_type == "word" else GRADED_ENTRANCE
            dest = _unique_dest(graded_dir / new_name)

            # Step 5: 채점완료 폴더에 PDF 저장 (파일 먼저, commit 나중)
            dest.write_bytes(pdf_bytes)
            _save_local_backup(pdf_bytes, dest.name)
            if paper_type == "word":
                submission.image_path = str(dest)
            db.commit()
            success_count += 1
            log.info(f"[Watcher] ✓ 저장: {dest.name}")

        except ValueError as e:
            if str(e).startswith("미매칭저장:"):
                # DB에 미매칭 submission flush됨 → commit 후 계속 진행
                db.commit()
                fail_count += 1
            else:
                log.error(f"[Watcher] ✗ {s_name}: {e}")
                db.rollback()
                err_name = f"오류_{s_name}.pdf"
                try:
                    _unique_dest(ERROR_DIR / err_name).write_bytes(pdf_bytes)
                except Exception:
                    pass
                fail_count += 1
        except Exception as e:
            log.error(f"[Watcher] ✗ {s_name}: {e}")
            db.rollback()
            err_name = f"오류_{s_name}.pdf"
            try:
                _unique_dest(ERROR_DIR / err_name).write_bytes(pdf_bytes)
            except Exception:
                pass
            fail_count += 1

        finally:
            db.close()
            tmp_path.unlink(missing_ok=True)

    doc.close()

    # Step 6: 원본 합본 PDF 처리
    if success_count > 0:
        try:
            filepath.unlink()
            log.info(f"[Watcher] 원본 삭제: {filepath.name} ({success_count}성공/{fail_count}실패)")
        except Exception as e:
            log.error(f"[Watcher] 원본 삭제 실패: {e}")
    else:
        _move_to_error(filepath)
        log.error(f"[Watcher] PDF 전체 실패: {filepath.name}")


# ── HWP 텍스트 추출 ───────────────────────────────────────────
def _extract_hwp_text(filepath: Path) -> str:
    """HWP/HWPX 파일에서 텍스트 추출"""
    import subprocess
    if filepath.suffix.lower() == ".hwpx":
        import zipfile, xml.etree.ElementTree as ET
        texts = []
        with zipfile.ZipFile(str(filepath)) as z:
            for name in z.namelist():
                if name.endswith(".xml") and "Contents" in name:
                    with z.open(name) as f:
                        try:
                            tree = ET.parse(f)
                            for elem in tree.iter():
                                if elem.text and elem.text.strip():
                                    texts.append(elem.text.strip())
                        except Exception:
                            pass
        return "\n".join(texts)
    else:
        result = subprocess.run(
            ["hwp5txt", str(filepath)],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            raise ValueError(f"HWP 변환 실패: {result.stderr}")
        return result.stdout


# ── 답지 자동 등록 ─────────────────────────────────────────────
def _process_entrance_answer_key(filepath: Path):
    """입학테스트 답지(HWP/PDF) → DB 자동 등록
    AI 호출 완료 후 DB 연결 → 연결 점유 최소화
    """
    log.info(f"[Watcher] 입학테스트 답지 처리: {filepath.name}")
    try:
        ext = filepath.suffix.lower()

        # ── Step 1: AI 추출 (DB 연결 없음) ──────────────────────────
        if ext in HWP_EXT:
            text = _extract_hwp_text(filepath)
            prompt = f"""다음은 입학 시험 정답지 텍스트입니다:\n{text}\n\n다음 정보를 JSON으로 추출하세요. 다른 텍스트 없이 JSON만:\n{{"title":"시험 제목","grade":"학년(중1/중2/중3/고1/고2/고3)","subject":"과목","test_date":"YYYY-MM-DD","answers":{{"1":"3","2":"①"}}}}
test_date가 없으면 오늘 날짜로."""
            response = ai_text_call(prompt, max_tokens=2000)
        else:
            prompt = """이 PDF는 입학 시험 정답지입니다.
다음 정보를 JSON으로 추출하세요. 다른 텍스트 없이 JSON만:
{"title":"시험 제목","grade":"학년(중1/중2/중3/고1/고2/고3)","subject":"과목","test_date":"YYYY-MM-DD","answers":{"1":"3","2":"①"}}
test_date가 없으면 오늘 날짜로."""
            response = _ai_call(str(filepath), prompt, max_tokens=2000)

        data = _parse_json(response)
        answers = data.get("answers", {})
        from datetime import datetime as _dt
        try:
            test_date = _dt.strptime(data["test_date"], "%Y-%m-%d").date()
        except Exception:
            test_date = date.today()

        # ── Step 2: DB INSERT (AI 끝난 후) ──────────────────────────
        db = SessionLocal()
        try:
            test = models.Test(
                title=data["title"],
                grade=data["grade"],
                subject=data.get("subject", ""),
                question_count=len(answers),
                answers=answers,
                test_date=test_date,
            )
            db.add(test)
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        done_dir = ANSWER_ENTRANCE / "등록완료"
        done_dir.mkdir(exist_ok=True)
        shutil.move(str(filepath), str(_unique_dest(done_dir / filepath.name)))
        log.info(f"[Watcher] ✓ 입학테스트 등록: {data['title']} ({len(answers)}문항)")
    except Exception as e:
        log.error(f"[Watcher] ✗ 입학테스트 답지 등록 실패: {e}")
        _move_to_error(filepath)


def _extract_pdf_text(filepath: Path) -> str:
    """PDF 전체 페이지 텍스트 추출"""
    import fitz
    doc = fitz.open(str(filepath))
    texts = []
    for page in doc:
        texts.append(page.get_text())
    doc.close()
    return "\n".join(texts)


def _split_text_by_day(text: str) -> list[tuple[int, str]]:
    """텍스트를 DAY 단위로 분할. [(day_no, section_text), ...] 반환."""
    parts = _DAY_SPLIT_RE.split(text)
    sections = []
    i = 1
    while i < len(parts):
        day_label = parts[i]
        content = parts[i + 1] if i + 1 < len(parts) else ""
        m = re.search(r'\d+', day_label)
        if m:
            sections.append((int(m.group()), day_label + content))
        i += 2
    return sections


def _extract_items_from_text_chunk(chunk: str, day_no: int, item_offset: int) -> list[dict]:
    """텍스트 청크에서 단어 항목 추출 (AI 호출). 429 rate limit 시 최대 3회 재시도."""
    prompt = f"""다음은 영어 단어장 DAY {day_no} 텍스트입니다.
단어 번호, 한국어 뜻(question), 영어 단어(answer)를 추출하세요.
JSON 배열로만 응답 (다른 텍스트 없이):
[{{"item_no": {item_offset + 1}, "question": "한국어뜻", "answer": "영어단어", "day": {day_no}}}, ...]

텍스트:
{chunk[:3000]}"""
    for attempt in range(3):
        try:
            response = ai_text_call(prompt, max_tokens=4000, fast=True)
            return _parse_json(response)
        except Exception as e:
            if "429" in str(e) or "rate_limit" in str(e):
                wait = (attempt + 1) * 30  # 30초, 60초, 90초
                log.warning(f"[Watcher] DAY {day_no} rate limit, {wait}초 후 재시도 ({attempt+1}/3)")
                time.sleep(wait)
            else:
                log.error(f"[Watcher] DAY {day_no} 추출 실패: {e}")
                return []
    log.error(f"[Watcher] DAY {day_no} 최대 재시도 초과, 건너뜀")
    return []


def _process_word_answer_key(filepath: Path):
    """영어단어 답지(HWP/PDF) → DB 자동 등록 (DAY별 청크 처리)
    AI 호출(느림)을 DB 연결 없이 먼저 완료 → DB는 INSERT 직전에만 열어 연결 점유 최소화
    """
    import traceback
    db = None  # H-4: finally에서 안전하게 닫기 위해 미리 선언
    log.info(f"[Watcher] 영어단어 답지 처리: {filepath.name}")
    try:
        ext = filepath.suffix.lower()

        # ── Step 1: 텍스트 추출 (DB 연결 없음) ──────────────────────
        if ext in HWP_EXT:
            full_text = _extract_hwp_text(filepath)
        else:
            full_text = _extract_pdf_text(filepath)

        is_text_pdf = len(full_text.strip()) > 200

        # ── Step 2: 메타정보 AI 추출 (DB 연결 없음) ─────────────────
        meta_prompt = """이 영어 단어장의 메타정보만 JSON으로 추출하세요. 다른 텍스트 없이 JSON만:
{"title":"단어장 이름(예:능률 VOCA 고등 기본)","grade":"학년(중1/중2/중3/고1/고2/고3)","direction":"KR_EN 또는 EN_KR","total_days":60}
direction: 한→영이면 KR_EN, 영→한이면 EN_KR."""

        if is_text_pdf:
            meta_response = ai_text_call(f"다음은 영어 단어장 텍스트 앞부분입니다:\n{full_text[:2000]}\n\n{meta_prompt}", max_tokens=500, fast=True)
        else:
            meta_response = _ai_call(str(filepath), meta_prompt, max_tokens=500)

        meta = _parse_json(meta_response)
        log.info(f"[Watcher] 메타 추출 완료: {meta.get('title')} ({meta.get('grade')})")

        # ── Step 3: 단어 AI 추출 (DB 연결 없음) ─────────────────────
        all_items = []
        if is_text_pdf:
            day_sections = _split_text_by_day(full_text)
            if day_sections:
                log.info(f"[Watcher] {len(day_sections)}개 DAY 섹션 감지, 청크별 추출 시작")
                for day_no, section_text in day_sections:
                    items = _extract_items_from_text_chunk(section_text, day_no, len(all_items))
                    all_items.extend(items)
                    log.info(f"[Watcher] DAY {day_no}: {len(items)}개 추출 (누적 {len(all_items)}개)")
            else:
                log.info("[Watcher] DAY 구분 없음, 청크별 추출")
                chunk_size = 2000
                for i in range(0, len(full_text), chunk_size):
                    chunk = full_text[i:i + chunk_size]
                    if not chunk.strip():
                        continue
                    items = _extract_items_from_text_chunk(chunk, i // chunk_size + 1, len(all_items))
                    all_items.extend(items)
        else:
            word_prompt = """이 영어 단어장 이미지에서 모든 단어를 추출하세요. JSON 배열로만:
[{"item_no":1,"question":"한국어뜻","answer":"영어단어"}, ...]"""
            response = _ai_call(str(filepath), word_prompt, max_tokens=8000)
            all_items = _parse_json(response)

        # item_no 재정렬
        for idx, item in enumerate(all_items, 1):
            item["item_no"] = idx

        is_en_kr = meta.get("direction", "KR_EN") == "EN_KR"

        # ── Step 4: DB 연결 → INSERT (AI 호출 끝난 후) ──────────────
        db = SessionLocal()
        word_test = models.WordTest(
            title=meta["title"],
            grade=meta["grade"],
            direction=meta.get("direction", "KR_EN"),
            test_date=date.today(),
        )
        db.add(word_test)
        db.flush()  # H-6: ID만 확정, commit은 전체 완료 후 한 번만

        for item in all_items:
            q = item.get("question", "")
            a = item.get("answer", "")
            if is_en_kr:
                q, a = a, q
            db.add(models.WordTestItem(
                word_test_id=word_test.id,
                item_no=item["item_no"],
                question=q,
                answer=a,
                day=item.get("day"),
            ))
        db.commit()  # H-6: 전체를 하나의 트랜잭션으로 atomic 처리

        done_dir = ANSWER_WORD / "등록완료"
        done_dir.mkdir(exist_ok=True)
        shutil.move(str(filepath), str(_unique_dest(done_dir / filepath.name)))
        log.info(f"[Watcher] ✓ 영어단어 등록: {meta['title']} ({len(all_items)}문항)")
    except Exception as e:
        if db is not None:
            db.rollback()
        log.error(f"[Watcher] ✗ 영어단어 답지 등록 실패: {e}")
        log.error(traceback.format_exc())
        _move_to_error(filepath)
    finally:
        if db is not None:  # H-4: 단일 지점에서 닫기
            db.close()


# ── 수학 OMR 채점 ──────────────────────────────────────────────
def _grade_omr(file_path: str, answers: list) -> list:
    """OMR 이미지/PDF에서 마킹 번호 읽기 → 정답과 비교 채점. Haiku 사용."""
    prompt = """이것은 OMR 답안지입니다. 각 문항에서 학생이 마킹한 번호(1~5)를 읽으세요.
마킹이 없거나 불분명하면 0으로.
JSON 배열로만 응답 (다른 텍스트 없이):
[{"question_no": 1, "student_answer": 3}, {"question_no": 2, "student_answer": 1}, ...]"""
    text = _ai_call(file_path, prompt, max_tokens=1000)
    raw = _parse_json(text)

    results = []
    for r in raw:
        q_no = r.get("question_no")
        s_ans = r.get("student_answer", 0) or 0
        if q_no is None or q_no < 1 or q_no > len(answers):
            continue
        c_ans = answers[q_no - 1]
        results.append({
            "question_no": q_no,
            "student_answer": s_ans,
            "correct_answer": c_ans,
            "is_correct": (s_ans == c_ans and c_ans > 0),
        })
    return results


def _match_math_test(db, title: str):
    t = db.query(models.MathTest).filter(
        models.MathTest.title.ilike(f"%{title}%")
    ).first()
    if t:
        return t
    for word in title.split():
        if len(word) < 2:
            continue
        t = db.query(models.MathTest).filter(
            models.MathTest.title.ilike(f"%{word}%")
        ).first()
        if t:
            return t
    return None


def _process_math_omr_core(file_path: Path, db) -> tuple:
    """
    수학 OMR: 학생 이름 + 시험 매칭 → OMR 읽기 → 채점 → DB flush
    Returns: (new_name, submission)
    """
    # 학생 이름 + 시험명 추출
    prompt = """이 OMR 답안지에서 다음 정보를 JSON으로 추출하세요. 다른 텍스트 없이 JSON만:
{"student_name": "학생 이름", "class_name": "반 이름(없으면 빈 문자열)", "test_title": "시험 제목(없으면 빈 문자열)"}"""
    info = _parse_json(_ai_call(str(file_path), prompt, max_tokens=300))
    student_name = info.get("student_name", "").strip()
    class_name   = info.get("class_name", "").strip()
    test_title   = info.get("test_title", "").strip()

    if not student_name:
        raise ValueError("학생 이름을 읽지 못했습니다")

    student = _match_student(db, student_name, class_name)
    if not student:
        raise ValueError(f"미매칭:{student_name}")

    # 시험 매칭 (이름으로 먼저, 없으면 가장 최근 시험)
    math_test = None
    if test_title:
        math_test = _match_math_test(db, test_title)
    if not math_test:
        math_test = db.query(models.MathTest).order_by(models.MathTest.created_at.desc()).first()
    if not math_test:
        raise ValueError("등록된 수학 시험이 없습니다")
    if not math_test.answers or not any(a > 0 for a in math_test.answers):
        raise ValueError(f"시험 정답이 등록되지 않았습니다: {math_test.title}")

    results = _grade_omr(str(file_path), math_test.answers)
    if not results:
        raise ValueError("OMR 채점 결과가 비어있습니다")

    score = sum(1 for r in results if r["is_correct"])
    new_name = _make_graded_filename(student, db, suffix=file_path.suffix)

    submission = models.MathSubmission(
        math_test_id=math_test.id,
        student_id=student.id,
        student_name=student.name,
        status="graded",
        score=score,
        total=len(results),
        image_path=None,
    )
    db.add(submission)
    db.flush()

    for r in results:
        db.add(models.MathSubmissionItem(
            submission_id=submission.id,
            question_no=r["question_no"],
            student_answer=r["student_answer"],
            correct_answer=r["correct_answer"],
            is_correct=r["is_correct"],
        ))
    db.flush()
    log.info(f"[Watcher] ✓ 수학 OMR: {student.name} | {math_test.title} | {score}/{len(results)}")
    return new_name, submission


def process_math_omr_file(filepath: Path):
    """수학 OMR 단일 파일 처리"""
    db = SessionLocal()
    try:
        log.info(f"[Watcher] 수학 OMR 처리 시작: {filepath.name}")
        new_name, submission = _process_math_omr_core(filepath, db)
        dest = _unique_dest(GRADED_MATH / new_name)
        _save_local_backup(filepath.read_bytes(), dest.name)
        shutil.move(str(filepath), str(dest))
        submission.image_path = str(dest)
        db.commit()
    except ValueError as e:
        if str(e).startswith("미매칭:"):
            _save_unmatched(filepath.read_bytes(), str(e).split(":", 1)[1].strip())
            filepath.unlink(missing_ok=True)
            db.rollback()
        else:
            log.error(f"[Watcher] ✗ {filepath.name}: {e}")
            db.rollback()
            _move_to_error(filepath)
    except Exception as e:
        log.error(f"[Watcher] ✗ {filepath.name}: {e}")
        db.rollback()
        _move_to_error(filepath)
    finally:
        db.close()


def _process_math_answer_key(filepath: Path):
    """수학 답지(PDF/이미지) → math_tests DB 자동 등록
    - 이미지/스캔PDF (OMR): Haiku 사용
    - 텍스트 PDF (일반 답지): Sonnet 사용
    AI 호출 완료 후 DB 연결 → 연결 점유 최소화
    """
    log.info(f"[Watcher] 수학 답지 처리: {filepath.name}")
    try:
        ext = filepath.suffix.lower()

        # ── Step 1: AI 추출 (DB 연결 없음) ──────────────────────────
        is_omr = ext in IMAGE_EXTS
        if not is_omr and ext in PDF_EXT:
            extracted = _extract_pdf_text(filepath)
            is_omr = len(extracted.strip()) < 200

        if is_omr:
            log.info("[Watcher] 수학 답지 → OMR 형식 (Haiku)")
            prompt = f"""이것은 수학 시험 OMR 정답지입니다.
각 문항의 정답 번호(1~5)를 읽고 다음 JSON으로 응답하세요. 다른 텍스트 없이 JSON만:
{{"title": "시험 제목", "grade": "학년(중1/중2/중3/고1/고2/고3)", "test_date": "YYYY-MM-DD", "answers": [3, 1, 4, 1, 5]}}
answers는 문항 순서대로의 정답 번호 배열(1~5). test_date 없으면 오늘 날짜({date.today()})."""
            response = _ai_call(str(filepath), prompt, max_tokens=2000)
        else:
            log.info("[Watcher] 수학 답지 → 텍스트 형식 (Sonnet)")
            extracted = _extract_pdf_text(filepath)
            prompt = f"""다음은 수학 시험 정답지 텍스트입니다:
{extracted[:3000]}

다음 JSON으로 추출하세요. 다른 텍스트 없이 JSON만:
{{"title": "시험 제목", "grade": "학년(중1/중2/중3/고1/고2/고3)", "test_date": "YYYY-MM-DD", "answers": [3, 1, 4, 1, 5]}}
answers는 문항 순서대로의 정답 번호 배열(1~5). test_date 없으면 오늘 날짜({date.today()})."""
            response = _ai_call(str(filepath), prompt, max_tokens=2000)

        data = _parse_json(response)
        from datetime import datetime as _dt
        try:
            test_date = _dt.strptime(data["test_date"], "%Y-%m-%d").date()
        except Exception:
            test_date = date.today()

        answers = [int(a) for a in data.get("answers", [])]
        title = data.get("title") or filepath.stem

        # ── Step 2: DB INSERT (AI 끝난 후) ──────────────────────────
        db = SessionLocal()
        try:
            test = models.MathTest(
                title=title,
                grade=data.get("grade", "미상"),
                test_date=test_date,
                num_questions=len(answers),
                answers=answers,
                source_file=filepath.name,
            )
            db.add(test)
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        done_dir = ANSWER_MATH / "등록완료"
        done_dir.mkdir(exist_ok=True)
        shutil.move(str(filepath), str(_unique_dest(done_dir / filepath.name)))
        log.info(f"[Watcher] ✓ 수학 답지 등록: {title} ({len(answers)}문항)")
    except Exception as e:
        log.error(f"[Watcher] ✗ 수학 답지 등록 실패: {e}")
        _move_to_error(filepath)


# ── 세마포어 래퍼 ──────────────────────────────────────────────
def _run_with_sem(fn, *args):
    """세마포어 획득 후 fn 실행 → 동시 처리 최대 3개 제한"""
    acquired = _PROCESS_SEMAPHORE.acquire(timeout=_SEMAPHORE_TIMEOUT)
    if not acquired:
        log.error(f"[Watcher] ✗ 세마포어 획득 타임아웃 ({_SEMAPHORE_TIMEOUT}s) → 처리 건너뜀: {args[0] if args else ''}")
        return
    try:
        fn(*args)
    finally:
        _PROCESS_SEMAPHORE.release()


# ── Watchdog 핸들러 ────────────────────────────────────────────
class _NASHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        filepath = Path(event.src_path)
        ext      = filepath.suffix.lower()

        if ext not in IMAGE_EXTS and ext not in PDF_EXT and ext not in HWP_EXT:
            return
        time.sleep(1)  # 파일 쓰기 완료 대기

        if filepath.parent == UNGRADED_WORD:
            if ext in PDF_EXT:
                Thread(target=_run_with_sem, args=(process_pdf_file, filepath, "word"), daemon=True).start()
            elif ext in IMAGE_EXTS:
                Thread(target=_run_with_sem, args=(process_word_file, filepath), daemon=True).start()
        elif filepath.parent == UNGRADED_ENTRANCE:
            if ext in PDF_EXT:
                Thread(target=_run_with_sem, args=(process_pdf_file, filepath, "entrance"), daemon=True).start()
            elif ext in IMAGE_EXTS:
                Thread(target=_run_with_sem, args=(process_entrance_file, filepath), daemon=True).start()
        elif filepath.parent == ANSWER_ENTRANCE:
            if ext in PDF_EXT or ext in HWP_EXT:
                Thread(target=_run_with_sem, args=(_process_entrance_answer_key, filepath), daemon=True).start()
        elif filepath.parent == ANSWER_WORD:
            if ext in PDF_EXT or ext in HWP_EXT:
                Thread(target=_run_with_sem, args=(_process_word_answer_key, filepath), daemon=True).start()
        elif filepath.parent == UNGRADED_MATH:
            if ext in PDF_EXT or ext in IMAGE_EXTS:
                Thread(target=_run_with_sem, args=(process_math_omr_file, filepath), daemon=True).start()
        elif filepath.parent == ANSWER_MATH:
            if ext in PDF_EXT or ext in IMAGE_EXTS:
                Thread(target=_run_with_sem, args=(_process_math_answer_key, filepath), daemon=True).start()


# ── 외부 진입점 ────────────────────────────────────────────────
_observer = None


def _scan_existing():
    """서버 재시작 시 기존 미채점 파일 일괄 처리"""
    for filepath in UNGRADED_WORD.iterdir():
        if not filepath.is_file():
            continue
        ext = filepath.suffix.lower()
        if ext in IMAGE_EXTS:
            Thread(target=_run_with_sem, args=(process_word_file, filepath), daemon=True).start()
        elif ext in PDF_EXT:
            Thread(target=_run_with_sem, args=(process_pdf_file, filepath, "word"), daemon=True).start()

    for filepath in UNGRADED_ENTRANCE.iterdir():
        if not filepath.is_file():
            continue
        ext = filepath.suffix.lower()
        if ext in IMAGE_EXTS:
            Thread(target=_run_with_sem, args=(process_entrance_file, filepath), daemon=True).start()
        elif ext in PDF_EXT:
            Thread(target=_run_with_sem, args=(process_pdf_file, filepath, "entrance"), daemon=True).start()

    for filepath in UNGRADED_MATH.iterdir():
        if not filepath.is_file():
            continue
        ext = filepath.suffix.lower()
        if ext in IMAGE_EXTS or ext in PDF_EXT:
            Thread(target=_run_with_sem, args=(process_math_omr_file, filepath), daemon=True).start()

    for filepath in ANSWER_MATH.iterdir():
        if not filepath.is_file():
            continue
        ext = filepath.suffix.lower()
        if ext in IMAGE_EXTS or ext in PDF_EXT:
            Thread(target=_run_with_sem, args=(_process_math_answer_key, filepath), daemon=True).start()

    for filepath in ANSWER_WORD.iterdir():
        if not filepath.is_file():
            continue
        ext = filepath.suffix.lower()
        if ext in PDF_EXT or ext in HWP_EXT:
            Thread(target=_run_with_sem, args=(_process_word_answer_key, filepath), daemon=True).start()

    for filepath in ANSWER_ENTRANCE.iterdir():
        if not filepath.is_file():
            continue
        ext = filepath.suffix.lower()
        if ext in PDF_EXT or ext in HWP_EXT:
            Thread(target=_run_with_sem, args=(_process_entrance_answer_key, filepath), daemon=True).start()


def start_watcher():
    global _observer
    from config import NAS_ROOT as _NAS_ROOT
    if not _NAS_ROOT.exists():
        log.warning(f"[Watcher] NAS 경로 없음, 감시 비활성화: {_NAS_ROOT}")
        return

    _ensure_dirs()
    _scan_existing()

    handler   = _NASHandler()
    _observer = Observer(timeout=5)
    _observer.schedule(handler, str(UNGRADED_WORD),     recursive=False)
    _observer.schedule(handler, str(UNGRADED_ENTRANCE), recursive=False)
    _observer.schedule(handler, str(ANSWER_ENTRANCE),   recursive=False)
    _observer.schedule(handler, str(ANSWER_WORD),       recursive=False)
    _observer.schedule(handler, str(UNGRADED_MATH),     recursive=False)
    _observer.schedule(handler, str(ANSWER_MATH),       recursive=False)
    _observer.start()
    log.info(f"[Watcher] 감시 시작 → {UNGRADED_WORD}")
    log.info(f"[Watcher] 감시 시작 → {UNGRADED_ENTRANCE}")
    log.info(f"[Watcher] 감시 시작 → {ANSWER_ENTRANCE}")
    log.info(f"[Watcher] 감시 시작 → {ANSWER_WORD}")
    log.info(f"[Watcher] 감시 시작 → {UNGRADED_MATH}")
    log.info(f"[Watcher] 감시 시작 → {ANSWER_MATH}")


def stop_watcher():
    global _observer
    if _observer:
        _observer.stop()
        _observer.join()
        log.info("[Watcher] 감시 종료")
