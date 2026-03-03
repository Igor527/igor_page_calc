import React, { useState, useCallback } from 'react';
import PageLayout from '@/components/PageLayout';
import SyncSettings from '@/components/SyncSettings';
import { getSyncConfig } from '@/lib/githubSync';

const WelcomePage: React.FC<{
  isAdmin?: boolean;
  isLimitedGuest?: boolean;
  dataVersion?: number;
  onPullAllFromRepo?: () => Promise<void>;
}> = ({ isAdmin = false, isLimitedGuest = false, dataVersion, onPullAllFromRepo }) => {
  const [pullLoading, setPullLoading] = useState(false);
  const handlePullAll = useCallback(async () => {
    if (!onPullAllFromRepo) return;
    setPullLoading(true);
    try {
      await onPullAllFromRepo();
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
          {isAdmin ? (
            <>
              <p className="mb-2">Режим админа. Быстрые ссылки:</p>
              <div className="flex flex-wrap justify-center gap-2 mb-2">
                <a href="/dictionary" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline text-inherit">Словарь</a>
                <a href="/admin/notes" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline text-inherit">Заметки</a>
                <a href="/cv" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline text-inherit">CV</a>
                <a href="/weather" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline text-inherit">Метеостанция</a>
                <a href="/editor" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline text-inherit">Редактор</a>
                <a href="/blog" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline text-inherit">Блог</a>
              </div>
              <p className="text-xs opacity-90">Настройте синхронизацию ниже — изменения будут пушиться в репо.</p>
              {getSyncConfig() && onPullAllFromRepo && (
                <p className="mb-2">
                  <button
                    type="button"
                    onClick={handlePullAll}
                    disabled={pullLoading}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-inherit"
                    style={{ fontSize: 13 }}
                  >
                    {pullLoading ? 'Загрузка…' : 'Обновить всё с репо'}
                  </button>
                </p>
              )}
              <a href="/?admin=0" className="inline-block mt-1 text-xs underline hover:no-underline">
                Выйти из режима админа
              </a>
              <SyncSettings />
            </>
          ) : isLimitedGuest ? (
            <>
              <p className="mb-2">Гостевой доступ: списки дел и метеостанция.</p>
              <div className="flex flex-wrap justify-center gap-2 mb-2">
                <a href="/planner" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline text-inherit">Планировщик</a>
                <a href="/weather" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline text-inherit">Метеостанция</a>
              </div>
              <a href="/?admin=0" className="inline-block mt-1 text-xs underline hover:no-underline">
                Выйти
              </a>
            </>
          ) : (
            <p>Калькуляторы, блог, инструменты.</p>
          )}
        </div>
      }
    />
  );
};

export default WelcomePage;
