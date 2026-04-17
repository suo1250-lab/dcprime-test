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
    {
        "name": "add_tags_to_math_tests",
        "check": """
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'math_tests' AND column_name = 'tags'
        """,
        "sql": "ALTER TABLE math_tests ADD COLUMN tags JSONB DEFAULT '{}'",
    },
]


def _run_m2m_migration(conn):
    """Student ↔ Class 다대다 마이그레이션 (별도 처리)"""

    # 1. student_classes 테이블 생성
    table_exists = conn.execute(text("""
        SELECT table_name FROM information_schema.tables
        WHERE table_name = 'student_classes'
    """)).fetchone()

    if not table_exists:
        print("[migrate] OK    create_student_classes_table")
        conn.execute(text("""
            CREATE TABLE student_classes (
                student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                class_id   INTEGER NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
                PRIMARY KEY (student_id, class_id)
            )
        """))
        conn.commit()
    else:
        print("[migrate] SKIP  create_student_classes_table (이미 적용됨)")

    # 2. class_id 컬럼이 있으면 데이터 이전 후 제거
    col_exists = conn.execute(text("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'students' AND column_name = 'class_id'
    """)).fetchone()

    if col_exists:
        print("[migrate] OK    migrate_class_id_to_student_classes")
        conn.execute(text("""
            INSERT INTO student_classes (student_id, class_id)
            SELECT id, class_id FROM students
            WHERE class_id IS NOT NULL
            ON CONFLICT DO NOTHING
        """))
        conn.commit()

        # 3. 중복 학생 병합 (같은 이름+학년)
        dupes = conn.execute(text("""
            SELECT name, grade, MIN(id) AS keep_id, ARRAY_AGG(id ORDER BY id) AS all_ids
            FROM students
            GROUP BY name, grade
            HAVING COUNT(*) > 1
        """)).fetchall()

        for row in dupes:
            name, grade, keep_id, all_ids = row
            merge_ids = [i for i in all_ids if i != keep_id]
            print(f"[migrate] OK    merge_duplicate '{name}'({grade}): {merge_ids} → {keep_id}")
            for old_id in merge_ids:
                conn.execute(text("""
                    INSERT INTO student_classes (student_id, class_id)
                    SELECT :keep, class_id FROM student_classes WHERE student_id = :old
                    ON CONFLICT DO NOTHING
                """), {"keep": keep_id, "old": old_id})
                conn.execute(text("""
                    DELETE FROM test_results WHERE student_id = :old
                    AND test_id IN (SELECT test_id FROM test_results WHERE student_id = :keep)
                """), {"keep": keep_id, "old": old_id})
                conn.execute(text("UPDATE test_results SET student_id = :keep WHERE student_id = :old"), {"keep": keep_id, "old": old_id})
                conn.execute(text("UPDATE math_submissions SET student_id = :keep WHERE student_id = :old"), {"keep": keep_id, "old": old_id})
                conn.execute(text("UPDATE word_tutoring_sessions SET student_id = :keep WHERE student_id = :old"), {"keep": keep_id, "old": old_id})
                conn.execute(text("""
                    UPDATE students SET historical_student_id = COALESCE(
                        (SELECT historical_student_id FROM students WHERE id = :keep),
                        (SELECT historical_student_id FROM students WHERE id = :old)
                    ) WHERE id = :keep
                """), {"keep": keep_id, "old": old_id})
                conn.execute(text("DELETE FROM student_classes WHERE student_id = :old"), {"old": old_id})
                conn.execute(text("DELETE FROM students WHERE id = :old"), {"old": old_id})
            conn.commit()

        # 4. class_id 컬럼 제거
        print("[migrate] OK    drop_students_class_id_column")
        conn.execute(text("ALTER TABLE students DROP COLUMN class_id"))
        conn.commit()
    else:
        print("[migrate] SKIP  migrate_class_id_to_student_classes (class_id 컬럼 없음)")


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

        _run_m2m_migration(conn)

    print("\n[migrate] 완료.")

if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"[migrate] 에러: {e}", file=sys.stderr)
        sys.exit(1)
