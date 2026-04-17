"""
omr_cv.py — OpenCV 기반 OMR 채점 모듈

카드 구조 (세로 배치, 좌→우 / 위→아래):
  ┌────────────────────────────────────────────┐  ←  타이밍마크(오른쪽 끝)
  │ [가이드] [학년][반십][반일][번십][번일]      │
  ├────────────────────────────────────────────┤
  │ Q10  Q9  Q8  Q7  Q6  Q5  Q4  Q3  Q2  Q1  │  답안 섹션 1
  ├────────────────────────────────────────────┤
  │ Q20 Q19 ... Q11                            │  답안 섹션 2
  ├────────────────────────────────────────────┤
  │ Q30 ... Q21                                │  답안 섹션 3
  ├────────────────────────────────────────────┤
  │ Q40 ... Q31                                │  답안 섹션 4
  ├────────────────────────────────────────────┤
  │ 서답형 4칸                                  │
  └────────────────────────────────────────────┘

채점 규칙:
  - 1개 마킹: 해당 번호 (1~5)
  - 0개 마킹: None  → 오답 처리
  - 2+개 마킹: None → 오답 처리 (복수마킹)
"""

import cv2
import numpy as np
from pathlib import Path

# ──────────────────────────────────────────────────────────────
#  파라미터 — 실제 스캔 품질에 따라 조정
# ──────────────────────────────────────────────────────────────

# 어두운 픽셀 비율 ≥ 이 값이면 마킹으로 판정 (0~1)
FILL_THRESHOLD = 0.18

# 좌우반전 판정: 왼쪽 어두운 비율이 오른쪽의 이 배수 이상이면 반전
FLIP_RATIO = 1.4

# 처리용 최대 이미지 크기 (픽셀, 긴 쪽 기준)
MAX_SIZE = 2000

# 타이밍 마크 구역 너비 (전체 너비 대비)
TIMING_STRIP = 0.06

# ──────────────────────────────────────────────────────────────
#  카드 레이아웃 (정규화 좌표 0.0 ~ 1.0)
#
#  ※ 실제 스캔본으로 테스트 후 아래 값 보정 필요
#    debug=True 로 실행하면 grid 시각화 이미지가 저장됨
# ──────────────────────────────────────────────────────────────

LAYOUT = {
    # 상단 ID 섹션
    "id": {
        "y": (0.02, 0.17),    # 세로 범위
        "x": (0.03, 0.86),    # 가로 범위 (타이밍마크 제외)
        "rows": 5,             # 행: 학년 / 반십 / 반일 / 번호십 / 번호일
        "cols": 10,            # 열: 숫자 0 ~ 9
    },
    # 답안 4섹션 (각 10문항 × 5지선다)
    "answer_sections": [
        {"y": (0.18, 0.37), "q_range": (1,  10)},
        {"y": (0.39, 0.57), "q_range": (11, 20)},
        {"y": (0.59, 0.77), "q_range": (21, 30)},
        {"y": (0.79, 0.93), "q_range": (31, 40)},
    ],
    "answer_x": (0.03, 0.86),  # 답안 가로 범위
    "choices": 5,               # 5지선다
    # 섹션 내 문항 순서: True면 열 0 = 가장 번호 큰 문항, 열 9 = 가장 작은 문항
    # (이미지에서 Q1이 오른쪽에 있는 경우)
    "q_reversed": True,
    # 서답형 섹션
    "essay": {
        "y": (0.94, 0.99),
        "x": (0.03, 0.86),
        "cols": 4,
    },
}


# ──────────────────────────────────────────────────────────────
#  공개 API
# ──────────────────────────────────────────────────────────────

def grade_omr(image_path: str, num_questions: int, debug_dir: str = None) -> dict:
    """
    OMR 이미지 채점

    Args:
        image_path:    이미지 파일 경로 (jpg / png / webp)
        num_questions: 채점할 문항 수 (1 ~ 40)
        debug_dir:     디버그 이미지 저장 폴더 (None이면 저장 안 함)

    Returns:
        {
            "student_code": "10601",        # 5자리: 학년+반십+반일+번호십+번호일
            "answers":      [3, 1, None, 5, ...],  # 문항별 답 (None = 오답처리)
            "flipped":      False,          # 좌우반전 여부
        }
    """
    img = _load(image_path)
    img, flipped = _fix_orientation(img)
    binary = _binarize(img)

    if debug_dir:
        _save_debug(img, binary, image_path, debug_dir)

    student_code = _read_id(binary, img.shape)
    answers = _read_answers(binary, img.shape, num_questions)

    return {"student_code": student_code, "answers": answers, "flipped": flipped}


