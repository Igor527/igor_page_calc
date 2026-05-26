import React, { useEffect, useState } from 'react';
import { getSyncBadge, subscribeSyncBadge, type SyncBadgeState } from '@/lib/githubSync';

/** Показываем только во время сохранения или при ошибке — без постоянного статуса «Синхронизировано». */
const VISIBLE_STATES: SyncBadgeState[] = ['syncing', 'error'];

const LABELS: Record<'syncing' | 'error', string> = {
  syncing: 'Сохранение…',
  error: 'Ошибка',
};

const SyncBadge: React.FC = () => {
  const [badge, setBadge] = useState(getSyncBadge);

  useEffect(() => subscribeSyncBadge(() => setBadge(getSyncBadge())), []);

  const { state, error } = badge;
  if (!VISIBLE_STATES.includes(state)) return null;

  const label = LABELS[state as 'syncing' | 'error'];
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
    </button>
  );
};

export default SyncBadge;
