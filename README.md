# DODAM — Backend & AI

자기관리 웰니스 앱 **도담(DODAM)** 의 백엔드 + AI 서비스.
순수 Node.js (ESM, 외부 의존성 0) · 인메모리 스토어 · JWT 인증.

## 구성

```
src/            백엔드 API 서버 (포트 3000)
ai-service/     AI 서비스 (포트 8000) — 고민 분석 · Plan B 추천 이유
```

- 백엔드가 AI가 필요할 때 `ai-service` 를 호출한다.
- `ai-service` 는 OpenAI 키가 있으면 LLM, 없으면 휴리스틱으로 폴백한다.
- **ai-service 없이 백엔드만 띄워도** 로컬 폴백으로 전 기능이 동작한다 (데모용).

## 실행

```bash
# 1) 환경변수 준비
cp .env.example .env
cp ai-service/.env.example ai-service/.env   # OpenAI 키 쓸 거면 여기에 입력

# 2) AI 서비스 (선택)
AI_PORT=8000 node ai-service/server.js

# 3) 백엔드
node src/server.js        # http://localhost:3000/api/v1
```

Node 20 이상 필요. 별도 설치 패키지 없음.

## 주요 도메인

- **Auth** — 회원가입 / 로그인 / 아이디·비번 찾기 (JWT)
- **Self-care** — 자기관리 프로필, AI 고민 분석, 온보딩 완료
- **Schedule** — 일정 등록/조회(주·일), 이전 일정 복사
- **Place** — 장소 CRUD, 지도/검색, 저장, 실시간·일정 추천
- **Plan B** — 상황(컨디션·계획유지수준) 기반 장소 추천 + 코스 구성 + 진행
- **Review / Journal** — 공개 후기, 개인 경험 기록(+캘린더)
- **Archive / My Page** — 방문 통계·활동 기록, 이웃, 다람쥐의 정원
- **Geo / Upload** — 주소 검색·역지오코딩, 이미지 업로드 (데모 스텁)

전체 엔드포인트 규격은 API 명세서를 참고.

## 응답 형식

```json
// 성공
{ "success": true, "data": { ... }, "message": null }
// 실패
{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }
```

인증이 필요한 요청은 헤더에 `Authorization: Bearer {accessToken}`.

> ⚠️ `.env`, `ai-service/.env` 는 절대 커밋하지 말 것 (OpenAI 키 포함). `.gitignore` 에 등록되어 있음.

## 장소 DB 베타

서초·종로 생활권의 Point / Segment / Experience 원본은 `data/`에서 관리합니다.

```bash
npm run validate:place-db
```

네이버 API 환경변수와 수집 규칙은 [docs/place-db.md](docs/place-db.md)를 참고하세요.
