import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AppShell, PageHeader } from '../components/AppShell';
import { AuthField } from '../components/AuthField';

type SignupValues = { name: string; username: string; password: string; email: string; age: string };
type SignupErrors = Partial<Record<keyof SignupValues, string>>;
const initialValues: SignupValues = { name: '', username: '', password: '', email: '', age: '' };

function validate(values: SignupValues): SignupErrors {
  const errors: SignupErrors = {};
  if (!values.name.trim()) errors.name = '이름을 입력해 주세요.';
  if (!values.username.trim()) errors.username = '아이디를 입력해 주세요.';
  if (!values.password) errors.password = '비밀번호를 입력해 주세요.';
  else if (!/(?=.*[A-Za-z])(?=.*\d)/.test(values.password)) errors.password = '영문과 숫자를 포함해 주세요.';
  if (!values.email.trim()) errors.email = '이메일을 입력해 주세요.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = '이메일 형식을 확인해 주세요.';
  const age = Number(values.age);
  if (!values.age.trim()) errors.age = '나이를 입력해 주세요.';
  else if (!Number.isInteger(age) || age < 1 || age > 120) errors.age = '나이를 확인해 주세요.';
  return errors;
}

export function SignupPage() {
  const navigate = useNavigate();
  const { signup, isLoading } = useAuth();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<SignupErrors>({});
  const [submitError, setSubmitError] = useState('');

  const update = (key: keyof SignupValues) => (value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitError('');
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      await signup({ name: values.name.trim(), username: values.username.trim(), password: values.password, email: values.email.trim(), age: Number(values.age) });
      navigate('/login', { replace: true });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '회원가입을 완료하지 못했어요.');
    }
  }

  return (
    <AppShell className="auth-shell auth-shell--signup" statusBarOffset={13}>
      <main className="auth-screen signup-screen" data-node-id="291:3978">
        <PageHeader title="회원가입" backTo="/" className="page-header--auth page-header--signup" backSrc="/assets/signup-back.svg" profileSurfaceSrc="/assets/signup-profile-surface.svg" profileIconSrc="/assets/signup-profile.svg" />
        <section className="signup-intro">
          <p className="signup-intro__eyebrow">기본 정보</p>
          <h2>당신은 어떤 이웃인가요?</h2>
        </section>
        <form className="signup-form" onSubmit={handleSubmit} noValidate>
          <AuthField id="name" label="이름" type="text" value={values.name} onChange={update('name')} surfaceSrc="/assets/signup-input-surface.png" error={errors.name} autoComplete="name" />
          <AuthField id="username" label="아이디" type="text" value={values.username} onChange={update('username')} surfaceSrc="/assets/signup-input-surface.png" surfaceHeight={62} error={errors.username} autoComplete="username" />
          <AuthField id="password" label="비밀번호" type="password" value={values.password} onChange={update('password')} surfaceSrc="/assets/signup-input-surface.png" error={errors.password} autoComplete="new-password" />
          <AuthField id="email" label="이메일" type="email" value={values.email} onChange={update('email')} surfaceSrc="/assets/signup-input-surface.png" surfaceHeight={62} error={errors.email} autoComplete="email" inputMode="email" />
          <AuthField id="age" label="나이" type="number" value={values.age} onChange={update('age')} surfaceSrc="/assets/signup-input-surface.png" surfaceHeight={62} error={errors.age} inputMode="numeric" />
          {submitError ? <p className="auth-submit-error">{submitError}</p> : null}
          <button className="auth-tape-button" type="submit" disabled={isLoading} data-node-id="452:2541">
            <img src="/assets/signup-tape.png" alt="" aria-hidden="true" />
            <span>{isLoading ? '처리 중' : '다음'}</span>
          </button>
        </form>
      </main>
    </AppShell>
  );
}
