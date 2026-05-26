import React, { useEffect, useState } from 'react';
import { getSyncBadge, subscribeSyncBadge, type SyncBadgeState } from '@/lib/githubSync';

const LABELS: Record<SyncBadgeState, string> = {
  idle: 'Синхронизация',
  syncing: 'Сохранение…',
  ok: 'Сохранено',
  error: 'Ошибка',
};

/** Показываем только во время активной синхронизации или при ошибке (без постоянного «Синхронизировано»). */
const VISIBLE_STATES: SyncBadgeState[] = ['syncing', 'error'];

const SyncBadge: React.FC = () => {
  const [badge, setBadge] = useState(getSyncBadge);

  useEffect(() => subscribeSyncBadge(() => setBadge(getSyncBadge())), []);

  const { state, error } = badge;
  if (!VISIBLE_STATES.includes(state)) return null;

  const label = LABELS[state];
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
      <span className="sync-badge__icon" aria-hidden>
        {state === 'syncing' ? '↻' : '!'}
      </span>
      <span className="sync-badge__text">{label}</span>
    </button>
  );
};

export default SyncBadge;
