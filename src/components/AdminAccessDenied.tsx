import React from 'react';
import {
  ADMIN_LOGIN_PATH,
  ADMIN_SESSION_EXPIRED_BODY,
  ADMIN_SESSION_EXPIRED_TITLE,
} from '@/lib/syncAuthMessages';

const linkStyle: React.CSSProperties = { color: 'var(--color-accent)', textDecoration: 'underline' };

const loginButtonStyle: React.CSSProperties = {
  display: 'inline-block',
  marginTop: 12,
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 8,
  border: 'none',
  background: 'var(--pico-primary)',
  color: 'var(--pico-primary-inverse)',
  textDecoration: 'none',
  cursor: 'pointer',
};

export type AdminAccessMode = 'admin-only' | 'login-required';

const MODE_BODY: Record<AdminAccessMode, string> = {
  'admin-only':
    'Раздел доступен только администратору после входа. Гостевой аккаунт открывает планировщик и метеостанцию.',
  'login-required':
    'Войдите как администратор (полный доступ) или как гость (планировщик и метеостанция). Без входа раздел недоступен.',
};

const AdminAccessDenied: React.FC<{
  resourceLabel: string;
  sessionExpired?: boolean;
  accessMode?: AdminAccessMode;
  linkToHome?: React.ReactNode;
}> = ({ resourceLabel, sessionExpired, accessMode = 'admin-only', linkToHome }) => (
  <div style={{ padding: '40px 20px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
    <h2>{sessionExpired ? ADMIN_SESSION_EXPIRED_TITLE : 'Доступ по входу'}</h2>
    <p style={{ color: 'var(--color-muted-text)', marginBottom: 8, lineHeight: 1.5 }}>
      {sessionExpired ? ADMIN_SESSION_EXPIRED_BODY : `${resourceLabel} — ${MODE_BODY[accessMode]}`}
    </p>
    <a href={ADMIN_LOGIN_PATH} style={loginButtonStyle}>
      {sessionExpired ? 'Войти снова' : 'Войти'}
    </a>
    {!sessionExpired && linkToHome ? (
      <div style={{ marginTop: 16 }}>{linkToHome}</div>
    ) : !sessionExpired ? (
      <p style={{ marginTop: 16 }}>
        <a href="/" style={linkStyle}>
          На главную
        </a>
      </p>
    ) : null}
  </div>
);

export default AdminAccessDenied;
