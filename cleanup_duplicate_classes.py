"""
중복 반(축약명 클래스) 정리 스크립트
- "26." 으로 시작하지 않는 클래스 = 스크립트 초기 실행 때 잘못 생성된 것
- 해당 클래스에 연결된 학생 row 삭제 후 클래스 삭제
"""

import os
import psycopg2
from urllib.parse import urlparse

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres.kofiuihaklvscrabqaqc:dcprime0979!@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres"
)

def main():
    p = urlparse(DATABASE_URL)
    conn = psycopg2.connect(
        host=p.hostname, port=p.port or 5432,
        dbname=p.path.lstrip("/"), user=p.username, password=p.password,
    )
    cur = conn.cursor()

    try:
        # 축약명 클래스 조회 (26. 으로 시작하지 않는 것)
        cur.execute("SELECT id, name FROM classes WHERE name NOT LIKE '26.%' ORDER BY name")
        bad_classes = cur.fetchall()

        if not bad_classes:
            print("정리할 중복 클래스가 없습니다.")
            return

        print(f"축약명 클래스 {len(bad_classes)}개 발견:")
        for cid, cname in bad_classes:
            cur.execute("SELECT COUNT(*) FROM students WHERE class_id = %s", (cid,))
            cnt = cur.fetchone()[0]
            print(f"  [{cid}] {cname} → 연결된 학생: {cnt}명")

        confirm = input(f"\n위 클래스 및 연결된 학생 row를 삭제하시겠습니까? (yes/no): ")
        if confirm.strip().lower() != "yes":
            print("취소.")
            return

        total_students = 0
        for cid, cname in bad_classes:
            cur.execute("DELETE FROM students WHERE class_id = %s", (cid,))
            total_students += cur.rowcount
            cur.execute("DELETE FROM classes WHERE id = %s", (cid,))

        conn.commit()
        print(f"\n✓ 클래스 {len(bad_classes)}개, 학생 row {total_students}개 삭제 완료!")
        print("이제 bulk_register_students.py 를 다시 실행하면 깔끔하게 재등록됩니다.")

    except Exception as e:
        conn.rollback()
        print(f"오류: {e}")
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
