import React from 'react';
import PageLayout from '@/components/PageLayout';
import SyncSettings from '@/components/SyncSettings';

const WelcomePage: React.FC<{ isAdmin?: boolean; dataVersion?: number }> = ({ isAdmin = false, dataVersion }) => {
  return (
    <PageLayout
      pageId="welcome"
      isAdmin={isAdmin}
      dataVersion={dataVersion}
      footer={
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 space-y-1">
          {isAdmin ? (
            <>
              <p>Режим админа: доступны <a href="/dictionary" className="underline hover:no-underline">Словарь</a>, <a href="/admin/notes" className="underline hover:no-underline">Заметки</a>, <a href="/cv" className="underline hover:no-underline">CV</a>, редактирование блога. Настройте синхронизацию — изменения будут автоматически пушиться в репо.</p>
              <a href="/?admin=0" className="underline hover:no-underline">
                Выйти из режима админа
              </a>
              <SyncSettings />
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
