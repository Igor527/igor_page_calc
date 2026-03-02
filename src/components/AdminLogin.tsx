import React, { useState, useEffect } from 'react';
import {
  signIn,
  signInWithGitHub,
  signInWithGitHubRedirect,
  signInWithGoogle,
  signInWithGoogleRedirect,
  setRedirectProvider,
  useFirebaseAdmin,
} from '@/lib/firebaseAuth';

export const AdminLogin: React.FC<{
  onSuccess: () => void;
  onCancel: () => void;
}> = ({ onSuccess, onCancel }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  /** Какой провайдер последним вернул ошибку — для подсказки при auth/internal-error */
  const [lastErrorProvider, setLastErrorProvider] = useState<'google' | 'github' | null>(null);

  const useFirebase = useFirebaseAdmin();

  // Показать ошибку после возврата с редиректа (Google/GitHub) — результат обрабатывается в main.tsx
  useEffect(() => {
    if (!useFirebase) return;
    try {
      const stored = sessionStorage.getItem('adminLoginRedirectError');
      if (stored) {
        sessionStorage.removeItem('adminLoginRedirectError');
        setError(stored);
        const prov = sessionStorage.getItem('adminLoginRedirectProvider');
        sessionStorage.removeItem('adminLoginRedirectProvider');
        if (prov === 'google' || prov === 'github') setLastErrorProvider(prov);
      }
    } catch {}
  }, [useFirebase]);

  if (!useFirebase) {
    return (
      <div style={{ padding: 24, textAlign: 'center', maxWidth: 400, margin: '0 auto' }}>
        <p style={{ color: 'var(--pico-muted-color)' }}>
          Firebase не настроен. Добавьте VITE_FIREBASE_* и VITE_ADMIN_EMAIL или VITE_ADMIN_GITHUB_IDS в .env.
        </p>
        <button type="button" onClick={onCancel} className="secondary">
          Назад
        </button>
      </div>
    );
  }

  const handleGoogle = async () => {
    setError(null);
    setLastErrorProvider('google');
    setGoogleLoading(true);
    const result = await signInWithGoogle();
    setGoogleLoading(false);
    if (result.ok) onSuccess();
    else {
      setError(result.error ?? 'Ошибка входа');
      if (result.error?.includes('auth/internal-error')) setLastErrorProvider('google');
    }
  };

  const handleGitHub = async () => {
    setError(null);
    setLastErrorProvider('github');
    setGithubLoading(true);
    const result = await signInWithGitHub();
    setGithubLoading(false);
    if (result.ok) onSuccess();
    else {
      setError(result.error ?? 'Ошибка входа');
      if (result.error?.includes('auth/internal-error')) setLastErrorProvider('github');
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signIn(email.trim(), password);
    setLoading(false);
    if (result.ok) onSuccess();
    else setError(result.error ?? 'Ошибка входа');
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: 380, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 24, fontSize: 22, textAlign: 'center' }}>Вход в режим админа</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          style={{
            width: '100%',
            padding: '12px 20px',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            background: '#fff',
            color: '#1f2937',
            border: '1px solid #dadce0',
            borderRadius: 8,
            cursor: googleLoading ? 'wait' : 'pointer',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {googleLoading ? 'Вход…' : 'Войти через Google'}
        </button>
        <button
          type="button"
          onClick={handleGitHub}
          disabled={githubLoading}
          style={{
            width: '100%',
            padding: '12px 20px',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            background: '#24292f',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8,
            cursor: githubLoading ? 'wait' : 'pointer',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          {githubLoading ? 'Вход…' : 'Войти через GitHub'}
        </button>
        <button
          type="button"
          onClick={async () => {
            setError(null);
            setRedirectProvider('github');
            const err = await signInWithGitHubRedirect();
            if (err) setError(err);
          }}
          style={{
            width: '100%',
            padding: '10px 20px',
            fontSize: 14,
            background: 'transparent',
            color: 'var(--pico-muted-color)',
            border: '1px dashed var(--pico-border-color)',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          GitHub: войти через редирект (если выше не сработало)
        </button>
        <button
          type="button"
          onClick={async () => {
            setError(null);
            setRedirectProvider('google');
            const err = await signInWithGoogleRedirect();
            if (err) setError(err);
          }}
          style={{
            width: '100%',
            padding: '10px 20px',
            fontSize: 14,
            background: 'transparent',
            color: 'var(--pico-muted-color)',
            border: '1px dashed var(--pico-border-color)',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Google: войти через редирект (если popup даёт ошибку)
        </button>
      </div>

      {error && (
        <div style={{
          marginBottom: 16,
          padding: '12px 14px',
          borderRadius: 8,
          background: 'var(--color-error-bg)',
          border: '1px solid var(--color-error-border)',
          fontSize: 13,
          color: 'var(--color-danger)',
        }}>
          {error}
          {error.includes('auth/internal-error') && (
            <p style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
              {lastErrorProvider === 'google' && (
                <>
                  <strong>Google:</strong> Project settings → Authorized domains: <code>localhost</code> и <code>127.0.0.1</code> (если открываете по 127.0.0.1). Sign-in method → Google включён. Если с localhost не работает — попробуйте режим инкогнито или войдите на продакшен-домене (там часто стабильнее).
                </>
              )}
              {lastErrorProvider === 'github' && (
                <>
                  <strong>GitHub:</strong> Authorized domains (localhost и ваш домен). Sign-in method → GitHub: Client ID и Secret из OAuth App в GitHub.
                </>
              )}
              {!lastErrorProvider && (
                <>
                  Authorized domains: localhost, 127.0.0.1, ваш домен. Sign-in method: включите Google или GitHub. Режим инкогнито или другой браузер.
                </>
              )}
            </p>
          )}
        </div>
      )}

      {!showEmailForm ? (
        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            type="button"
            className="secondary"
            style={{ fontSize: 13 }}
            onClick={() => setShowEmailForm(true)}
          >
            Войти по email и паролю
          </button>
        </p>
      ) : (
        <form onSubmit={handleEmailSubmit} style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--pico-border-color)' }}>
          <p style={{ fontSize: 12, color: 'var(--pico-muted-color)', marginBottom: 16 }}>
            Учётная запись создаётся в Firebase Console → Authentication → Users. Email должен быть в VITE_ADMIN_EMAIL в .env.
          </p>
          <label style={{ display: 'block', marginBottom: 6 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="admin@example.com"
            style={{ marginBottom: 14 }}
          />
          <label style={{ display: 'block', marginBottom: 6 }}>Пароль</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{ flex: 1, minWidth: 0 }}
            />
            <button
              type="button"
              className="secondary"
              style={{ fontSize: 12, padding: '8px 12px', whiteSpace: 'nowrap' }}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? 'Скрыть' : 'Показать'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="submit" disabled={loading}>
              {loading ? 'Вход…' : 'Войти'}
            </button>
            <button type="button" onClick={() => setShowEmailForm(false)} className="secondary">
              Скрыть форму
            </button>
          </div>
        </form>
      )}

      <p style={{ textAlign: 'center', marginTop: 24 }}>
        <button type="button" onClick={onCancel} className="secondary" style={{ fontSize: 13 }}>
          Отмена
        </button>
      </p>
    </div>
  );
};
