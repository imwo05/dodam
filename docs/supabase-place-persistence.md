# Place persistence

`PERSISTENCE_ADAPTER=supabase` (or both Supabase credentials) makes the
application read and write Places through `places` and `saved_places` in
Supabase/PostgreSQL. Without that configuration, the same handlers use the
existing in-memory adapter for local tests and demos.

The application server never reads the CSV files. The CSVs under
`data/place-seed/` are consumed only by `validate:place-db` and the explicit
`seed:place-db` import command. Each imported Point or Segment uses its stable
`source_id` as an upsert key, so rerunning the command is idempotent.

POINT rows store `latitude` and `longitude`. SEGMENT rows store required start
and end coordinates and may store an optional encoded polyline. Map bounds use
the point coordinate for POINT and a segment bounding-box intersection rule
for SEGMENT. The API keeps `latitude`/`longitude`; a frontend adapter can map
these to `lat`/`lng` at the map boundary.

Seed `source_status`, wellness type, source rows, experience ids, and
experience intensity conflicts are retained in `source_metadata`. The
explicit existing wellness mapping is `운동 → EXERCISE`, `산책/자연 → WALK`,
and `독서/집중/휴식/문화 → MENTAL_HEALTH`; the original wellness value remains
available as `sourceWellnessType`.

Image URLs are empty when the source has no actual image. Binary Supabase
Storage upload is intentionally not part of this migration.

The NAVER geo endpoints reuse the existing server-side implementation in
`src/modules/geo/naver.js` and `src/modules/geo/handlers.js`. Optional names
are `NAVER_SEARCH_CLIENT_ID`, `NAVER_SEARCH_CLIENT_SECRET`,
`NAVER_MAPS_CLIENT_ID`, and `NAVER_MAPS_CLIENT_SECRET`.
