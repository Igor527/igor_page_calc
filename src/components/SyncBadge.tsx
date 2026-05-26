import React, { useEffect, useState } from 'react';
import { getSyncBadge, subscribeSyncBadge } from '@/lib/githubSync';

const LABELS: Record<string, string> = {
  idle: 'Синхронизировано',
  syncing: 'Синхронизация…',
  ok: 'Синхронизировано',
  error: 'Ошибка sync',
};

const SyncBadge: React.FC = () => {
  const [badge, setBadge] = useState(getSyncBadge);

  useEffect(() => subscribeSyncBadge(() => setBadge(getSyncBadge())), []);

  const { state, error } = badge;
  const label = LABELS[state] ?? state;
  const title = error ? `${label}: ${error}` : label;

  const scrollToSync = () => {
    const el = document.getElementById('sync-settings-anchor');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (window.location.pathname !== '/') {
      window.location.href = '/#sync-settings-anchor';
      return;
    }
    window.location.hash = 'sync-settings-anchor';
  };

  return (
    <button
      type="button"
      className={`sync-badge sync-badge--${state}`}
      onClick={scrollToSync}
      title={title}
      aria-label={title}
    >
      <span className="sync-badge__dot" aria-hidden />
      <span className="sync-badge__text">{label}</span>
    </button>
  );
};

export default SyncBadge;
