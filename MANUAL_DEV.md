# DCPRIME 자동채점 시스템 - 개발/운영 매뉴얼

> 작성일: 2026-04-10 | 최종 수정: 2026-04-12
> 대상: 개발자 및 시스템 운영자

---

## 목차

1. [시스템 아키텍처](#1-시스템-아키텍처)
2. [환경변수 설정](#2-환경변수-설정)
3. [백엔드 Docker 빌드 및 NAS 배포](#3-백엔드-docker-빌드-및-nas-배포)
4. [프론트엔드 배포 (Vercel)](#4-프론트엔드-배포-vercel)
5. [NAS 폴더 경로 환경변수 설정](#5-nas-폴더-경로-환경변수-설정)
6. [보안 설정](#6-보안-설정)
7. [트러블슈팅](#7-트러블슈팅)

---

## 1. 시스템 아키텍처

### 전체 구성도

```
[선생님 브라우저]
       │  HTTPS
       ▼
[Vercel] ─── Next.js Frontend
       │  API 요청 (HTTPS / Cloudflare Tunnel)
       ▼
[Synology NAS (Docker)]
  ├── backend 컨테이너 (FastAPI, uvicorn :8000)
  │     ├── watcher.py  ← NAS 폴더 감시, AI 자동채점
  │     ├── routers/    ← REST API 엔드포인트
  │     └── ai_utils.py ← AI 멀티모달 호출 (Gemini / Grok / Claude)
  ├── cloudflared 컨테이너 ← Cloudflare Zero Trust Tunnel
  └── /volume1/DCPRIME ← NAS 공유 폴더 (볼륨 마운트)
       │
       ▼
[Supabase] ─── PostgreSQL DB (AWS ap-southeast-2)
```

### 컴포넌트별 역할

| 컴포넌트 | 역할 | 배포 위치 |
|----------|------|-----------|
| Next.js Frontend | 채점 검토 UI, 학생 관리, 통계 | Vercel |
| FastAPI Backend | REST API, AI 채점 조율, PDF 생성 | Docker on Synology NAS |
| watcher.py | NAS 폴더 파일 감시 및 자동 채점 트리거 | FastAPI 프로세스 내 스레드 |
| Supabase (PostgreSQL) | 모든 데이터 영구 저장 | Supabase Cloud |
| Cloudflare Tunnel | NAS 백엔드를 퍼블릭 HTTPS로 노출 | Docker on Synology NAS |
| NAS 공유 폴더 | 시험지 이미지/PDF 입출력 스토리지 | Synology NAS /volume1/DCPRIME |

### AI 모델 우선순위

`ai_utils.py`는 환경변수에 따라 아래 순서로 AI를 선택합니다.

```
GEMINI_API_KEY 설정됨  →  Gemini 2.5 Pro (gemini-2.5-pro-exp-03-25)
      ↓ (없으면)
XAI_API_KEY 설정됨     →  Grok 2 Vision (grok-2-vision-1212)
      ↓ (없으면)
ANTHROPIC_API_KEY      →  Claude Sonnet 4.6 / Claude Haiku 4.5
```

### GitHub 레포지토리

- 메인: `kimikimim/dcprime-test`
- 미러: `suo1250-lab/dcprime-test`

---

## 2. 환경변수 설정

백엔드 환경변수는 `docker-compose.yml`의 `environment` 섹션 또는 `.env` 파일로 관리합니다.

### 2-1. 필수 환경변수

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `DATABASE_URL` | Supabase PostgreSQL 연결 문자열 | `postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres` |
| `ANTHROPIC_API_KEY` | Claude API 키 (Gemini/Grok 없을 때 폴백) | `sk-ant-api03-...` |
| `API_SECRET` | X-API-Secret 헤더 인증 키 (프론트엔드와 동일 값 사용) | `dcprime0979` |

### 2-2. AI API 키 (하나 이상 설정)

| 변수명 | 설명 | 비고 |
|--------|------|------|
| `GEMINI_API_KEY` | Google Gemini API 키 | 최우선 사용, 비워두면 다음으로 폴백 |
| `XAI_API_KEY` | xAI Grok API 키 | Gemini 없을 때 사용 |
| `ANTHROPIC_API_KEY` | Anthropic Claude API 키 | 최종 폴백, 실질적 기본값 |

### 2-3. NAS 경로 환경변수

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `NAS_ROOT` | `/app/nas` | NAS 마운트 루트 경로 |
| `UNGRADED_WORD` | `{NAS_ROOT}/.../영어단어튜터링/미채점` | 영어 단어 시험 미채점 폴더 |
| `GRADED_WORD` | `{NAS_ROOT}/.../영어단어튜터링/채점완료` | 영어 단어 시험 채점완료 폴더 |
| `ANSWER_WORD` | `{NAS_ROOT}/.../영어단어튜터링/영어단어테스트답지모음` | 단어 답지 폴더 |
| `UNGRADED_ENTRANCE` | `{NAS_ROOT}/.../입학테스트/미채점` | 입학테스트 미채점 폴더 |
| `GRADED_ENTRANCE` | `{NAS_ROOT}/.../입학테스트/채점완료` | 입학테스트 채점완료 폴더 |
| `ANSWER_ENTRANCE` | `{NAS_ROOT}/.../입학테스트/입학테스트답지모음` | 입학테스트 답지 폴더 |
| `UNGRADED_MATH` | `{NAS_ROOT}/.../수학/미채점` | 수학 OMR 미채점 폴더 |
| `GRADED_MATH` | `{NAS_ROOT}/.../수학/채점완료` | 수학 OMR 채점완료 폴더 |
| `ANSWER_MATH` | `{NAS_ROOT}/.../수학/수학답지모음(주테omr전용)` | 수학 답지 폴더 |
| `ERROR_DIR` | `{NAS_ROOT}/미채점오류` | 처리 실패 파일 이동 경로 |
| `UNMATCHED_DIR` | `{NAS_ROOT}/미매칭` | 학생 매칭 실패 파일 이동 경로 |

### 2-4. 보안 및 CORS 환경변수

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `API_SECRET` | `` (빈 값 = 검증 비활성화) | X-API-Secret 헤더 인증 키. **프로덕션에서는 반드시 설정** |
| `ALLOWED_ORIGINS` | `*` | CORS 허용 도메인. 쉼표로 여러 개 지정 가능. 예: `https://dcprime.vercel.app` |

### 2-5. AI 모델명 환경변수

기본 모델명을 변경하거나 신규 모델로 교체할 때 사용합니다. 설정하지 않으면 아래 기본값이 사용됩니다.

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `GEMINI_MODEL` | `gemini-2.5-pro-exp-03-25` | Gemini 모델명 |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Claude 기본 모델명 |
| `CLAUDE_FAST_MODEL` | `claude-haiku-4-5-20251001` | Claude 고속 처리 모델명 |

### 2-6. 기타 환경변수

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `UPLOAD_DIR` | `/app/uploads` | 웹 업로드 임시 저장 경로 |
| `LOCAL_BACKUP` | `/app/uploads/graded` | NAS 장애 대비 로컬 백업 경로 |
| `KOREAN_FONT_PATH` | `/usr/share/fonts/truetype/nanum/NanumGothic.ttf` | PDF 생성 시 한글 폰트 경로 |

### 2-7. docker-compose.yml 설정 예시

```yaml
version: "3.9"

services:
  backend:
    build: ./backend
    restart: unless-stopped
    environment:
      DATABASE_URL: "postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres"
      ANTHROPIC_API_KEY: "sk-ant-api03-..."
      GEMINI_API_KEY: ""                    # 사용 시 키 입력
      XAI_API_KEY: ""                       # 사용 시 키 입력
      NAS_ROOT: "/app/nas"
      API_SECRET: "dcprime0979"             # X-API-Secret 인증 키 (프론트엔드와 동일)
      ALLOWED_ORIGINS: "https://dcprime.vercel.app"  # Vercel 배포 URL로 변경
    ports:
      - "8000:8000"
    volumes:
      - uploads:/app/uploads
      - /volume1/DCPRIME:/app/nas   # NAS 실제 경로:컨테이너 내부 경로

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: "[CLOUDFLARE_TUNNEL_TOKEN]"
    depends_on:
      - backend

volumes:
  uploads:
```

> **보안 주의:** `docker-compose.yml`에 API 키와 DB 비밀번호를 직접 넣지 말고, Docker Secrets 또는 `.env` 파일을 사용하는 것을 권장합니다. `.env` 파일은 반드시 `.gitignore`에 포함되어야 합니다.

---

## 3. 백엔드 Docker 빌드 및 NAS 배포

### 3-1. 로컬에서 Docker 이미지 빌드

```bash
# 프로젝트 루트에서 실행
cd /path/to/dcprime-test-

# 백엔드 이미지 빌드 (플랫폼 지정 - NAS가 x86_64인 경우)
docker build \
  --platform linux/amd64 \
  -t dcprime-backend:latest \
  ./backend

# 이미지를 tar 파일로 저장
docker save dcprime-backend:latest -o dcprime-backend.tar
```

> M1/M2 Mac에서 빌드 시 `--platform linux/amd64`를 반드시 지정하세요. 생략하면 NAS(amd64)에서 실행되지 않습니다.

### 3-2. NAS로 tar 파일 업로드

```bash
# SCP로 NAS에 업로드 (NAS IP와 계정은 환경에 맞게 수정)
scp dcprime-backend.tar admin@[NAS_IP]:/volume1/DCPRIME/deploy/

# 또는 Synology File Station에서 직접 업로드
```

### 3-3. NAS에서 이미지 로드 및 컨테이너 재시작

Synology NAS에 SSH 접속 후 실행:

```bash
# NAS SSH 접속
ssh admin@[NAS_IP]

# Docker 이미지 로드
docker load -i /volume1/DCPRIME/deploy/dcprime-backend.tar

# docker-compose 파일 위치로 이동
cd /volume1/DCPRIME/deploy/

# 기존 컨테이너 중지 및 새 이미지로 재시작
docker-compose down
docker-compose up -d

# 실행 확인
docker-compose ps
docker-compose logs -f backend
```

### 3-4. docker-compose.yml NAS 배포 위치

```
/volume1/DCPRIME/deploy/
├── docker-compose.yml
├── dcprime-backend.tar   ← 업로드한 이미지
└── .env                  ← 환경변수 (선택, compose에서 직접 설정해도 됨)
```

### 3-5. 최초 배포 시 DB 마이그레이션

```bash
# 컨테이너가 실행 중인 상태에서
docker-compose exec backend python migrate.py
```

### 3-6. Dockerfile 구조 참고

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# 한글 폰트 설치 (빨간펜 PDF 생성에 필요)
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-nanum \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --timeout=120 -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
```

---

## 4. 프론트엔드 배포 (Vercel)

### 4-1. 배포 방식

GitHub 레포지토리에 `push`하면 Vercel이 자동으로 빌드 및 배포합니다.

```
로컬 코드 수정
    ↓
git push origin main
    ↓
Vercel 자동 빌드 (Next.js)
    ↓
배포 완료 (약 1~2분)
```

### 4-2. Vercel 환경변수 설정

Vercel 대시보드 → 프로젝트 → Settings → Environment Variables에서 아래 항목을 설정합니다.

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `NEXT_PUBLIC_API_URL` | 백엔드 API 베이스 URL (Cloudflare Tunnel 주소) | `https://dcprime-api.example.com` |
| `NEXT_PUBLIC_API_SECRET` | X-API-Secret 인증 키 (백엔드 `API_SECRET`과 동일 값) | `dcprime0979` |

> `NEXT_PUBLIC_` 접두사가 있는 변수는 클라이언트 측에서도 접근 가능합니다.

### 4-3. 로컬 개발 환경 설정

```bash
cd frontend

# 패키지 설치
npm install

# 환경변수 파일 생성
cp .env.example .env.local
# .env.local에 NEXT_PUBLIC_API_URL=http://localhost:8000 입력

# 개발 서버 실행
npm run dev
```

### 4-4. 연결된 GitHub 레포

- `kimikimim/dcprime-test` 또는 `suo1250-lab/dcprime-test`의 `main` 브랜치 push 시 자동 배포

---

## 5. NAS 폴더 경로 환경변수 설정

### 5-1. 기본 경로 구조

`NAS_ROOT` 하나만 설정하면 하위 경로가 자동으로 파생됩니다.

```
NAS_ROOT=/app/nas (컨테이너 내부 경로)
    └── 0. 주간테스트 입학테스트 영어단어테스트/
        └── 자동채점기/
            ├── 영어단어튜터링/
            │   ├── 미채점/           ← UNGRADED_WORD
            │   ├── 채점완료/         ← GRADED_WORD
            │   └── 영어단어테스트답지모음/  ← ANSWER_WORD
            ├── 입학테스트/
            │   ├── 미채점/           ← UNGRADED_ENTRANCE
            │   ├── 채점완료/         ← GRADED_ENTRANCE
            │   └── 입학테스트답지모음/    ← ANSWER_ENTRANCE
            └── 수학/
                ├── 미채점/           ← UNGRADED_MATH
                ├── 채점완료/         ← GRADED_MATH
                └── 수학답지모음(주테omr전용)/  ← ANSWER_MATH

NAS_ROOT/
├── 미채점오류/   ← ERROR_DIR  (처리 실패 파일)
└── 미매칭/      ← UNMATCHED_DIR (학생 매칭 실패 파일)
```

### 5-2. NAS 볼륨 마운트 (docker-compose.yml)

```yaml
volumes:
  - /volume1/DCPRIME:/app/nas
```

- NAS 실제 경로 `/volume1/DCPRIME`이 컨테이너 내부 `/app/nas`로 마운트됩니다.
- `NAS_ROOT=/app/nas`로 설정하면 위 구조를 자동으로 사용합니다.

### 5-3. 개별 경로 커스터마이징

NAS 폴더 구조가 기본값과 다를 경우, 각 경로를 개별 환경변수로 직접 지정할 수 있습니다.

```yaml
environment:
  NAS_ROOT: "/app/nas"
  UNGRADED_WORD: "/app/nas/custom/word/ungraded"
  GRADED_WORD: "/app/nas/custom/word/graded"
  # ... 나머지 경로도 동일하게
```

개별 경로를 설정하면 `NAS_ROOT` 기준 파생 경로를 무시합니다.

### 5-4. 폴더 자동 생성

백엔드 시작 시 `watcher.py`의 `_ensure_dirs()` 함수가 필요한 폴더를 자동으로 생성합니다. NAS에 폴더가 없어도 자동으로 만들어지므로, 볼륨 마운트만 올바르게 되어 있으면 됩니다.

---

## 6. 보안 설정

### 6-1. X-API-Secret 헤더 인증

모든 API 엔드포인트에 비밀 헤더 검증을 적용하여 외부 접근을 차단합니다.

**동작 방식:**
- 모든 HTTP 요청에 `X-API-Secret` 헤더를 포함해야 합니다.
- 헤더가 없거나 값이 틀리면 `401 Unauthorized` 반환.
- CORS preflight(`OPTIONS`) 요청은 헤더 검증에서 제외됩니다.
- `API_SECRET` 환경변수가 비어있으면 검증을 건너뜁니다 (로컬 개발 시 편의).

**설정 방법:**

```
# NAS Docker 환경변수
API_SECRET=dcprime0979

# Vercel 환경변수
NEXT_PUBLIC_API_SECRET=dcprime0979
```

> 두 값이 반드시 동일해야 합니다. 키를 변경할 때는 양쪽 모두 동시에 업데이트하세요.

**키 재발급 방법:**
```bash
# 터미널에서 새 랜덤 키 생성
openssl rand -hex 32
```

### 6-2. Rate Limiting

API 엔드포인트별 분당 최대 호출 횟수를 제한하여 AI 비용 폭탄 및 DoS를 방지합니다.
`slowapi` 라이브러리 기반, IP 주소 단위로 제한합니다.

| 엔드포인트 | 제한 | 이유 |
|---|---|---|
| `POST /word-submissions` (AI 채점) | 120/분 | 학생 일괄 채점 허용 |
| `POST /math-submissions` (OMR 채점) | 120/분 | 학생 일괄 채점 허용 |
| `POST /word-tests/{id}/extract-pdf` | 30/분 | PDF 변환 부하 제한 |
| `POST /word-tutoring/grade-image` | 60/분 | 튜터링 채점 허용 |
| `POST /historical/ingest` | 10/분 | 무거운 일괄 처리 제한 |
| 나머지 GET/조회 | 300/분 | 거의 무제한 |

초과 시 `429 Too Many Requests` 반환.

### 6-3. CORS 설정

`ALLOWED_ORIGINS` 환경변수로 허용 도메인을 제한합니다.

```yaml
# docker-compose.yml
ALLOWED_ORIGINS: "https://dcprime.vercel.app"

# 여러 도메인 허용 시 쉼표 구분
ALLOWED_ORIGINS: "https://dcprime.vercel.app,https://staging.vercel.app"
```

> 설정하지 않으면 기본값 `*` (전체 허용)이 적용됩니다. **프로덕션에서는 반드시 특정 도메인으로 제한하세요.**

### 6-4. 보안 수정 이력 (2026-04-12)

| 분류 | 내용 |
|---|---|
| 인증 | X-API-Secret 헤더 인증 미들웨어 추가 |
| Rate Limiting | slowapi 기반 엔드포인트별 호출 횟수 제한 |
| JSON 파싱 | 모든 AI 응답 파싱을 정규식으로 교체 (split 방식 제거) |
| 경로 탐색 | `nas.py` 파일명 검증 강화 (`Path().name` + 디렉토리 확인) |
| 프롬프트 인젝션 | AI 채점 시 사용자 입력 `_sanitize()` 처리 |
| 하드코딩 | DB URL, API 키 모두 환경변수로 이전 |
| CORS | 허용 메서드·헤더 명시적 지정, 도메인 환경변수화 |
| 동시성 | 인제스트 중복 실행 방지 Lock 추가 |
| DB 트랜잭션 | 단어시험 등록 시 원자적 단일 커밋으로 변경 |

---

## 7. 트러블슈팅

### 7-1. 401 Unauthorized 오류 (X-API-Secret 관련)

**증상:** 프론트엔드에서 모든 API 요청이 401 반환

**원인 및 해결:**

1. **Vercel 환경변수 미설정**
   - Vercel 대시보드 → Settings → Environment Variables에서 `NEXT_PUBLIC_API_SECRET` 확인
   - 값이 NAS Docker의 `API_SECRET`과 동일한지 확인

2. **Docker 환경변수 미설정**
   ```bash
   docker-compose exec backend env | grep API_SECRET
   ```

3. **키 불일치**
   - 양쪽 값이 정확히 동일한지 확인 (공백, 대소문자 주의)

4. **개발 환경에서 검증 비활성화**
   - `API_SECRET` 환경변수를 비워두면 검증을 건너뜁니다.
   ```yaml
   API_SECRET: ""   # 로컬 개발 시
   ```

### 7-2. 429 Too Many Requests (Rate Limiting 관련)

**증상:** 특정 엔드포인트에서 429 반환

**원인:** 분당 허용 횟수 초과 (IP 기준)

**해결 방법:**
- 잠시 후 재시도 (1분 대기)
- 대량 처리가 정상 흐름에서 429가 자주 발생하면 `limiter.py`의 제한 횟수 조정

```python
# backend/limiter.py
limiter = Limiter(key_func=get_remote_address, default_limits=["300/minute"])
# 기본값 300/분, 각 라우터에서 개별 오버라이드 가능
```

### 7-3. 로그 확인

```bash
# 실시간 로그 스트림
docker-compose logs -f backend

# 최근 500줄 로그
docker-compose logs --tail=500 backend

# cloudflared 로그 (터널 연결 확인)
docker-compose logs -f cloudflared

# 특정 키워드로 필터 (예: AI 오류)
docker-compose logs backend | grep -i "error\|fail\|rate"
```

**주요 로그 메시지 의미:**

| 로그 메시지 | 의미 |
|------------|------|
| `[Watcher] 새 파일 감지: ...` | NAS에서 새 파일 감지됨 |
| `[Word] AI 채점 완료: ...` | 단어시험 AI 채점 성공 |
| `[Submission] 백그라운드 채점 완료: sub_id=...` | 채점 결과 DB 저장 완료 |
| `[Submission] NAS 저장 실패: ...` | PDF → NAS 저장 실패 (NAS 연결 확인 필요) |
| `[Confirm] 빨간펜 PDF 저장: ...` | 확정 시 PDF 저장 성공 |
| `AI grading error: ...` | AI API 호출 실패 |

### 7-4. DB 연결 문제

**증상:** `SQLALCHEMY` 관련 에러, API가 500 오류 반환

**원인 및 해결:**

1. **DATABASE_URL 확인**
   ```bash
   docker-compose exec backend env | grep DATABASE_URL
   ```

2. **Supabase 연결 테스트**
   ```bash
   docker-compose exec backend python -c "
   from database import engine
   with engine.connect() as conn:
       print('DB 연결 성공')
   "
   ```

3. **Supabase 연결 포트 확인**
   - Transaction Pooler: 포트 `6543` (권장, 단기 연결에 적합)
   - Session Pooler: 포트 `5432`
   - Direct Connection: 포트 `5432` (Docker 환경에서는 네트워크 제한으로 연결 안 될 수 있음)

4. **연결 풀 고갈**
   - `watcher.py`는 동시 AI 처리를 최대 3개로 제한하는 세마포어(`_PROCESS_SEMAPHORE`)를 사용합니다.
   - DB 연결 에러가 반복되면 Supabase 대시보드에서 활성 연결 수를 확인하세요.

### 7-5. AI Rate Limit 오류

**증상:** `RateLimitError`, `429 Too Many Requests`

**해결 방법:**

1. **다른 AI 공급자로 전환**
   - `GEMINI_API_KEY`, `XAI_API_KEY`, `ANTHROPIC_API_KEY` 중 다른 키를 설정합니다.
   - `ai_utils.py`의 우선순위에 따라 자동으로 전환됩니다.

2. **동시 처리 제한 확인**
   - `watcher.py`의 `_PROCESS_SEMAPHORE = Semaphore(3)` 값을 줄여서 동시 요청 수를 낮춥니다 (예: `Semaphore(1)`).

3. **Claude 모델 확인**
   - 현재 설정: Sonnet (`claude-sonnet-4-6`) 기본, Haiku (`claude-haiku-4-5-20251001`) 고속 처리 시
   - `ai_utils.py`의 `CLAUDE_MODEL`, `CLAUDE_FAST_MODEL` 상수에서 모델 변경 가능

### 7-6. 파일이 미채점오류 폴더로 이동되는 경우

**원인:**
- 지원하지 않는 파일 형식 (HWP, HWPX는 현재 미지원)
- 파일이 손상됨
- 해당 과목의 답지가 DB에 등록되지 않음
- AI API 키 미설정 또는 잘못됨

**확인 방법:**
```bash
docker-compose logs backend | grep "ERROR_DIR\|오류\|실패"
```

### 7-7. NAS 폴더 감시가 작동하지 않는 경우

**증상:** NAS에 파일을 넣어도 채점이 시작되지 않음

**확인 사항:**

1. **watcher 스레드 실행 여부 확인**
   ```bash
   docker-compose logs backend | grep -i "watcher\|observer"
   ```

2. **볼륨 마운트 확인**
   ```bash
   docker-compose exec backend ls /app/nas
   ```
   NAS 폴더 내용이 보이지 않으면 볼륨 마운트 설정을 확인하세요.

3. **PollingObserver 사용 여부**
   - `watcher.py`는 네트워크 드라이브(NFS, SMB)와의 호환성을 위해 `PollingObserver`를 사용합니다.
   - 폴링 간격은 기본값(1초)이며, 느린 경우 NAS I/O 성능을 점검하세요.

### 7-8. PDF 생성 실패 (한글 폰트 오류)

**증상:** 생성된 PDF에 한글이 깨지거나 PDF 생성 자체가 실패함

**해결:**

1. **폰트 설치 확인**
   ```bash
   docker-compose exec backend ls /usr/share/fonts/truetype/nanum/
   ```
   `NanumGothic.ttf`가 있어야 합니다.

2. **Dockerfile에 폰트 설치가 포함되어 있는지 확인**
   ```dockerfile
   RUN apt-get update && apt-get install -y --no-install-recommends fonts-nanum
   ```

3. **커스텀 폰트 경로 설정**
   ```yaml
   environment:
     KOREAN_FONT_PATH: "/app/fonts/MyFont.ttf"
   ```
   커스텀 폰트 파일을 볼륨으로 마운트하거나 이미지에 포함시킵니다.

### 7-9. Cloudflare Tunnel 연결 끊김

**증상:** 프론트엔드에서 API 요청 실패, 외부에서 백엔드 접속 불가

**확인 및 재시작:**
```bash
# cloudflared 상태 확인
docker-compose ps cloudflared
docker-compose logs cloudflared

# 재시작
docker-compose restart cloudflared
```

**TUNNEL_TOKEN 만료 시:**
Cloudflare Zero Trust 대시보드에서 새 터널 토큰을 발급받아 `docker-compose.yml`의 `TUNNEL_TOKEN`을 교체한 뒤 컨테이너를 재시작합니다.

### 7-10. 프론트엔드 빌드 실패 (Vercel)

**확인 방법:**
1. Vercel 대시보드 → Deployments 탭에서 실패한 배포의 빌드 로그를 확인합니다.
2. 로컬에서 빌드 테스트:
   ```bash
   cd frontend
   npm run build
   ```

**자주 발생하는 원인:**
- `NEXT_PUBLIC_API_URL` 환경변수 미설정
- TypeScript 타입 오류
- npm 패키지 의존성 충돌

### 7-11. 학생 이름 자동 매칭 실패

**증상:** 채점은 완료되었으나 `/unmatched-submissions`에 결과가 들어감

**원인:**
- 파일명의 학생 이름과 DB에 등록된 학생 이름의 유사도가 기준치 미만
- `watcher.py`는 `SequenceMatcher`를 사용하여 유사도 기반으로 이름을 매칭합니다.

**해결:**
- 웹 `/unmatched-submissions` 페이지에서 해당 채점 건을 열고 **[학생 지정]** 기능으로 수동 연결합니다.
- 반복 발생 시 DB의 학생 이름과 파일명 표기를 통일하세요 (예: 공백, 특수문자 차이).

---

## 참고: 주요 파일 구조

```
dcprime-test-/
├── backend/
│   ├── main.py            # FastAPI 앱 진입점, 라우터 등록, watcher 시작
│   ├── watcher.py         # NAS 폴더 감시, AI 자동채점 메인 로직
│   ├── ai_utils.py        # AI API 공통 호출 (Gemini/Grok/Claude 멀티 공급자)
│   ├── config.py          # 환경변수 중앙 관리 (경로, API 키)
│   ├── models.py          # SQLAlchemy ORM 모델 정의
│   ├── database.py        # DB 엔진 및 세션 설정
│   ├── migrate.py         # DB 마이그레이션
│   ├── Dockerfile
│   ├── requirements.txt
│   └── routers/
│       ├── students.py         # 학생 CRUD, 엑셀 import/export
│       ├── word_submissions.py # 단어시험 채점 검토/확정, 빨간펜 PDF
│       ├── word_tests.py       # 단어시험 답지 관리
│       ├── math_submissions.py # 수학 OMR 채점 결과
│       ├── math_tests.py       # 수학 시험 답지 관리
│       ├── results.py          # 입학테스트 결과
│       ├── tests.py            # 입학테스트 시험 관리
│       ├── analytics.py        # 성적 통계
│       ├── classes.py          # 반 관리
│       ├── historical.py       # 과거 성적 데이터
│       ├── nas.py              # NAS 상태 확인 API
│       └── word_config.py      # 선생님별 단어시험 설정
├── frontend/
│   └── app/
│       └── (teacher)/    # 선생님 전용 페이지 라우트
├── docker-compose.yml
└── db/                   # DB 초기화 스크립트
```

---

*이 매뉴얼은 시스템 변경 시 업데이트해 주세요.*
