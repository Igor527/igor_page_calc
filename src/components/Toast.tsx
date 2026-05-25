import React, { useEffect, useState } from 'react';
import { dismissToast, subscribeToasts, type ToastItem } from '@/lib/toast';

const kindStyles: Record<ToastItem['kind'], React.CSSProperties> = {
  info: {
    borderColor: 'var(--pico-border-color)',
    background: 'var(--pico-card-background-color)',
  },
  success: {
    borderColor: 'var(--color-success)',
    background: 'var(--pico-primary-background)',
  },
  error: {
    borderColor: 'var(--color-danger)',
    background: 'var(--color-error-bg)',
  },
};

const ToastStack: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToasts(setItems), []);

  if (items.length === 0) return null;

  return (
    <div
      className="toast-stack"
      aria-live="polite"
      aria-relevant="additions text"
      role="region"
      aria-label="Уведомления"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast-item toast-item--${item.kind}`}
          style={kindStyles[item.kind]}
          role={item.kind === 'error' ? 'alert' : 'status'}
        >
          <span className="toast-item__message">{item.message}</span>
          <button
            type="button"
            className="toast-item__close"
            onClick={() => dismissToast(item.id)}
            aria-label="Закрыть уведомление"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>
    {children}
    <ToastStack />
  </>
);

export default ToastProvider;
