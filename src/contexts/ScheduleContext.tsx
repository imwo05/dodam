import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  createSchedule,
  createSchedules,
  deleteSchedule,
  getSchedulesForDates,
  updateSchedule,
  type Schedule,
  type ScheduleWriteInput
} from '../api/schedules';

type ScheduleContextValue = {
  schedules: Schedule[];
  loading: boolean;
  error: string | null;
  loadDates: (accessToken: string, dates: string[]) => Promise<Schedule[]>;
  create: (accessToken: string, input: ScheduleWriteInput) => Promise<Schedule>;
  createMany: (accessToken: string, date: string, inputs: Omit<ScheduleWriteInput, 'date'>[]) => Promise<Schedule[]>;
  update: (accessToken: string, scheduleId: string, input: Partial<ScheduleWriteInput>) => Promise<Schedule>;
  remove: (accessToken: string, scheduleId: string) => Promise<void>;
};

const ScheduleContext = createContext<ScheduleContextValue | null>(null);

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : '일정을 불러오지 못했어요.';
}

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDates = useCallback(async (accessToken: string, dates: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const next = await getSchedulesForDates(accessToken, [...new Set(dates)]);
      const dateSet = new Set(dates);
      setSchedules((current) => [...current.filter((schedule) => !dateSet.has(schedule.date)), ...next]);
      return next;
    } catch (requestError) {
      setError(messageFor(requestError));
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (accessToken: string, input: ScheduleWriteInput) => {
    setLoading(true);
    setError(null);
    try {
      const created = await createSchedule(accessToken, input);
      setSchedules((current) => [...current.filter((schedule) => schedule.id !== created.id), created]);
      return created;
    } catch (requestError) {
      setError(messageFor(requestError));
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, []);

  const createMany = useCallback(async (accessToken: string, date: string, inputs: Omit<ScheduleWriteInput, 'date'>[]) => {
    setLoading(true);
    setError(null);
    try {
      const result = await createSchedules(accessToken, date, inputs);
      setSchedules((current) => [...current, ...result.schedules.filter((created) => !current.some((schedule) => schedule.id === created.id))]);
      return result.schedules;
    } catch (requestError) {
      setError(messageFor(requestError));
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(async (accessToken: string, scheduleId: string, input: Partial<ScheduleWriteInput>) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await updateSchedule(accessToken, scheduleId, input);
      setSchedules((current) => [...current.filter((schedule) => schedule.id !== updated.id), updated]);
      return updated;
    } catch (requestError) {
      setError(messageFor(requestError));
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(async (accessToken: string, scheduleId: string) => {
    setLoading(true);
    setError(null);
    try {
      await deleteSchedule(accessToken, scheduleId);
      setSchedules((current) => current.filter((schedule) => schedule.id !== scheduleId));
    } catch (requestError) {
      setError(messageFor(requestError));
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(() => ({ schedules, loading, error, loadDates, create, createMany, update, remove }), [create, createMany, error, loadDates, loading, remove, schedules, update]);
  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedules() {
  const context = useContext(ScheduleContext);
  if (!context) throw new Error('useSchedules must be used inside ScheduleProvider');
  return context;
}
