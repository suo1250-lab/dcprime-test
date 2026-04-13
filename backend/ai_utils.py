"""
공통 AI 호출 유틸리티
우선순위: Gemini → Grok (XAI) → Claude (Anthropic)
이미지(jpg/png/webp) 및 PDF 지원
"""
import os
import base64
import io
from pathlib import Path
from config import GEMINI_API_KEY, XAI_API_KEY, ANTHROPIC_API_KEY

GEMINI_MODEL      = os.environ.get("GEMINI_MODEL",      "gemini-2.5-pro-exp-03-25")
CLAUDE_MODEL      = os.environ.get("CLAUDE_MODEL",      "claude-sonnet-4-6")
CLAUDE_FAST_MODEL = os.environ.get("CLAUDE_FAST_MODEL", "claude-haiku-4-5-20251001")


def _gemini_client():
    from google import genai
    return genai.Client(api_key=GEMINI_API_KEY)


def _pdf_to_png_bytes_list(file_path: str) -> list[bytes]:
    """PDF 전 페이지를 PNG bytes 리스트로 반환"""
    import fitz
    doc = fitz.open(file_path)
    result = []
    for page in doc:
        pix = page.get_pixmap(matrix=fitz.Matrix(200 / 72, 200 / 72))
        result.append(pix.tobytes("png"))
    doc.close()
    return result


def _pdf_to_pil_images(file_path: str) -> list:
    """PDF 전 페이지를 PIL Image 리스트로 반환 (Grok용)"""
    from PIL import Image
    return [Image.open(io.BytesIO(b)) for b in _pdf_to_png_bytes_list(file_path)]


def ai_text_call(prompt: str, max_tokens: int = 3000, fast: bool = False) -> str:
    """이미지 없이 텍스트만으로 AI 호출. fast=True면 haiku 사용."""
    if not GEMINI_API_KEY and not XAI_API_KEY and not ANTHROPIC_API_KEY:
        raise ValueError("AI API 키가 설정되지 않았습니다")

    if GEMINI_API_KEY:
        from google.genai import types
        client = _gemini_client()
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[types.Part.from_text(text=prompt)],
        )
        return response.text.strip()
    elif XAI_API_KEY:
        from openai import OpenAI
        client = OpenAI(api_key=XAI_API_KEY, base_url="https://api.x.ai/v1")
        resp = client.chat.completions.create(
            model="grok-3-latest", max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.choices[0].message.content.strip()
    else:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        model = CLAUDE_FAST_MODEL if fast else CLAUDE_MODEL
        resp = client.messages.create(
            model=model, max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text.strip()


def ai_call(file_path: str, prompt: str, max_tokens: int = 2000, fast: bool = False) -> str:
    if not GEMINI_API_KEY and not XAI_API_KEY and not ANTHROPIC_API_KEY:
        raise ValueError("AI API 키가 설정되지 않았습니다")

    is_pdf = Path(file_path).suffix.lower() == ".pdf"

    if GEMINI_API_KEY:
        return _call_gemini(file_path, prompt, is_pdf)
    elif XAI_API_KEY:
        return _call_grok(file_path, prompt, max_tokens, is_pdf)
    else:
        return _call_claude(file_path, prompt, max_tokens, is_pdf, fast=fast)


def _call_gemini(file_path: str, prompt: str, is_pdf: bool) -> str:
    from google.genai import types
    client = _gemini_client()

    parts = [types.Part.from_text(text=prompt)]
    if is_pdf:
        for png_bytes in _pdf_to_png_bytes_list(file_path):
            parts.append(types.Part.from_bytes(data=png_bytes, mime_type="image/png"))
    else:
        ext = Path(file_path).suffix.lower()
        mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".png": "image/png", ".webp": "image/webp"}.get(ext, "image/jpeg")
        with open(file_path, "rb") as f:
            parts.append(types.Part.from_bytes(data=f.read(), mime_type=mime))

    response = client.models.generate_content(model=GEMINI_MODEL, contents=parts)
    return response.text.strip()


def _call_grok(file_path: str, prompt: str, max_tokens: int, is_pdf: bool) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=XAI_API_KEY, base_url="https://api.x.ai/v1")

    if is_pdf:
        content = [
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64.standard_b64encode(b).decode()}"}}
            for b in _pdf_to_png_bytes_list(file_path)
        ]
        content.append({"type": "text", "text": prompt})
    else:
        ext = Path(file_path).suffix.lower()
        mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".png": "image/png", ".webp": "image/webp"}.get(ext, "image/jpeg")
        with open(file_path, "rb") as f:
            img_b64 = base64.standard_b64encode(f.read()).decode()
        content = [
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_b64}"}},
            {"type": "text", "text": prompt},
        ]

    resp = client.chat.completions.create(
        model="grok-2-vision-1212", max_tokens=max_tokens,
        messages=[{"role": "user", "content": content}],
    )
    return resp.choices[0].message.content.strip()


def _call_claude(file_path: str, prompt: str, max_tokens: int, is_pdf: bool, fast: bool = False) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    content = []
    if is_pdf:
        for png_bytes in _pdf_to_png_bytes_list(file_path):
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": base64.standard_b64encode(png_bytes).decode(),
                },
            })
    else:
        ext = Path(file_path).suffix.lower()
        mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".png": "image/png", ".webp": "image/webp"}.get(ext, "image/jpeg")
        with open(file_path, "rb") as f:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": mime,
                    "data": base64.standard_b64encode(f.read()).decode(),
                },
            })

    content.append({"type": "text", "text": prompt})
    model = CLAUDE_FAST_MODEL if fast else CLAUDE_MODEL
    resp = client.messages.create(
        model=model, max_tokens=max_tokens,
        messages=[{"role": "user", "content": content}],
    )
    return resp.content[0].text.strip()
