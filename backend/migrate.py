"""
DB 마이그레이션 스크립트
실행 방법:
  # Docker Compose 환경 (컨테이너 안에서)
  docker compose exec backend python migrate.py

  # 로컬에서 직접 실행
  python migrate.py
"""
import sys
from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine, text
from config import DATABASE_URL

MIGRATIONS = [
    {
        "name": "add_teacher_to_students",
        "check": """
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'students' AND column_name = 'teacher'
        """,
        "sql": "ALTER TABLE students ADD COLUMN teacher VARCHAR(50)",
    },
    {
        "name": "add_correct_threshold_to_word_tests",
        "check": """
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'word_tests' AND column_name = 'correct_threshold'
        """,
        "sql": "ALTER TABLE word_tests ADD COLUMN correct_threshold FLOAT NOT NULL DEFAULT 0.85",
    },
    {
        "name": "add_ambiguous_threshold_to_word_tests",
        "check": """
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'word_tests' AND column_name = 'ambiguous_threshold'
        """,
        "sql": "ALTER TABLE word_tests ADD COLUMN ambiguous_threshold FLOAT NOT NULL DEFAULT 0.65",
    },
]

def run():
    engine = create_engine(DATABASE_URL)
    print(f"[migrate] DB 연결: {DATABASE_URL}\n")

    with engine.connect() as conn:
        for m in MIGRATIONS:
            name = m["name"]
            exists = conn.execute(text(m["check"])).fetchone()
            if exists:
                print(f"[migrate] SKIP  {name} (이미 적용됨)")
            else:
                conn.execute(text(m["sql"]))
                conn.commit()
                print(f"[migrate] OK    {name}")

    print("\n[migrate] 완료.")

if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"[migrate] 에러: {e}", file=sys.stderr)
        sys.exit(1)
