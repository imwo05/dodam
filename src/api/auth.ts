import { apiRequest } from './client';

export type AuthUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  age: number | null;
  profileImageUrl: string | null;
  aiStyle: 'T' | 'F';
  onboardingCompleted: boolean;
};

export type SignupInput = {
  name: string;
  username: string;
  password: string;
  email: string;
  age: number;
};

export type SignupResponse = { user: AuthUser; accessToken: string };
export type LoginResponse = {
  accessToken: string;
  user: { id: string; username: string };
  onboardingCompleted: boolean;
};

export function signup(input: SignupInput) {
  return apiRequest<SignupResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export function login(username: string, password: string) {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

export function getCurrentUser(accessToken: string) {
  return apiRequest<AuthUser>('/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

export function recoverUsername(email: string) {
  return apiRequest<{ maskedUsername: string | null }>('/auth/username-recovery', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

export function requestPasswordReset(username: string, email: string) {
  return apiRequest<{ requested: boolean; resetToken: string | null }>('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ username, email })
  });
}

export function confirmPasswordReset(token: string, newPassword: string) {
  return apiRequest<{ reset: boolean }>('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword })
  });
}

export async function logout(accessToken: string) {
  await apiRequest<null>('/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}
