# 도담 장소 DB 베타

`data/`의 세 CSV는 장소 기본 정보와 도담 고유 경험 데이터를 분리한 베타 원본입니다.

| 파일 | 단위 | 용도 |
| --- | --- | --- |
| `dodam_places_beta.csv` | Point | 실제 머무는 장소와 좌표, 분위기 |
| `dodam_walk_segments_beta.csv` | Segment | 검수된 산책 이동 구간 |
| `dodam_experiences_beta.csv` | Experience | 상황·시간·날씨에 맞춘 실행 경험 |

## 데이터 상태

현재 모든 행은 `CANDIDATE` 또는 `DRAFT`입니다. 주소·좌표는 API와 현장 답사로 확인하기 전까지 추천 운영 데이터로 승격하지 않습니다. `image_url`은 저작권과 대표성 검토가 끝난 뒤에만 입력합니다.

```bash
npm run validate:place-db
```

검증은 필수 컬럼, 좌표 범위, 서초·종로 필터 및 Point–Segment–Experience 참조 관계를 검사합니다. 앱 시작 시 Point는 기존 장소 모델로도 로드되며, 원래 메타데이터(`district`, `wellnessType`, `moodTags`, `sourceStatus`)를 보존합니다.

## 네이버 API 수집 순서

1. `GET /api/v1/geo/addresses?query=양재시민의숲`로 지역 검색 후보와 Geocoding 좌표를 받습니다.
2. 주소·중복·생활권을 검토한 뒤 `dodam_places_beta.csv`에 후보를 추가합니다.
3. 산책 구간과 상황별 경험은 현장 답사 후 각각 Segment와 Experience CSV에 추가합니다.

`NAVER_MAPS_CLIENT_ID/SECRET`이 설정되면 `/geo/reverse`와 주소 기반 `/geo/addresses`가 Maps API를 사용합니다. 여기에 `NAVER_SEARCH_CLIENT_ID/SECRET`까지 설정하면 `/geo/addresses`가 지역 검색 후보를 먼저 수집한 뒤 각 후보를 좌표화합니다. 키가 없는 개발 환경에서는 응답의 `provider: "MOCK"`으로 명확히 구분된 데모 결과를 반환합니다. API Secret은 서버 환경변수에만 둡니다.

이 프로젝트는 도보·대중교통 시간을 고정 저장하지 않습니다. `estimated_walk_min`은 현장 검수된 산책 구간의 기준 소요 시간이며, 사용자별 길찾기는 네이버 지도 앱 링크 등 클라이언트 실시간 경로로 처리합니다.
