from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import students, tests, results, classes, analytics
from routers import word_tests, word_submissions, historical, word_tutoring, nas, word_config
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
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
