# Frontend map integration handoff

## Current environment

- Framework: React + TypeScript + Vite
- Frontend source: `src/frontend/`
- Development origin: `http://localhost:5173`
- Run: `npm run dev`
- Backend development URL: `http://localhost:3000`
- API base used by the frontend: `/api/v1`
- Future map provider: NAVER Maps
- Current status: NAVER Maps SDK is not connected yet.

Vite is configured with `port: 5173` and `strictPort: true`. It proxies
`/api` requests to `http://localhost:3000`, so the frontend can keep using
same-origin requests such as `/api/v1/auth/login` during development.

The backend currently allows development CORS requests from the frontend
origin (`Access-Control-Allow-Origin: *`). No backend changes are required for
this preparation task.

## Map boundary

The reusable component contract is:

- `src/frontend/components/map/MapView.tsx`
- `src/frontend/components/map/map.types.ts`
- `src/frontend/components/map/index.ts`

Supported modes are `EXPLORE`, `POINT`, and `SEGMENT`:

```tsx
<MapView mode="EXPLORE" places={places} onPlaceSelect={onPlaceSelect} />
<MapView mode="POINT" point={point} onPointChange={onPointChange} />
<MapView
  mode="SEGMENT"
  startPoint={startPoint}
  endPoint={endPoint}
  onSegmentChange={onSegmentChange}
/>
```

`MapView` currently renders only a provider-neutral container. It does not
load the NAVER SDK, render fake tiles, add pins, or contain sample places.

Frontend map coordinates use `{ lat, lng }`. The current backend Place API
uses `{ latitude, longitude }` in `point`, `startPoint`, `endPoint`, and some
top-level fields. That mismatch is represented explicitly by `BackendPlace`
and `BackendPlaceCoordinates`; a future API adapter must perform the mapping.

The current Place endpoints are available under `/api/v1/places`, including
`/map`, `/search`, and `/:placeId`. The frontend boundary keeps uncertain
display fields optional and does not lock in speculative Place DB fields.

Browser location is separate from the map provider at:
`src/frontend/services/geolocation.ts`. `getCurrentPosition()` wraps
`navigator.geolocation.getCurrentPosition()` and is never called automatically.

## Environment variable

The committed placeholder is:

```dotenv
VITE_NAVER_MAP_CLIENT_ID=
```

Do not commit a real value. This is the browser SDK client identifier only.
Any future NAVER REST credentials belong in backend environment configuration,
not in Vite variables.

## Future Figma consumers

- Plan B map exploration: Figma `291:4400`
- Place creation POINT: Figma `291:5368`
- Place creation SEGMENT: Figma `440:2030`

Those screens are not implemented in this task. Another teammate can register
`http://localhost:5173` as the local Web Service URL / development origin for
the NAVER Maps browser integration.
