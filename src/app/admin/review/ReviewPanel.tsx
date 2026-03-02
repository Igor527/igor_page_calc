// Админ-панель для ревью калькуляторов

import React, { useState, useMemo, useEffect } from 'react';
import { 
  getCalculatorsByStatus, 
  updateCalculatorStatus, 
  addComment,
  updateCalculatorSlug,
  loadCalculator,
  downloadPublishedBundle,
  type SavedCalculator,
  type CalculatorStatus 
} from '@/lib/calculatorStorage';
import PublicCalculator from '@/app/public/PublicCalculator';

const ReviewPanel: React.FC<{ isAdmin?: boolean }> = ({ isAdmin = false }) => {
  const [statusFilter, setStatusFilter] = useState<CalculatorStatus>('review');
  const [selectedCalc, setSelectedCalc] = useState<SavedCalculator | null>(null);
  const [commentText, setCommentText] = useState('');
  const [reviewerName, setReviewerName] = useState('Админ');
  const [refreshKey, setRefreshKey] = useState(0); // Для принудительного обновления списка
  const [slugEdit, setSlugEdit] = useState('');
  const [slugSaving, setSlugSaving] = useState(false);

  useEffect(() => setSlugEdit(''), [selectedCalc?.id]);

  // Используем refreshKey для принудительного обновления списка
  const calculators = useMemo(() => {
    return getCalculatorsByStatus(statusFilter);
  }, [statusFilter, refreshKey]);

  const handleStatusChange = (calcId: string, newStatus: CalculatorStatus) => {
    const result = updateCalculatorStatus(calcId, newStatus, reviewerName);
    if (result.success) {
      setRefreshKey(prev => prev + 1);
      // Переключаем фильтр на категорию нового статуса, чтобы калькулятор "перешёл" в нужный список
      setStatusFilter(newStatus);
      if (selectedCalc && selectedCalc.id === calcId) {
        const updated = loadCalculator(calcId);
        if (updated) setSelectedCalc(updated);
      }
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
    <div style={{ display: 'flex', height: 'calc(100vh - var(--content-offset-from-header, 112px) - var(--site-footer-height, 56px))', minHeight: 0, gap: 16, padding: 16 }}>
      {/* Левая панель - список калькуляторов */}
      <div style={{ flex: '0 0 300px', borderRight: '1px solid var(--pico-border-color)', overflowY: 'auto' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: 12 }}>Ревью калькуляторов</h2>
        <p style={{ fontSize: 12, color: 'var(--pico-muted-color)', marginBottom: 12 }}>
          Опубликуйте калькуляторы, затем нажмите «Экспорт для GitHub» — положите скачанный файл в репо в <code>public/data/calculators.json</code> и сделайте push. На сайте будет этот список.
        </p>
        <div style={{ marginBottom: 12 }}>
          <button type="button" className="outline" style={{ fontSize: 12 }} onClick={downloadPublishedBundle}>
            Экспорт для GitHub (calculators.json)
          </button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 500 }}>
            Фильтр по статусу:
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CalculatorStatus)}
            style={{ width: '100%', padding: '6px', borderRadius: 4, border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', color: 'var(--pico-color)' }}
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
            style={{ width: '100%', padding: '6px', borderRadius: 4, border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', color: 'var(--pico-color)' }}
            placeholder="Имя ревьюера"
          />
        </div>

        <div style={{ fontSize: 13, color: 'var(--color-muted-text)', marginBottom: 12 }}>
          Найдено: {calculators.length}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {calculators.map(calc => (
            <div
              key={calc.id}
              onClick={() => setSelectedCalc(calc)}
              style={{
                padding: 12,
                border: '1px solid var(--pico-border-color)',
                borderRadius: 6,
                cursor: 'pointer',
                background: selectedCalc?.id === calc.id ? 'var(--pico-primary-background)' : 'var(--color-panel)',
                color: 'var(--pico-color)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (selectedCalc?.id !== calc.id) {
                  e.currentTarget.style.background = 'var(--color-panel-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedCalc?.id !== calc.id) {
                  e.currentTarget.style.background = 'var(--color-panel)';
                }
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{calc.title}</div>
              <div style={{ fontSize: 12, color: 'var(--color-muted-text)' }}>
                Статус: <span style={{ 
                  color: calc.status === 'published' ? 'var(--color-success)' : 
                         calc.status === 'rejected' ? 'var(--color-danger)' : 
                         calc.status === 'review' ? 'var(--color-warning)' : 'var(--color-muted-text)'
                }}>
                  {calc.status === 'published' ? 'Опубликован' :
                   calc.status === 'rejected' ? 'Отклонён' :
                   calc.status === 'review' ? 'На ревью' : 'Черновик'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-muted-text)', marginTop: 4 }}>
                Обновлён: {new Date(calc.updatedAt).toLocaleDateString('ru-RU')}
              </div>
              {calc.comments.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--color-muted-text)', marginTop: 4 }}>
                  Комментариев: {calc.comments.length}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Правая панель - детали калькулятора и превью */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {!selectedCalc ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted-text)' }}>
            Выберите калькулятор для просмотра
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <div style={{ flex: '0 0 auto', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--pico-border-color)' }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: 8 }}>{selectedCalc.title}</h2>
              {selectedCalc.status === 'published' && (
                <div style={{ marginBottom: 12, padding: '10px 12px', background: 'var(--pico-card-background-color)', border: '1px solid var(--pico-border-color)', borderRadius: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--pico-muted-color)' }}>Ссылка для пользователей:</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: isAdmin ? 8 : 0 }}>
                    <a href={`/calculators/${selectedCalc.slug || selectedCalc.id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--pico-primary)', wordBreak: 'break-all' }}>
                      {typeof window !== 'undefined' ? `${window.location.origin}/calculators/${selectedCalc.slug || selectedCalc.id}` : `/calculators/${selectedCalc.slug || selectedCalc.id}`}
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        const url = typeof window !== 'undefined' ? `${window.location.origin}/calculators/${selectedCalc.slug || selectedCalc.id}` : `/calculators/${selectedCalc.slug || selectedCalc.id}`;
                        navigator.clipboard?.writeText(url).then(() => alert('Ссылка скопирована')).catch(() => {});
                      }}
                      style={{ padding: '4px 10px', fontSize: 12, border: '1px solid var(--pico-border-color)', borderRadius: 4, background: 'var(--pico-background-color)', cursor: 'pointer' }}
                    >
                      Копировать
                    </button>
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      <label style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>Адрес:</label>
                      <input
                        type="text"
                        value={slugEdit !== '' ? slugEdit : (selectedCalc.slug ?? '')}
                        onChange={(e) => setSlugEdit(e.target.value)}
                        onFocus={() => setSlugEdit(slugEdit === '' ? (selectedCalc.slug ?? '') : slugEdit)}
                        placeholder="латиница, цифры, дефис"
                        style={{ flex: 1, minWidth: 120, padding: '4px 8px', fontSize: 12, border: '1px solid var(--pico-border-color)', borderRadius: 4, background: 'var(--pico-background-color)', color: 'var(--pico-color)' }}
                      />
                      <button
                        type="button"
                        disabled={slugSaving}
                        onClick={async () => {
                          const value = slugEdit.trim() || undefined;
                          setSlugSaving(true);
                          const result = updateCalculatorSlug(selectedCalc.id, value ?? '');
                          setSlugSaving(false);
                          if (result.success) {
                            const updated = loadCalculator(selectedCalc.id);
                            if (updated) setSelectedCalc(updated);
                            setSlugEdit('');
                            setRefreshKey((k) => k + 1);
                          } else {
                            alert(result.error);
                          }
                        }}
                        style={{ padding: '4px 10px', fontSize: 12, border: 'none', borderRadius: 4, background: 'var(--pico-primary)', color: '#fff', cursor: slugSaving ? 'wait' : 'pointer' }}
                      >
                        {slugSaving ? '…' : 'Сохранить адрес'}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {isAdmin ? (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button
                    onClick={() => handleStatusChange(selectedCalc.id, 'published')}
                    disabled={selectedCalc.status === 'published'}
                    style={{
                      padding: '6px 12px',
                      background: selectedCalc.status === 'published' ? 'var(--color-muted-text)' : 'var(--color-success-bg)',
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
                      background: selectedCalc.status === 'rejected' ? 'var(--color-muted-text)' : 'var(--color-danger-bg)',
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
                      background: selectedCalc.status === 'review' ? 'var(--color-muted-text)' : 'var(--color-warning-bg)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: selectedCalc.status === 'review' ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Вернуть на ревью
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--color-muted-text)', marginBottom: 12 }}>
                  Публиковать и менять статус может только админ.
                </p>
              )}
            </div>

            {/* Предпросмотр: как калькулятор будет выглядеть при публикации */}
            <div style={{ flex: '0 0 auto', minHeight: 280, display: 'flex', flexDirection: 'column', border: '1px solid var(--pico-border-color)', borderRadius: 8, overflow: 'hidden', background: 'var(--pico-background-color)', marginBottom: 16 }}>
              <div style={{ padding: '8px 12px', background: 'var(--pico-card-background-color)', borderBottom: '1px solid var(--pico-border-color)', fontSize: 13, fontWeight: 600 }}>
                Как увидит пользователь (окна ввода, выбора, отчёт)
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                <PublicCalculator
                  key={selectedCalc.id}
                  blocks={selectedCalc.blocks}
                  previewMode
                  initialValues={selectedCalc.values}
                  reportHtml={selectedCalc.reportHtml}
                />
              </div>
            </div>

            {/* Комментарии */}
            <div style={{ flex: '0 0 auto', marginTop: 24, marginBottom: 24 }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Комментарии ({selectedCalc.comments.length})</h3>
              
              <div style={{ marginBottom: 12 }}>
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Добавить комментарий..."
                  rows={3}
                  style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', color: 'var(--pico-color)', marginBottom: 8 }}
                />
                <button
                  onClick={() => handleAddComment(selectedCalc.id)}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--pico-primary)',
                    color: 'var(--pico-primary-inverse)',
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
                      background: 'var(--color-comment-bg)',
                      borderRadius: 6,
                      border: '1px solid var(--pico-border-color)',
                      color: 'var(--pico-color)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <strong style={{ fontSize: 13 }}>{comment.author}</strong>
                      <span style={{ fontSize: 11, color: 'var(--color-muted-text)' }}>
                        {new Date(comment.createdAt).toLocaleString('ru-RU')}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--pico-color)' }}>{comment.text}</div>
                  </div>
                ))}
                {selectedCalc.comments.length === 0 && (
                  <div style={{ color: 'var(--color-muted-text)', fontSize: 13, fontStyle: 'italic' }}>
                    Комментариев пока нет
                  </div>
                )}
              </div>
            </div>

            {/* История */}
            <div style={{ flex: '0 0 auto' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: 12 }}>История изменений</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedCalc.history.slice().reverse().map(entry => (
                  <div
                    key={entry.id}
                  style={{
                    padding: 8,
                    background: 'var(--color-history-bg)',
                    borderRadius: 4,
                    fontSize: 12,
                    color: 'var(--pico-color)',
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
                      <span style={{ color: 'var(--color-muted-text)' }}>
                        {new Date(entry.timestamp).toLocaleString('ru-RU')}
                      </span>
                    </div>
                    {entry.details && (
                      <div style={{ marginTop: 4, color: 'var(--color-muted-text)', fontSize: 11 }}>
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
