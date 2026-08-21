# DODAM 도담

> 계획이 틀어진 순간에도 오늘을 포기하지 않도록, 현재 상황과 실제 생활권 경험 데이터를 바탕으로 실행 가능한 Plan B를 설계하는 AI 웰니스 서비스입니다.

## DODAM이 해결하는 문제

일정은 야근, 피로, 약속, 날씨처럼 일상적인 이유로 자주 바뀝니다. 도담은 Plan A의 실패를 기록하는 대신, 남은 시간·컨디션·자기관리 목표를 다시 해석해 오늘 가능한 작은 행동을 제안합니다.

```text
계획 변화
→ 목표 재정의
→ 실제 Place 후보 검색
→ 실행 가능한 Plan B 코스
→ 경험 기록과 회고
```

## MVP 기능

- **Start / Auth / Onboarding** — 회원가입·로그인, 기본 온보딩, 담이와의 AI 대화 기반 개인화, 온보딩 완료
- **Schedule** — 일간·주간 일정, 일정 생성·수정·삭제, 깨진 일정을 Plan B 입력으로 전달
- **Plan B** — 지도 탐색과 AI 추천을 분리한 탭, 목표 재정의, 후보 검증, 코스 편집·실행·재추천
- **Place** — POINT·SEGMENT Place CRUD, 검색·상세·영역 조회, 저장한 장소, 대표 사진 선택 UI
- **Review / Journal / Archive / Garden** — 공개 후기, 개인 기록, 활동 이력·저장 장소, 활동 기반 정원 상태

## Plan B

Plan B는 장소 이름을 생성하는 추천기가 아닙니다. 서버가 먼저 실제 DB에 있는 후보를 하드 필터링하고, AI는 그 후보 안에서 목표 재정의와 코스 구성을 보조합니다. AI 또는 네트워크 오류가 나면 deterministic fallback이 같은 검증 규칙을 사용합니다.

```text
입력(시간·카테고리·컨디션·연속성·선택 위치)
→ ContextBuilder
→ CandidateRetriever / hard filter
→ AI 선택 또는 deterministic fallback
→ 서버 검증
→ Plan B course
```

- 사용자가 직접 장소 수를 지정하지 않습니다. 가용 시간과 후보 조건으로 백엔드가 적절한 stop 수를 결정합니다.
- 재추천은 현재·이미 본 Place ID를 제외하고 후보를 다시 구성합니다. 후보가 소진된 경우에만 재사용 사유를 드러냅니다.
- 새 Plan B는 이전 draft를 초기화하며, 명시적으로 진행 중 세션을 이어갈 때만 서버 세션을 복원합니다.
- Plan B 루트는 **지도 탐색**과 **담이의 추천** 중 하나의 탭 패널만 렌더링합니다.

## Place: Micro-location Experience

Place는 단순 POI가 아니라 사용자가 실제로 수행할 수 있는 경험 단위입니다.

| 유형 | 데이터 모델 | 예시 |
| --- | --- | --- |
| `POINT` | `latitude`, `longitude` | 카페, 서점, 운동 시설, 휴식 공간 |
| `SEGMENT` | `startLatitude`, `startLongitude`, `endLatitude`, `endLongitude` | 산책 구간, 하천 산책로, 공원 내부 루트 |

현재 seed source는 **306 POINT**, **3 SEGMENT**, **306 experience metadata**를 검증합니다.

```bash
npm run validate:place-db
```

대표 사진은 한 장을 선택·미리보기할 수 있습니다. 실제 binary Storage가 연결되지 않은 환경에서는 임시 object URL이나 가짜 영구 URL을 Place 데이터에 저장하지 않습니다.

## Architecture

```text
React + TypeScript + Vite
        │
        ▼
Node.js REST API ── Supabase repository / PostgreSQL
        │
        ├── Schedule · Place · Saved Place · Plan B · Review · Journal
        │
        ▼
AI service (OpenAI when configured, deterministic fallback otherwise)
```

### AI와 백엔드의 책임

AI는 자연어 온보딩, profile 추출, Goal Reframing, 후보 안에서의 선택과 설명을 담당합니다. 백엔드는 인증·권한, 실제 Place 후보 검색, Place ID 검증, 시간·위치 제약, 세션 상태와 영속화를 담당합니다.

