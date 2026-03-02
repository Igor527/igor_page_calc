/**
 * Страница CV — только для админа. Публичных ссылок на неё с сайта нет.
 */

import React from 'react';

const CvPage: React.FC = () => {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        CV
      </h1>
      <p className="text-gray-600 dark:text-gray-400">
        Здесь можно разместить резюме. Страница доступна только в режиме админа и не ссылается с публичной части сайта.
      </p>
    </div>
  );
};

export default CvPage;
