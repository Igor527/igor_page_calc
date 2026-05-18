import React from 'react';
import {
  ADMIN_LOGIN_PATH,
  ADMIN_SESSION_EXPIRED_BODY,
  ADMIN_SESSION_EXPIRED_TITLE,
} from '@/lib/syncAuthMessages';

const linkStyle = { color: 'var(--color-accent)', textDecoration: 'underline' };

const AdminAccessDenied: React.FC<{
  resourceLabel: string;
  sessionExpired?: boolean;
  linkToHome?: React.ReactNode;
}> = ({ resourceLabel, sessionExpired, linkToHome }) => (
  <div style={{ padding: '40px 20px', textAlign: 'center' }}>
    <h2>{sessionExpired ? ADMIN_SESSION_EXPIRED_TITLE : 'Доступ только для админа'}</h2>
    <p style={{ color: 'var(--color-muted-text)', marginBottom: 16 }}>
      {sessionExpired
        ? ADMIN_SESSION_EXPIRED_BODY
        : `${resourceLabel} доступны только в режиме админа.`}
    </p>
    {sessionExpired ? (
      <a href={ADMIN_LOGIN_PATH} style={linkStyle}>
        Войти снова
      </a>
    ) : (
      linkToHome
    )}
  </div>
);

export default AdminAccessDenied;
