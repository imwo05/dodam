export type ApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  message?: string | null;
  error?: { code: string; message: string };
};

export const API_BASE = '/api/v1';

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) }
  });
  if (response.status === 204) return null as T;
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.success) throw new Error(payload.error?.message ?? payload.message ?? '요청을 처리하지 못했어요.');
  return payload.data as T;
}