# ──────────────────────────────────────────────────────────────
#  전처리
# ──────────────────────────────────────────────────────────────

def _load(path: str) -> np.ndarray:
    """이미지(jpg/png/webp) 또는 PDF(첫 페이지) 로드 → grayscale ndarray"""
    if Path(path).suffix.lower() == ".pdf":
        img = _pdf_first_page(path)
    else:
        img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)

    if img is None:
        raise ValueError(f"이미지 로드 실패: {path}")

    h, w = img.shape
    longest = max(h, w)
    if longest > MAX_SIZE:
        scale = MAX_SIZE / longest
        img = cv2.resize(img, (int(w * scale), int(h * scale)),
                         interpolation=cv2.INTER_AREA)
    return img


def _pdf_first_page(path: str) -> np.ndarray:
    """PDF 첫 페이지를 grayscale ndarray로 변환 (PyMuPDF 사용)"""
    import fitz  # PyMuPDF (requirements.txt에 이미 포함)
    doc = fitz.open(str(path))
    page = doc[0]
    # 200 DPI 기준 렌더링
    mat = fitz.Matrix(200 / 72, 200 / 72)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
    doc.close()
    arr = np.frombuffer(pix.samples, dtype=np.uint8)
    return arr.reshape(pix.height, pix.width)


def _fix_orientation(img: np.ndarray) -> tuple:
    """
    오른쪽 끝 타이밍 마크로 좌우반전 감지.
    타이밍 마크가 왼쪽에 있으면 반전된 것 → flip 후 반환.
    """
    h, w = img.shape
    sw = max(int(w * TIMING_STRIP), 8)

    left_dark  = float(np.mean(img[:, :sw] < 80))
    right_dark = float(np.mean(img[:, w - sw:] < 80))

    if left_dark > right_dark * FLIP_RATIO:
        return cv2.flip(img, 1), True
    return img, False


def _binarize(img: np.ndarray) -> np.ndarray:
    """가우시안 블러 → 적응형 이진화 → 모폴로지 노이즈 제거"""
    blur = cv2.GaussianBlur(img, (5, 5), 0)
    binary = cv2.adaptiveThreshold(
        blur, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=21, C=5,
    )
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    return cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)


# ──────────────────────────────────────────────────────────────
#  셀 판독
# ──────────────────────────────────────────────────────────────

def _dark_ratio(binary: np.ndarray,
                x1: int, y1: int, x2: int, y2: int) -> float:
    """셀 영역(마진 12% 제거) 내 어두운 픽셀 비율"""
    mx = max(int((x2 - x1) * 0.12), 2)
    my = max(int((y2 - y1) * 0.12), 2)
    cell = binary[y1 + my: y2 - my, x1 + mx: x2 - mx]
    if cell.size == 0:
        return 0.0
    return float(np.count_nonzero(cell)) / cell.size


def _sample_grid(binary: np.ndarray, h: int, w: int,
                 y_range: tuple, x_range: tuple,
                 n_rows: int, n_cols: int) -> list:
    """
    지정 영역을 n_rows × n_cols 그리드로 분할,
    각 셀의 dark_ratio 반환: grid[row][col]
    """
    y1 = int(y_range[0] * h);  y2 = int(y_range[1] * h)
    x1 = int(x_range[0] * w);  x2 = int(x_range[1] * w)

    cell_h = (y2 - y1) / n_rows
    cell_w = (x2 - x1) / n_cols

    grid = []
    for r in range(n_rows):
        row = []
        for c in range(n_cols):
            cy1 = int(y1 + r * cell_h);      cy2 = int(y1 + (r + 1) * cell_h)
            cx1 = int(x1 + c * cell_w);      cx2 = int(x1 + (c + 1) * cell_w)
            row.append(_dark_ratio(binary, cx1, cy1, cx2, cy2))
        grid.append(row)
    return grid


def _pick_answer(ratios: list) -> int | None:
    """
    5개 선택지 fill ratio → 학생 답
    - 정확히 1개 ≥ FILL_THRESHOLD : 해당 번호 (1~5)
    - 0개 또는 2개 이상           : None (미표기 / 복수마킹)
    """
    filled = [i + 1 for i, r in enumerate(ratios) if r >= FILL_THRESHOLD]
    return filled[0] if len(filled) == 1 else None


# ──────────────────────────────────────────────────────────────
#  ID 섹션
# ──────────────────────────────────────────────────────────────

