import React, { useState, useCallback } from 'react';
import PageLayout from '@/components/PageLayout';
import SyncSettings from '@/components/SyncSettings';
import { getSyncConfig } from '@/lib/githubSync';
import { ADMIN_LOGIN_PATH, ADMIN_SESSION_EXPIRED_TITLE } from '@/lib/syncAuthMessages';
import { FirebaseMigration } from '@/components/FirebaseMigration';
import { useLang } from '@/lib/i18n';

const WelcomePage: React.FC<{
  isAdmin?: boolean;
  isLimitedGuest?: boolean;
  dataVersion?: number;
  onPullAllFromRepo?: () => Promise<{ ok: boolean; error?: string }>;
  adminSessionExpired?: boolean;
}> = ({ isAdmin = false, isLimitedGuest = false, dataVersion, onPullAllFromRepo, adminSessionExpired = false }) => {
  const { lang } = useLang();
  const [pullLoading, setPullLoading] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const handlePullAll = useCallback(async () => {
    if (!onPullAllFromRepo) return;
    setPullLoading(true);
    setPullError(null);
    try {
      const result = await onPullAllFromRepo();
      if (!result.ok && result.error) setPullError(result.error);
    } finally {
      setPullLoading(false);
    }
  }, [onPullAllFromRepo]);

  return (
    <PageLayout
      pageId="welcome"
      isAdmin={isAdmin}
      isLimitedGuest={isLimitedGuest}
      dataVersion={dataVersion}
      footer={
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 space-y-2">
          {adminSessionExpired && !isAdmin ? (
            <p style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--pico-del-color)', fontSize: 13 }}>
              <strong>{lang === 'ru' ? ADMIN_SESSION_EXPIRED_TITLE : 'Admin session expired'}.</strong>{' '}
              <a href={ADMIN_LOGIN_PATH} className="underline">{lang === 'ru' ? 'Войти снова' : 'Sign in again'}</a>
            </p>
          ) : null}
          {isAdmin ? (
            <>
              <p className="mb-2">{lang === 'ru' ? 'Режим админа. Быстрые ссылки:' : 'Admin mode. Quick links:'}</p>
              <div className="flex flex-wrap justify-center gap-2 mb-2">
                <a href="/dictionary" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline text-inherit">{lang === 'ru' ? 'Словарь' : 'Dictionary'}</a>
                <a href="/admin/notes" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline text-inherit">{lang === 'ru' ? 'Заметки' : 'Notes'}</a>
                <a href="/cv" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline text-inherit">CV</a>
                <a href="/weather" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline text-inherit">{lang === 'ru' ? 'Метеостанция' : 'Weather'}</a>
                <a href="/editor" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline text-inherit">{lang === 'ru' ? 'Редактор' : 'Editor'}</a>
                <a href="/blog" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline text-inherit">{lang === 'ru' ? 'Блог' : 'Blog'}</a>
                <a href="/admin/drawing" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-blue-900 bg-blue-50 dark:bg-blue-950 no-underline text-inherit">{lang === 'ru' ? '🎨 Рисование' : '🎨 Drawing'}</a>
              </div>
              <p className="text-xs opacity-90">{lang === 'ru' ? 'Настройте синхронизацию ниже — изменения будут пушиться в репо.' : 'Configure synchronization below — changes will be pushed to the repository.'}</p>
              {getSyncConfig() && onPullAllFromRepo && (
                <p className="mb-2">
                  <button
                    type="button"
                    onClick={handlePullAll}
                    disabled={pullLoading}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-inherit"
                    style={{ fontSize: 13 }}
                  >
                    {pullLoading ? (lang === 'ru' ? 'Загрузка…' : 'Loading…') : (lang === 'ru' ? 'Выгрузить последний сэйв из репо' : 'Pull latest save from repo')}
                  </button>
                  {pullError && (
                    <span style={{ display: 'block', marginTop: 8, fontSize: 12, color: 'var(--pico-del-color)' }}>{pullError}</span>
                  )}
                </p>
              )}
              <a href="/?admin=0" className="inline-block mt-1 text-xs underline hover:no-underline">
                {lang === 'ru' ? 'Выйти из режима админа' : 'Exit admin mode'}
              </a>
              <SyncSettings />
              <FirebaseMigration />
            </>
          ) : isLimitedGuest ? (
            <>
              <p className="mb-2">{lang === 'ru' ? 'Гостевой доступ: списки дел и метеостанция.' : 'Guest access: planner and weather station.'}</p>
              <div className="flex flex-wrap justify-center gap-2 mb-2">
                <a href="/planner" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline text-inherit">{lang === 'ru' ? 'Планировщик' : 'Planner'}</a>
                <a href="/weather" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline text-inherit">{lang === 'ru' ? 'Метеостанция' : 'Weather'}</a>
              </div>
              <a href="/?admin=0" className="inline-block mt-1 text-xs underline hover:no-underline">
                {lang === 'ru' ? 'Выйти' : 'Log out'}
              </a>
            </>
          ) : (
            <>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                {lang === 'ru'
                  ? '3D-моделирование · BIM-сервисы · Плагины AutoCAD Civil 3D · Генеральные планы'
                  : '3D Modeling · BIM Services · Civil 3D Plugins · Master Planning'}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                <a href="/legal" className="hover:underline">
                  {lang === 'ru' ? 'IGOR CHEVELA PR BEOGRAD · Справка о деятельности' : 'IGOR CHEVELA PR BEOGRAD · Legal Notice'}
                </a>
              </p>
            </>
          )}
        </div>
      }
    />
  );
};

export default WelcomePage;
