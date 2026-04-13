"""
중앙 설정 모듈
모든 경로/키는 .env 파일 또는 환경변수에서 읽음.
환경변수가 없으면 기본값 사용.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# 프로젝트 루트의 .env 파일 로드 (없어도 에러 없음)
load_dotenv()

# ── API 인증 ───────────────────────────────────────────────────
API_SECRET: str = os.environ.get("API_SECRET", "")

# ── 파일 업로드 크기 제한 ───────────────────────────────────────
MAX_UPLOAD_PDF:   int = 200 * 1024 * 1024   # 200MB (합본 PDF)
MAX_UPLOAD_IMAGE: int =  20 * 1024 * 1024   # 20MB  (이미지)
MAX_UPLOAD_EXCEL: int =   5 * 1024 * 1024   # 5MB   (엑셀)

# ── AI API ─────────────────────────────────────────────────────
GEMINI_API_KEY:    str = os.environ.get("GEMINI_API_KEY", "")
XAI_API_KEY:       str = os.environ.get("XAI_API_KEY", "")
# 하위 호환성 유지 (watcher.py 등에서 직접 참조하는 경우)
ANTHROPIC_API_KEY: str = os.environ.get("ANTHROPIC_API_KEY", "")

# ── Database ───────────────────────────────────────────────────
DATABASE_URL: str = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL 환경변수가 설정되지 않았습니다")

# ── NAS 루트 ───────────────────────────────────────────────────
# NAS_ROOT 하나만 설정하면 하위 경로는 자동으로 파생됨.
# 하위 경로를 개별 설정하면 NAS_ROOT 기준 경로를 무시.
_NAS_ROOT = Path(os.environ.get("NAS_ROOT", "/app/nas"))

NAS_ROOT:          Path = _NAS_ROOT
_BASE = _NAS_ROOT / "0. 주간테스트 입학테스트 영어단어테스트" / "자동채점기"

UNGRADED_WORD:     Path = Path(os.environ.get("UNGRADED_WORD",     str(_BASE / "영어단어튜터링" / "미채점")))
UNGRADED_ENTRANCE: Path = Path(os.environ.get("UNGRADED_ENTRANCE", str(_BASE / "입학테스트" / "미채점")))
GRADED_WORD:       Path = Path(os.environ.get("GRADED_WORD",       str(_BASE / "영어단어튜터링" / "채점완료")))
GRADED_ENTRANCE:   Path = Path(os.environ.get("GRADED_ENTRANCE",   str(_BASE / "입학테스트" / "채점완료")))
ANSWER_ENTRANCE:   Path = Path(os.environ.get("ANSWER_ENTRANCE",   str(_BASE / "입학테스트" / "입학테스트답지모음")))
ANSWER_WORD:       Path = Path(os.environ.get("ANSWER_WORD",       str(_BASE / "영어단어튜터링" / "영어단어테스트답지모음")))

UNGRADED_MATH:     Path = Path(os.environ.get("UNGRADED_MATH",     str(_BASE / "수학" / "미채점")))
GRADED_MATH:       Path = Path(os.environ.get("GRADED_MATH",       str(_BASE / "수학" / "채점완료")))
ANSWER_MATH:       Path = Path(os.environ.get("ANSWER_MATH",       str(_BASE / "수학" / "수학답지모음(주테omr전용)")))
GRADED:            Path = GRADED_WORD  # 하위 호환성
ERROR_DIR:         Path = Path(os.environ.get("ERROR_DIR",         str(_NAS_ROOT / "미채점오류")))
UNMATCHED_DIR:     Path = Path(os.environ.get("UNMATCHED_DIR",     str(_NAS_ROOT / "미매칭")))

# ── 로컬 경로 ──────────────────────────────────────────────────
UPLOAD_DIR:   Path = Path(os.environ.get("UPLOAD_DIR",   "/app/uploads"))
LOCAL_BACKUP: Path = Path(os.environ.get("LOCAL_BACKUP", "/app/uploads/graded"))

# ── 역대 입학테스트 스캔본 경로 ────────────────────────────────
HISTORICAL_SCAN_DIR: Path = Path(os.environ.get(
    "HISTORICAL_SCAN_DIR",
    str(_NAS_ROOT / "3. 선생님" / "3. 선생님" / "원장" / "입학테스트 스캔본")
))

# ── 한글 폰트 경로 (PDF 생성 시 사용) ─────────────────────────
# Docker: RUN apt-get install -y fonts-nanum 후 아래 경로 자동 사용
# 커스텀 폰트 경로 지정 시 KOREAN_FONT_PATH 환경변수 설정
KOREAN_FONT_PATH: str = os.environ.get(
    "KOREAN_FONT_PATH",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
)
