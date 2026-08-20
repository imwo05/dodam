import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AppShell, PageHeader } from '../components/AppShell';
import { AuthField } from '../components/AuthField';

type HelpMode = 'username' | 'password' | null;

function HelpPanel({ mode, onClose }: { mode: Exclude<HelpMode, null>; onClose: () => void }) {
  const { recoverUsername, requestPasswordReset, confirmPasswordReset, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleUsernameRecovery() {
    setError('');
    setMessage('');
    try {
      const result = await recoverUsername(email.trim());
      setMessage(result.maskedUsername ? `아이디는 ${result.maskedUsername} 입니다.` : '일치하는 아이디를 찾지 못했어요.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '아이디를 찾지 못했어요.');
    }
  }

  async function handlePasswordRequest() {
    setError('');
    setMessage('');
    try {
      const result = await requestPasswordReset(username.trim(), email.trim());
      if (!result.resetToken) {
        setMessage('일치하는 계정을 찾지 못했어요.');
        return;
      }
      setResetToken(result.resetToken);
      setMessage('재설정 토큰을 받았어요. 새 비밀번호를 입력해 주세요.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '비밀번호 재설정을 요청하지 못했어요.');
    }
  }

  async function handlePasswordConfirm() {
    setError('');
    try {
      await confirmPasswordReset(resetToken, newPassword);
      setMessage('비밀번호가 변경되었습니다. 로그인해 주세요.');
      setResetToken('');
      setNewPassword('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '비밀번호를 변경하지 못했어요.');
    }
  }

  return (
    <section className="login-help-panel" aria-live="polite">
      <div className="login-help-panel__heading">
        <h3>{mode === 'username' ? '아이디 찾기' : '비밀번호 찾기'}</h3>
        <button type="button" onClick={onClose} aria-label="닫기">×</button>
      </div>
      {mode === 'username' ? (
        <div>
          <AuthField id="recovery-email" label="이메일" type="email" value={email} onChange={setEmail} surfaceSrc="/assets/login-input-surface.png" surfaceHeight={62} autoComplete="email" inputMode="email" />
          <button className="login-help-panel__submit" type="button" onClick={() => void handleUsernameRecovery()} disabled={isLoading}>아이디 확인</button>
        </div>
      ) : (
        <>
          <div>
            <AuthField id="reset-username" label="아이디" type="text" value={username} onChange={setUsername} surfaceSrc="/assets/login-input-surface.png" surfaceHeight={62} autoComplete="username" />
            <AuthField id="reset-email" label="이메일" type="email" value={email} onChange={setEmail} surfaceSrc="/assets/login-input-surface.png" surfaceHeight={62} autoComplete="email" inputMode="email" />
            <button className="login-help-panel__submit" type="button" onClick={() => void handlePasswordRequest()} disabled={isLoading}>재설정 요청</button>
          </div>
          {resetToken ? (
            <div>
              <label className="login-help-panel__token-label" htmlFor="reset-token">재설정 토큰</label>
              <input id="reset-token" value={resetToken} onChange={(event) => setResetToken(event.target.value)} />
              <AuthField id="reset-new-password" label="새 비밀번호" type="password" value={newPassword} onChange={setNewPassword} surfaceSrc="/assets/login-input-surface.png" surfaceHeight={62} autoComplete="new-password" />
              <button className="login-help-panel__submit" type="button" onClick={() => void handlePasswordConfirm()} disabled={isLoading}>비밀번호 변경</button>
            </div>
          ) : null}
        </>
      )}
      {message ? <p className="login-help-panel__message">{message}</p> : null}
      {error ? <p className="login-help-panel__error">{error}</p> : null}
    </section>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [submitError, setSubmitError] = useState('');
  const [helpMode, setHelpMode] = useState<HelpMode>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: { username?: string; password?: string } = {};
    if (!username.trim()) nextErrors.username = '아이디를 입력해 주세요.';
    if (!password) nextErrors.password = '비밀번호를 입력해 주세요.';
    setErrors(nextErrors);
    setSubmitError('');
    if (Object.keys(nextErrors).length > 0) return;

    try {
      const result = await login(username.trim(), password);
      navigate(result.onboardingCompleted ? '/home' : '/onboarding/basic', { replace: true });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '로그인하지 못했어요.');
    }
  }

  return (
    <AppShell className="auth-shell auth-shell--login">
      <main className="auth-screen login-screen" data-node-id="291:4048">
        <PageHeader title="로그인" backTo="/" className="page-header--auth page-header--login" backSrc="/assets/login-back.svg" profileSurfaceSrc="/assets/login-profile-surface.svg" profileIconSrc="/assets/login-profile.svg" />
        <h2 className="login-screen__headline">로그인</h2>
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <AuthField id="login-username" label="아이디" type="text" value={username} onChange={(value) => { setUsername(value); setErrors((current) => ({ ...current, username: undefined })); setSubmitError(''); }} surfaceSrc="/assets/login-input-surface.png" surfaceHeight={62} error={errors.username} autoComplete="username" />
          <AuthField id="login-password" label="비밀번호" type="password" value={password} onChange={(value) => { setPassword(value); setErrors((current) => ({ ...current, password: undefined })); setSubmitError(''); }} surfaceSrc="/assets/login-input-surface.png" surfaceHeight={63} error={errors.password} autoComplete="current-password" />
          <div className="login-links">
            <Link to="/signup">회원가입</Link>
            <button type="button" onClick={() => setHelpMode('username')}>아이디 찾기</button>
            <button type="button" onClick={() => setHelpMode('password')}>비밀번호 찾기</button>
          </div>
          {helpMode ? <HelpPanel mode={helpMode} onClose={() => setHelpMode(null)} /> : null}
          {submitError ? <p className="auth-submit-error login-submit-error">{submitError}</p> : null}
          <button className="auth-tape-button auth-tape-button--login" type="submit" disabled={isLoading} data-node-id="452:2545">
            <img src="/assets/login-tape.png" alt="" aria-hidden="true" />
            <span>{isLoading ? '처리 중' : '로그인'}</span>
          </button>
        </form>
      </main>
    </AppShell>
  );
}
