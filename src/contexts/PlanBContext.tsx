import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Coordinates } from '../frontend/components/map/map.types';

export type PlanBInput = {
  date: string;
  startTime: string;
  endTime: string;
  selfCareCategory: string;
  customCategory: string;
  condition: string;
  continuityMode: string;
  currentLocation: Coordinates | null;
};
type PlanBContextValue = { input: PlanBInput; setInput: (input: PlanBInput) => void };
const initialInput: PlanBInput = { date: '', startTime: '', endTime: '', selfCareCategory: '', customCategory: '', condition: '', continuityMode: '', currentLocation: null };
const PlanBContext = createContext<PlanBContextValue | null>(null);

export function PlanBProvider({ children }: { children: ReactNode }) {
  const [input, setInput] = useState(initialInput);
  const value = useMemo(() => ({ input, setInput }), [input]);
  return <PlanBContext.Provider value={value}>{children}</PlanBContext.Provider>;
}

export function usePlanB() {
  const context = useContext(PlanBContext);
  if (!context) throw new Error('usePlanB must be used inside PlanBProvider');
  return context;
}
