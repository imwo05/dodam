import type { PlanBInitialContext, PlanBInput } from './PlanBContext';

export type PlanBFlowState = {
  input: PlanBInput;
  sessionId: string | null;
  seenPlaceIds: string[];
};

export const MAX_SEEN_PLACE_IDS: number;
export function startNewPlanBState(initialInput: PlanBInput, initialContext?: PlanBInitialContext): PlanBFlowState;
export function resumePlanBState(flow: PlanBFlowState, sessionId: string): PlanBFlowState;
export function recordShownPlacesState(flow: PlanBFlowState, sessionId: string, placeIds: string[]): PlanBFlowState;