def _read_id(binary: np.ndarray, shape: tuple) -> str:
    """
    상단 ID 섹션 5행에서 각 자리 숫자(0~9) 읽기.
    반환: "10601" 형태의 5자리 문자열
          (인식 실패 자리는 '?')
    """
    h, w = shape
    layout = LAYOUT["id"]
    grid = _sample_grid(
        binary, h, w,
        y_range=layout["y"],
        x_range=layout["x"],
        n_rows=layout["rows"],
        n_cols=layout["cols"],
    )

    code = ""
    for row_ratios in grid:
        max_idx = max(range(len(row_ratios)), key=lambda i: row_ratios[i])
        code += str(max_idx) if row_ratios[max_idx] >= FILL_THRESHOLD else "?"
    return code


def decode_student_code(code: str) -> dict:
    """
    "10601" → {"grade": 1, "class_no": 6, "student_no": 1}
    인식 실패(?) 자리는 None 반환
    """
    def _d(c):
        return int(c) if c != "?" else None

    if len(code) != 5:
        return {"grade": None, "class_no": None, "student_no": None}

    grade      = _d(code[0])
    class_tens = _d(code[1])
    class_ones = _d(code[2])
    num_tens   = _d(code[3])
    num_ones   = _d(code[4])

    class_no   = (class_tens * 10 + class_ones
                  if class_tens is not None and class_ones is not None
                  else None)
    student_no = (num_tens * 10 + num_ones
                  if num_tens is not None and num_ones is not None
                  else None)

    return {"grade": grade, "class_no": class_no, "student_no": student_no}


# ──────────────────────────────────────────────────────────────
#  답안 섹션
# ──────────────────────────────────────────────────────────────

def _read_answers(binary: np.ndarray, shape: tuple, num_questions: int) -> list:
    """
    답안 4섹션에서 num_questions개 문항의 답 읽기.
    반환: [3, 1, None, 5, ...] 길이 = num_questions
    """
    h, w = shape
    answers = [None] * num_questions
    reversed_cols = LAYOUT["q_reversed"]

    for sec in LAYOUT["answer_sections"]:
        q_start, q_end = sec["q_range"]

        # 이 섹션에서 채점 대상인 문항 범위
        active_end = min(q_end, num_questions)
        if q_start > active_end:
            break  # 이후 섹션도 불필요

        grid = _sample_grid(
            binary, h, w,
            y_range=sec["y"],
            x_range=LAYOUT["answer_x"],
            n_rows=LAYOUT["choices"],   # 5지선다 = 5행
            n_cols=10,                  # 10문항 = 10열
        )

        for q in range(q_start, active_end + 1):
            local = q - q_start   # 섹션 내 0-based
            col   = (9 - local) if reversed_cols else local

            ratios = [grid[row][col] for row in range(LAYOUT["choices"])]
            answers[q - 1] = _pick_answer(ratios)

    return answers


# ──────────────────────────────────────────────────────────────
#  디버그
# ──────────────────────────────────────────────────────────────

def _save_debug(img: np.ndarray, binary: np.ndarray,
                image_path: str, debug_dir: str) -> None:
    """그리드 경계선을 시각화한 이미지를 debug_dir에 저장"""
    stem = Path(image_path).stem
    out  = Path(debug_dir)
    out.mkdir(parents=True, exist_ok=True)

    # 이진화 결과
    cv2.imwrite(str(out / f"{stem}_binary.png"), binary)

    # 그리드 시각화
    h, w = img.shape
    vis = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    def _draw_grid(y_range, x_range, n_rows, n_cols, color):
        y1 = int(y_range[0] * h);  y2 = int(y_range[1] * h)
        x1 = int(x_range[0] * w);  x2 = int(x_range[1] * w)
        cv2.rectangle(vis, (x1, y1), (x2, y2), color, 2)
        cell_h = (y2 - y1) / n_rows
        cell_w = (x2 - x1) / n_cols
        for r in range(1, n_rows):
            y = int(y1 + r * cell_h)
            cv2.line(vis, (x1, y), (x2, y), color, 1)
        for c in range(1, n_cols):
            x = int(x1 + c * cell_w)
            cv2.line(vis, (x, y1), (x, y2), color, 1)

    # ID 섹션 (파란색)
    lo = LAYOUT["id"]
    _draw_grid(lo["y"], lo["x"], lo["rows"], lo["cols"], (255, 100, 0))

    # 답안 섹션 (초록색)
    for sec in LAYOUT["answer_sections"]:
        _draw_grid(sec["y"], LAYOUT["answer_x"],
                   LAYOUT["choices"], 10, (0, 200, 0))

    cv2.imwrite(str(out / f"{stem}_grid.png"), vis)
