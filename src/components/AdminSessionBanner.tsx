import React from 'react';
import {
  ADMIN_LOGIN_PATH,
  ADMIN_SESSION_EXPIRED_BODY,
  ADMIN_SESSION_EXPIRED_TITLE,
} from '@/lib/syncAuthMessages';

const bannerStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1000,
  padding: '10px 16px',
  background: 'var(--pico-card-background-color)',
  borderBottom: '2px solid var(--pico-del-color)',
  color: 'var(--pico-color)',
  fontSize: 14,
  lineHeight: 1.45,
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
};

const AdminSessionBanner: React.FC<{ onDismiss?: () => void }> = ({ onDismiss }) => (
  <div
    role="alert"
    style={bannerStyle}
  >
    <strong>{ADMIN_SESSION_EXPIRED_TITLE}.</strong> {ADMIN_SESSION_EXPIRED_BODY}{' '}
    <a href={ADMIN_LOGIN_PATH} style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
      Войти снова
    </a>
    {onDismiss && (
      <>
        {' '}
        <button
          type="button"
          onClick={onDismiss}
          className="outline"
          style={{ marginLeft: 8, fontSize: 12, padding: '4px 10px', verticalAlign: 'middle' }}
        >
          Скрыть
        </button>
      </>
    )}
  </div>
);

export default AdminSessionBanner;
