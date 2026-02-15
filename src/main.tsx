import React from 'react';
import ReactDOM from 'react-dom/client';

// Импортируем компоненты
import EditorPage from './app/admin/editor/page';
import PublicCalculator from './app/public/PublicCalculator';
import ReviewPanel from './app/admin/review/ReviewPanel';
import { loadCalculator } from './lib/calculatorStorage';

// Простой роутинг на основе URL
function App() {
  const path = window.location.pathname;
  
  // Публичный вид калькулятора: /calc/:id
  if (path.startsWith('/calc/')) {
    const calculatorId = path.split('/calc/')[1];
    const calculator = loadCalculator(calculatorId);
    
    // Показываем только опубликованные калькуляторы
    if (calculator && calculator.status === 'published') {
      return <PublicCalculator calculatorId={calculatorId} blocks={calculator.blocks} />;
    } else if (calculator) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <h2>Калькулятор недоступен</h2>
          <p style={{ color: '#888' }}>
            {calculator?.status === 'review' 
              ? 'Калькулятор находится на ревью и будет опубликован после проверки.'
              : calculator?.status === 'rejected'
              ? 'Калькулятор был отклонён.'
              : 'Калькулятор ещё не опубликован.'}
          </p>
        </div>
      );
    } else {
      return <PublicCalculator calculatorId={calculatorId} />;
    }
  }
  
  // Админ-панель ревью: /admin/review
  if (path.startsWith('/admin/review')) {
    return <ReviewPanel />;
  }
  
  // Редактор (по умолчанию)
  return <EditorPage isAdmin={true} />;
}

// Рендерим приложение
const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
