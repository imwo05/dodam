# DODAM AI 서비스

순수 Node.js (의존성 0). 백엔드가 호출하는 AI 엔드포인트 제공.

## 엔드포인트

| Method | Path | 설명 |
|---|---|---|
| GET | `/health` | 상태 + OpenAI 사용 여부 |
| POST | `/analyze-concern` | 자기관리 고민 텍스트 → 카테고리 + 요약 |
| POST | `/plan-b-reasons` | 상황·후보 장소 → 추천 이유 + 요약 |

## 실행

```bash
cp .env.example .env      # OpenAI 키 쓸 거면 입력 (없어도 동작)
AI_PORT=8000 node server.js
```

OpenAI 키가 있으면 LLM(gpt-4o-mini), 없으면 키워드/규칙 기반 휴리스틱으로 폴백한다.
따라서 키 없이도 항상 200을 반환하며, 백엔드는 이 서비스가 죽어 있어도 자체 폴백으로 동작한다.