OpenAI 호출은 15초 timeout을 사용하고 timeout·network·429·5xx 같은 일시적 오류에 최대 한 번 재시도합니다. 최대 시도 횟수는 2회이며, 실패하면 검증 가능한 fallback으로 계속 진행합니다.

## Tech Stack

- Frontend: React, TypeScript, Vite, CSS
- Backend: Node.js, ESM, REST API, repository pattern
- AI: OpenAI API (선택), structured output 검증, deterministic fallback
- Database: Supabase / PostgreSQL
- Map: NAVER Maps JavaScript SDK (별도 client ID 필요)

## Local Development

Node.js 20 이상이 필요합니다.

```bash
npm install

# 선택: OpenAI 기반 AI service
cp ai-service/.env.example ai-service/.env
npm run start:ai

# 별도 터미널에서 API server
cp .env.example .env
npm start

# 별도 터미널에서 frontend
npm run dev
```

- API: `http://localhost:3000/api/v1`
- frontend: `http://localhost:5173`
- Vite dev server는 `/api` 요청을 API server로 proxy합니다.

### Validation

```bash
npm run build
node --test tests/*.test.js
npm run validate:place-db
git diff --check
```

## Supabase

Supabase persistence를 사용하려면 backend 환경변수를 설정합니다. migration을 적용하기 전에는 항상 dry-run을 먼저 실행합니다.

```bash
supabase migration list
supabase db push --dry-run
```

`supabase db reset`은 원격 데이터를 삭제할 수 있으므로 이 MVP의 연결된 환경에서는 사용하지 않습니다.

## Environment Variables

실제 값은 로컬/배포 환경에만 보관하고 Git에 커밋하지 않습니다.

### Backend `.env`

```env
PORT=
JWT_SECRET=
ACCESS_TOKEN_TTL_SECONDS=
REFRESH_TOKEN_TTL_SECONDS=
AI_BASE_URL=
PERSISTENCE_ADAPTER=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NAVER_SEARCH_CLIENT_ID=
NAVER_SEARCH_CLIENT_SECRET=
NAVER_MAPS_CLIENT_ID=
NAVER_MAPS_CLIENT_SECRET=
VITE_NAVER_MAP_CLIENT_ID=
```

### AI service `ai-service/.env`

```env
OPENAI_API_KEY=
AI_PORT=
AI_API_KEY=
```

`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, NAVER client secret과 JWT secret은 브라우저에 노출되는 `VITE_` 변수에 넣지 않습니다.

## NAVER Maps deployment behavior

NAVER Maps는 별도로 발급받은 `VITE_NAVER_MAP_CLIENT_ID`와 등록된 서비스 URL이 필요합니다. 해커톤 제출 배포 환경에는 이 credential을 포함하지 않으므로, client ID가 없으면 지도 SDK를 로드하지 않고 paper-style 비활성 상태를 표시합니다.

- 다른 지도 provider나 가짜 지도 타일·좌표·응답으로 대체하지 않습니다.
- Place 목록·카드와 지도와 무관한 Plan B 기능은 계속 동작합니다.
- POINT·SEGMENT API 데이터 계약은 유지됩니다.
- 발급된 client ID를 제공한 뒤 frontend를 다시 빌드하면 기존 NAVER Maps 동작이 코드 변경 없이 활성화됩니다.

## Current MVP Limitations

- 제출 배포 환경에서는 NAVER Maps credential이 없으므로 지도 기능이 비활성화됩니다.
- 대표 사진 선택 UI는 있지만 Supabase Storage 기반 binary 업로드는 향후 범위입니다.
- SEGMENT는 시작점과 끝점을 저장하며, 실제 도보 경로를 따르는 polyline·이동시간 계산은 MVP 범위가 아닙니다.
- 온보딩·활동 데이터를 추천에 사용하지만 장기 행동학습 추천 모델은 아직 구현하지 않았습니다.

## Security

- `.env`, `ai-service/.env`, `supabase/.temp/`, `node_modules/`, `dist/` 및 실제 secret은 커밋하지 않습니다.
- AI에는 추천에 필요한 최소 context만 전달하며, 비밀번호·secret·불필요한 전체 일정·Journal 원문은 전달하지 않습니다.

---

**계획대로 살지 못한 날에도, 나를 돌보는 방법은 남아 있습니다.**
