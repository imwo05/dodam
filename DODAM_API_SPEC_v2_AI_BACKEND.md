# DODAM API v2 — P0 backend contract

This repository contract records the current frontend-integration decisions. The in-memory store is intentional for the hackathon MVP.

## Plan B

`POST /api/v1/plan-b/recommendations` accepts:

```json
{
  "date": "YYYY-MM-DD",
  "startTime": "HH:mm",
  "endTime": "HH:mm",
  "brokenScheduleId": "sch_001",
  "selfCareCategory": "WALK",
  "customCategory": null,
  "condition": "NORMAL",
  "continuityMode": "AUTO",
  "location": { "latitude": 37.5, "longitude": 127.0 }
}
```

The response directly contains the persisted course:

```json
{
  "sessionId": "pb_001",
  "status": "RECOMMENDED",
  "availableMinutes": 120,
  "bufferMinutes": 18,
  "usableMinutes": 102,
  "aiStyle": "F",
  "reframedGoal": { "originalGoal": "...", "newGoal": "...", "reason": "..." },
  "summary": "...",
  "courseConcept": "...",
  "damiState": "WALKING",
  "course": {
    "totalMinutes": 45,
    "stops": [],
    "finalTravel": null
  }
}
```

`GET /api/v1/plan-b/{sessionId}/course` returns the same persisted course. Regeneration accepts `{ "excludePlaceIds": ["plc_001"] }` and returns the same response shape.

Course editing uses `POST /course/stops` with `placeId` and optional `insertAfterStopId`, `DELETE /course/stops/{stopId}`, and `PATCH /course/order` with `{ "stopIds": [] }`. Every edit is fully recalculated; invalid edits return `COURSE_TIME_EXCEEDED` or `INVALID_COURSE_ORDER`, and a course always retains at least one stop. Editing is unavailable after start.

Session transitions are `RECOMMENDED → IN_PROGRESS → COMPLETED`, with `RECOMMENDED/IN_PROGRESS → CANCELLED`. Stop transitions are `NOT_STARTED → IN_PROGRESS → COMPLETED` or `NOT_STARTED/IN_PROGRESS → SKIPPED`. Completion creates at most one `UserActivity` per Plan B stop.

The next fixed schedule constrains the effective end time only. No route to that schedule's location is calculated. Current location to the first stop and stop-to-stop travel are supplied by the replaceable `RouteProvider`; its current MVP implementation is a geodesic estimator.

## AI contract

The backend sends only hard-filtered candidates to `ai-service`. The structured Plan B result is:

```json
{
  "reframedGoal": { "originalGoal": "...", "newGoal": "...", "reason": "..." },
  "selectedExperienceIds": ["plc_001"],
  "courseConcept": "...",
  "summary": "...",
  "stopReasons": [{ "placeId": "plc_001", "reason": "..." }],
  "damiState": "WALKING"
}
```

AI may select only supplied place IDs and never calculates travel time. The backend validates IDs and falls back to deterministic candidate ranking if the AI service fails. `aiStyle` is `T` (factual/concrete/concise) or `F` (supportive/reassuring/encouraging/concrete), and affects wording only.

## Places and map

Places support `geometryType: "POINT"` with `point`, or `geometryType: "SEGMENT"` with `startPoint`, `endPoint`, and optional `encodedPolyline`. Flat `latitude/longitude` remains accepted for backward compatibility with seeded POINT places. Map search uses a bounding box; the MVP has no external geocoding or routing provider.

## Self-care and garden

Self-care profiles accept optional `aiStyle: "T" | "F"` (default `F`). `GET /api/v1/users/me/garden` returns `completedActivityCount`, `pointBalance`, and `categoryGrowth[{category,count,stage}]`. Growth is deterministic and category-based; no location marker is persisted.

Review and Journal contracts remain unchanged.

## Onboarding personalization

`POST /api/v1/onboarding/conversations` creates an `ACTIVE` conversation and returns the first assistant message. Messages are added with:

```json
POST /api/v1/onboarding/conversations/{conversationId}/messages
{ "content": "..." }
```

The response contains `conversation`, `userMessage`, `assistantMessage`, `profile`, `missingSlots`, and `canComplete`. The internal AI turn contract is:

```json
{
  "assistantMessage": "...",
  "extractedProfilePatch": {
    "selfCareGoals": [],
    "selfCareDifficultyReasons": [],
    "planChangeReasons": [],
    "difficultyAfterPlanChange": [],
    "availableFallbackMinutes": null,
    "preferredActivities": [],
    "preferredAtmospheres": [],
    "avoidAtmospheres": [],
    "preferredIntensity": null,
    "socialPreference": null,
    "aiStyle": null
  },
  "missingSlots": [],
  "completed": false
}
```

`GET /api/v1/onboarding/conversations/{conversationId}` returns the complete raw message history and current structured profile. `POST /api/v1/onboarding/conversations/{conversationId}/complete` requires the minimum useful profile fields and marks the conversation and user onboarding as complete. Raw messages and structured profile are separate store entities.
