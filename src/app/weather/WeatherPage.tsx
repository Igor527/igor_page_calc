/**
 * Метеостанция — только для админа.
 * Планируется: данные с домашней метеостанции, графики, база данных (своя или готовая).
 */

import React from 'react';

const WeatherPage: React.FC = () => {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Метеостанция
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        Раздел для данных с домашней метеостанции: загрузка показаний, графики, ведение базы данных (своя или готовая). Будет реализовано позже.
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
        Сейчас здесь заглушка. Когда будет готово API или формат данных — можно подключить отображение и построение графиков.
      </p>
      <p>
        <a href="/" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>← На главную</a>
      </p>
    </div>
  );
};

export default WeatherPage;
