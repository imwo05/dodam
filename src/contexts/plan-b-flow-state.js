export const MAX_SEEN_PLACE_IDS = 100;

function uniquePlaceIds(placeIds) {
  return [...new Set(placeIds.map(String).filter(Boolean))].slice(-MAX_SEEN_PLACE_IDS);
}

export function startNewPlanBState(initialInput, initialContext = {}) {
  return {
    input: {
      ...initialInput,
      ...initialContext,
      currentLocation: initialContext.currentLocation ?? null,
      brokenScheduleId: initialContext.brokenScheduleId ?? null
    },
    sessionId: null,
    seenPlaceIds: []
  };
}

export function resumePlanBState(flow, sessionId) {
  return {
    ...flow,
    sessionId,
    seenPlaceIds: flow.sessionId === sessionId ? flow.seenPlaceIds : []
  };
}

export function recordShownPlacesState(flow, sessionId, placeIds) {
  return {
    ...flow,
    sessionId,
    seenPlaceIds: uniquePlaceIds([
      ...(flow.sessionId === sessionId ? flow.seenPlaceIds : []),
      ...placeIds
    ])
  };
}
