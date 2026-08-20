import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Coordinates } from '../frontend/components/map/map.types';
import { recordShownPlacesState, resumePlanBState, startNewPlanBState, type PlanBFlowState } from './plan-b-flow-state.js';

export type PlanBInput = {
  date: string;
  startTime: string;
  endTime: string;
  selfCareCategory: string;
  customCategory: string;
  condition: string;
  continuityMode: string;
  currentLocation: Coordinates | null;
  brokenScheduleId?: string | null;
};

export type PlanBInitialContext = Partial<PlanBInput>;

type PlanBContextValue = {
  input: PlanBInput;
  sessionId: string | null;
  seenPlaceIds: string[];
  setInput: (input: PlanBInput) => void;
  startNewPlanB: (initialContext?: PlanBInitialContext) => void;
  resumePlanB: (sessionId: string) => void;
  recordShownPlaces: (sessionId: string, placeIds: string[]) => void;
  resetPlanB: () => void;
};

const initialInput: PlanBInput = { date: '', startTime: '', endTime: '', selfCareCategory: '', customCategory: '', condition: '', continuityMode: '', currentLocation: null, brokenScheduleId: null };
const PlanBContext = createContext<PlanBContextValue | null>(null);

export function PlanBProvider({ children }: { children: ReactNode }) {
  const [flow, setFlow] = useState<PlanBFlowState>({ input: initialInput, sessionId: null, seenPlaceIds: [] });
  const setInput = useCallback((input: PlanBInput) => {
    setFlow((current) => ({ ...current, input }));
  }, []);
  const startNewPlanB = useCallback((initialContext: PlanBInitialContext = {}) => {
    setFlow(startNewPlanBState(initialInput, initialContext));
  }, []);
  const resumePlanB = useCallback((nextSessionId: string) => {
    setFlow((current) => resumePlanBState(current, nextSessionId));
  }, []);
  const recordShownPlaces = useCallback((nextSessionId: string, placeIds: string[]) => {
    setFlow((current) => recordShownPlacesState(current, nextSessionId, placeIds));
  }, []);
  const resetPlanB = useCallback(() => { startNewPlanB(); }, [startNewPlanB]);
  const value = useMemo(() => ({ input: flow.input, sessionId: flow.sessionId, seenPlaceIds: flow.seenPlaceIds, setInput, startNewPlanB, resumePlanB, recordShownPlaces, resetPlanB }), [flow, setInput, startNewPlanB, resumePlanB, recordShownPlaces, resetPlanB]);
  return <PlanBContext.Provider value={value}>{children}</PlanBContext.Provider>;
}

export function usePlanB() {
  const context = useContext(PlanBContext);
  if (!context) throw new Error('usePlanB must be used inside PlanBProvider');
  return context;
}
