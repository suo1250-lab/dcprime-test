import os
from contextlib import asynccontextmanager
import logger as _logger_init  # 앱 시작 시 로깅 설정 적용
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from limiter import limiter
from config import API_SECRET
from routers import students, tests, results, classes, analytics
from routers import (
    word_tests,
    word_submissions,
    historical,
    word_tutoring,
    nas,
    word_config,
)
from routers import math_tests, math_submissions
from watcher import start_watcher, stop_watcher


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_watcher()
    yield
    stop_watcher()


app = FastAPI(
    title="DCPRIME 입학테스트 관리 시스템",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.middleware("http")
async def verify_api_secret(request: Request, call_next):
    if API_SECRET:
        # OPTIONS(preflight) 요청은 헤더 검증 제외
        if request.method != "OPTIONS":
            secret = request.headers.get("X-API-Secret", "")
            if secret != API_SECRET:
                return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)

_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Secret"],
)

app.include_router(students.router, prefix="/api")
app.include_router(tests.router, prefix="/api")
app.include_router(results.router, prefix="/api")
app.include_router(classes.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(word_tests.router, prefix="/api")
app.include_router(word_submissions.router, prefix="/api")
app.include_router(historical.router, prefix="/api")
app.include_router(word_tutoring.router, prefix="/api")
app.include_router(nas.router, prefix="/api")
app.include_router(word_config.router, prefix="/api")
app.include_router(math_tests.router, prefix="/api")
app.include_router(math_submissions.router, prefix="/api")


@app.get("/")
def root():
    return {"status": "ok", "service": "DCPRIME 입학테스트 API"}
