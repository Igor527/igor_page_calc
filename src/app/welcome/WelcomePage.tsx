import React from 'react';
import PageLayout from '@/components/PageLayout';

const WelcomePage: React.FC<{ isAdmin?: boolean }> = ({ isAdmin = false }) => {
  return (
    <PageLayout
      pageId="welcome"
      isAdmin={isAdmin}
      footer={
        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
          {isAdmin ? (
            <a href="/?admin=0" className="underline hover:no-underline">
              Выйти из режима админа
            </a>
          ) : (
            <a href="/?admin=1" className="underline hover:no-underline">
              Режим админа
            </a>
          )}
        </div>
      }
    />
  );
};

export default WelcomePage;
