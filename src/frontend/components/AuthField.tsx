type AuthFieldProps = {
  id: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'number';
  value: string;
  onChange: (value: string) => void;
  surfaceSrc: string;
  surfaceHeight?: number;
  error?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'numeric';
};

export function AuthField({ id, label, type, value, onChange, surfaceSrc, surfaceHeight = 63, error, autoComplete, inputMode }: AuthFieldProps) {
  return (
    <div className={`auth-field ${error ? 'has-error' : ''}`}>
      <label className="auth-field__label" htmlFor={id}>
        <span>{label}</span><span className="auth-field__required"> *</span>
      </label>
      <div className="auth-field__surface" style={{ height: surfaceHeight }}>
        <img src={surfaceSrc} alt="" aria-hidden="true" />
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          inputMode={inputMode}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </div>
      {error ? <p className="auth-field__error" id={`${id}-error`}>{error}</p> : null}
    </div>
  );
}
