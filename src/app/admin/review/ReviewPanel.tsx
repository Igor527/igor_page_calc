// Админ-панель для ревью калькуляторов

import React, { useState } from 'react';
import { 
  getCalculatorsByStatus, 
  updateCalculatorStatus, 
  addComment,
  type SavedCalculator,
  type CalculatorStatus 
} from '@/lib/calculatorStorage';
import { loadCalculator } from '@/lib/calculatorStorage';

const ReviewPanel: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<CalculatorStatus>('review');
  const [selectedCalc, setSelectedCalc] = useState<SavedCalculator | null>(null);
  const [commentText, setCommentText] = useState('');
  const [reviewerName, setReviewerName] = useState('Админ');

  const calculators = getCalculatorsByStatus(statusFilter);

  const handleStatusChange = (calcId: string, newStatus: CalculatorStatus) => {
    const result = updateCalculatorStatus(calcId, newStatus, reviewerName);
    if (result.success) {
      // Перезагружаем список
      window.location.reload();
    } else {
      alert(`Ошибка: ${result.error}`);
    }
  };

  const handleAddComment = (calcId: string) => {
    if (!commentText.trim()) {
      alert('Введите комментарий');
      return;
    }
    const result = addComment(calcId, commentText, reviewerName);
    if (result.success) {
      setCommentText('');
      // Перезагружаем выбранный калькулятор
      const updated = loadCalculator(calcId);
      if (updated) setSelectedCalc(updated);
    } else {
      alert(`Ошибка: ${result.error}`);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', gap: 16, padding: 16 }}>
      {/* Левая панель - список калькуляторов */}
      <div style={{ flex: '0 0 300px', borderRight: '1px solid #eee', overflowY: 'auto' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: 12 }}>Ревью калькуляторов</h2>
        
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 500 }}>
            Фильтр по статусу:
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CalculatorStatus)}
            style={{ width: '100%', padding: '6px', borderRadius: 4, border: '1px solid #ccc' }}
          >
            <option value="draft">Черновики</option>
            <option value="review">На ревью</option>
            <option value="published">Опубликованные</option>
            <option value="rejected">Отклонённые</option>
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 500 }}>
            Ваше имя:
          </label>
          <input
            type="text"
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
            style={{ width: '100%', padding: '6px', borderRadius: 4, border: '1px solid #ccc' }}
            placeholder="Имя ревьюера"
          />
        </div>

        <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
          Найдено: {calculators.length}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {calculators.map(calc => (
            <div
              key={calc.id}
              onClick={() => setSelectedCalc(calc)}
              style={{
                padding: 12,
                border: '1px solid #ddd',
                borderRadius: 6,
                cursor: 'pointer',
                background: selectedCalc?.id === calc.id ? '#f0f8ff' : '#fff',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (selectedCalc?.id !== calc.id) {
                  e.currentTarget.style.background = '#f9f9f9';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedCalc?.id !== calc.id) {
                  e.currentTarget.style.background = '#fff';
                }
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{calc.title}</div>
              <div style={{ fontSize: 12, color: '#666' }}>
                Статус: <span style={{ 
                  color: calc.status === 'published' ? '#0a6' : 
                         calc.status === 'rejected' ? '#c00' : 
                         calc.status === 'review' ? '#880' : '#666'
                }}>
                  {calc.status === 'published' ? 'Опубликован' :
                   calc.status === 'rejected' ? 'Отклонён' :
                   calc.status === 'review' ? 'На ревью' : 'Черновик'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                Обновлён: {new Date(calc.updatedAt).toLocaleDateString('ru-RU')}
              </div>
              {calc.comments.length > 0 && (
                <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                  Комментариев: {calc.comments.length}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Правая панель - детали калькулятора */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!selectedCalc ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
            Выберите калькулятор для просмотра
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #eee' }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: 8 }}>{selectedCalc.title}</h2>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button
                  onClick={() => handleStatusChange(selectedCalc.id, 'published')}
                  disabled={selectedCalc.status === 'published'}
                  style={{
                    padding: '6px 12px',
                    background: selectedCalc.status === 'published' ? '#ccc' : '#0a6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: selectedCalc.status === 'published' ? 'not-allowed' : 'pointer',
                  }}
                >
                  Опубликовать
                </button>
                <button
                  onClick={() => handleStatusChange(selectedCalc.id, 'rejected')}
                  disabled={selectedCalc.status === 'rejected'}
                  style={{
                    padding: '6px 12px',
                    background: selectedCalc.status === 'rejected' ? '#ccc' : '#c00',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: selectedCalc.status === 'rejected' ? 'not-allowed' : 'pointer',
                  }}
                >
                  Отклонить
                </button>
                <button
                  onClick={() => handleStatusChange(selectedCalc.id, 'review')}
                  disabled={selectedCalc.status === 'review'}
                  style={{
                    padding: '6px 12px',
                    background: selectedCalc.status === 'review' ? '#ccc' : '#880',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: selectedCalc.status === 'review' ? 'not-allowed' : 'pointer',
                  }}
                >
                  Вернуть на ревью
                </button>
              </div>
            </div>

            {/* Комментарии */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Комментарии ({selectedCalc.comments.length})</h3>
              
              <div style={{ marginBottom: 12 }}>
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Добавить комментарий..."
                  rows={3}
                  style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid #ccc', marginBottom: 8 }}
                />
                <button
                  onClick={() => handleAddComment(selectedCalc.id)}
                  style={{
                    padding: '6px 12px',
                    background: '#222',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  Добавить комментарий
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedCalc.comments.map(comment => (
                  <div
                    key={comment.id}
                    style={{
                      padding: 12,
                      background: '#f9f9f9',
                      borderRadius: 6,
                      border: '1px solid #eee',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <strong style={{ fontSize: 13 }}>{comment.author}</strong>
                      <span style={{ fontSize: 11, color: '#999' }}>
                        {new Date(comment.createdAt).toLocaleString('ru-RU')}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#333' }}>{comment.text}</div>
                  </div>
                ))}
                {selectedCalc.comments.length === 0 && (
                  <div style={{ color: '#888', fontSize: 13, fontStyle: 'italic' }}>
                    Комментариев пока нет
                  </div>
                )}
              </div>
            </div>

            {/* История */}
            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: 12 }}>История изменений</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedCalc.history.slice().reverse().map(entry => (
                  <div
                    key={entry.id}
                    style={{
                      padding: 8,
                      background: '#fafafa',
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>
                        <strong>{entry.author}</strong> — {entry.action === 'created' ? 'создал' :
                                                              entry.action === 'updated' ? 'обновил' :
                                                              entry.action === 'status_changed' ? 'изменил статус' :
                                                              'добавил комментарий'}
                        {entry.oldStatus && entry.newStatus && (
                          <span style={{ marginLeft: 8 }}>
                            {entry.oldStatus} → {entry.newStatus}
                          </span>
                        )}
                      </span>
                      <span style={{ color: '#999' }}>
                        {new Date(entry.timestamp).toLocaleString('ru-RU')}
                      </span>
                    </div>
                    {entry.details && (
                      <div style={{ marginTop: 4, color: '#666', fontSize: 11 }}>
                        {entry.details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewPanel;
