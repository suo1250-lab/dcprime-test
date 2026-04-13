from fastapi import APIRouter, UploadFile, File, HTTPException
from pathlib import Path
from config import UNGRADED_WORD, UNGRADED_ENTRANCE, GRADED_WORD, GRADED_ENTRANCE, ERROR_DIR, UNMATCHED_DIR, ANSWER_WORD, MAX_UPLOAD_PDF

router = APIRouter(prefix="/nas", tags=["nas"])


def _folder_info(path: Path) -> dict:
    if not path.exists():
        return {"count": 0, "files": []}
    files = [f.name for f in sorted(path.iterdir()) if f.is_file()]
    return {"count": len(files), "files": files}


@router.get("/status")
def nas_status():
    return {
        "ungraded_entrance": _folder_info(UNGRADED_ENTRANCE),
        "ungraded_word":     _folder_info(UNGRADED_WORD),
        "graded_entrance":   _folder_info(GRADED_ENTRANCE),
        "graded_word":       _folder_info(GRADED_WORD),
        "error":             _folder_info(ERROR_DIR),
        "unmatched":         _folder_info(UNMATCHED_DIR),
    }


@router.delete("/error/{filename}", status_code=204)
def delete_error_file(filename: str):
    filename = Path(filename).name  # 경로 구분자 제거
    path = ERROR_DIR / filename
    if path.parent.resolve() != ERROR_DIR.resolve():
        raise HTTPException(400, "잘못된 파일명입니다")
    path.unlink(missing_ok=True)


@router.delete("/unmatched/{filename}", status_code=204)
def delete_unmatched_file(filename: str):
    filename = Path(filename).name  # 경로 구분자 제거
    path = UNMATCHED_DIR / filename
    if path.parent.resolve() != UNMATCHED_DIR.resolve():
        raise HTTPException(400, "잘못된 파일명입니다")
    path.unlink(missing_ok=True)


@router.post("/upload/answer-word", status_code=202)
async def upload_word_answer_key(file: UploadFile = File(...)):
    """영어 단어장 답지 PDF 업로드 → ANSWER_WORD 폴더에 저장 → watcher 자동 처리"""
    if not file.filename:
        raise HTTPException(400, "파일명이 없습니다")
    safe_name = Path(file.filename).name  # 경로 구분자 제거
    ext = Path(safe_name).suffix.lower()
    if ext not in {".pdf", ".hwp", ".hwpx"}:
        raise HTTPException(400, "PDF 또는 HWP 파일만 업로드 가능합니다")
    ANSWER_WORD.mkdir(parents=True, exist_ok=True)
    dest = ANSWER_WORD / safe_name
    if dest.exists():
        stem = Path(safe_name).stem
        i = 2
        while dest.exists():
            dest = ANSWER_WORD / f"{stem}_{i}{ext}"
            i += 1
    content = await file.read()
    if len(content) > MAX_UPLOAD_PDF:
        raise HTTPException(413, "파일이 너무 큽니다 (최대 200MB)")
    dest.write_bytes(content)
    return {"filename": dest.name, "message": "업로드 완료. watcher가 자동으로 처리합니다."}


@router.post("/retry/{filename}", status_code=202)
def retry_error_file(filename: str):
    """오류 파일을 미채점 폴더로 이동해서 재처리"""
    import shutil
    filename = Path(filename).name  # 경로 구분자 제거
    src = ERROR_DIR / filename
    if src.parent.resolve() != ERROR_DIR.resolve():
        raise HTTPException(400, "잘못된 파일명입니다")
    if not src.exists():
        raise HTTPException(404, "파일 없음")
    # 파일명으로 타입 판단 불가 → 입학테스트로 이동 (기본값)
    # 앞에 [단어] 붙어있으면 단어시험으로
    dest_dir = UNGRADED_WORD if filename.startswith("[단어]") else UNGRADED_ENTRANCE
    shutil.move(str(src), str(dest_dir / filename))
    return {"moved_to": str(dest_dir)}
