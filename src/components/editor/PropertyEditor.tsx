import { useCalcStore } from '@/lib/store';
import type { Block } from '@/types/blocks';

interface PropertyEditorProps {
  selectedId: string | null;
}

const PropertyEditor: React.FC<PropertyEditorProps> = ({ selectedId }) => {
  const blocks = useCalcStore((s) => s.blocks);
  const setBlocks = useCalcStore((s) => s.setBlocks);
  const block = blocks.find((b) => b.id === selectedId) || null;


  function handleChange<K extends keyof Block>(key: K, value: any) {
    if (!block) return;
    const updated = blocks.map((b) => b.id === block.id ? { ...b, [key]: value } : b);
    setBlocks(updated);
  }

  return (
    <aside style={{ padding: 16, borderLeft: '1px solid #eee', minWidth: 220 }}>
      <h3 style={{ fontSize: '1.1rem', marginBottom: 10 }}>Свойства блока</h3>
      {!block && <div style={{ color: '#888' }}>Блок не выбран</div>}
      {block && (
        <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            <span style={{ fontSize: 13, color: '#888' }}>ID</span>
            <input value={block.id} disabled style={{ background: '#eee' }} />
          </label>
          <label>
            <span style={{ fontSize: 13, color: '#888' }}>Тип</span>
            <input value={block.type} disabled style={{ background: '#eee' }} />
          </label>
          <label>
            <span style={{ fontSize: 13, color: '#888' }}>Заголовок (label)</span>
            <input value={block.label || ''} onChange={e => handleChange('label', e.target.value)} />
          </label>

          {/* Для input */}
          {block.type === 'input' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Тип ввода</span>
                <select value={block.inputType} onChange={e => handleChange('inputType', e.target.value)}>
                  <option value="number">number</option>
                  <option value="text">text</option>
                  <option value="select">select</option>
                </select>
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Значение по умолчанию</span>
                <input value={block.defaultValue ?? ''} onChange={e => handleChange('defaultValue', e.target.value)} />
              </label>
              {block.inputType === 'select' && (
                <label>
                  <span style={{ fontSize: 13, color: '#888' }}>Опции (через запятую)</span>
                  <input value={Array.isArray(block.options) ? block.options.join(',') : ''} onChange={e => handleChange('options', e.target.value.split(','))} />
                </label>
              )}
            </>
          )}

          {/* Для select_from_table */}
          {block.type === 'select_from_table' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Источник (таблица)</span>
                <select value={block.dataSource} onChange={e => handleChange('dataSource', e.target.value)}>
                  <option value="">—</option>
                  {blocks.filter(b => b.type === 'data_table').map(tbl => (
                    <option key={tbl.id} value={tbl.id}>{tbl.label || tbl.id}</option>
                  ))}
                </select>
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Столбец</span>
                <select value={block.column} onChange={e => handleChange('column', e.target.value)}>
                  <option value="">—</option>
                  {blocks.find(b => b.id === block.dataSource && b.type === 'data_table')?.columns?.map((col: string) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Значение по умолчанию</span>
                <input value={block.defaultValue ?? ''} onChange={e => handleChange('defaultValue', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Диапазон (min/max)</span>
                <input type="number" placeholder="min" value={block.range?.min ?? ''} onChange={e => handleChange('range', { ...block.range, min: e.target.value ? Number(e.target.value) : undefined })} style={{ width: 60, marginRight: 8 }} />
                <input type="number" placeholder="max" value={block.range?.max ?? ''} onChange={e => handleChange('range', { ...block.range, max: e.target.value ? Number(e.target.value) : undefined })} style={{ width: 60 }} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Фильтр (столбец:значение, через запятую)</span>
                <input value={block.filter ? Object.entries(block.filter).map(([k, v]) => `${k}:${v}`).join(',') : ''} onChange={e => {
                  const obj: Record<string, string|number> = {};
                  e.target.value.split(',').forEach(pair => {
                    const [k, v] = pair.split(':');
                    if (k && v !== undefined) obj[k.trim()] = isNaN(Number(v)) ? v.trim() : Number(v);
                  });
                  handleChange('filter', obj);
                }} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Опции из нескольких столбцов (через запятую)</span>
                <input value={Array.isArray(block.multipleColumns) ? block.multipleColumns.join(',') : ''} onChange={e => handleChange('multipleColumns', e.target.value.split(',').map(s => s.trim()))} />
              </label>
            </>
          )}

          {/* Для select_from_object */}
          {block.type === 'select_from_object' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Источник (object)</span>
                <select value={block.objectSource} onChange={e => handleChange('objectSource', e.target.value)}>
                  <option value="">—</option>
                  {blocks.filter(b => b.type === 'constant' || b.type === 'data_table').map(obj => (
                    <option key={obj.id} value={obj.id}>{obj.label || obj.id}</option>
                  ))}
                </select>
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Значение по умолчанию</span>
                <input value={block.defaultValue ?? ''} onChange={e => handleChange('defaultValue', e.target.value)} />
              </label>
            </>
          )}

          {/* Для constant */}
          {block.type === 'constant' && (
            <label>
              <span style={{ fontSize: 13, color: '#888' }}>Значение</span>
              <input value={block.value} onChange={e => handleChange('value', e.target.value)} />
            </label>
          )}

          {/* Для table_lookup */}
          {block.type === 'table_lookup' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Ключевой столбец</span>
                <input value={block.key_col} onChange={e => handleChange('key_col', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Целевой столбец</span>
                <input value={block.target_col} onChange={e => handleChange('target_col', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Выбранный ключ</span>
                <input value={block.selected_key} onChange={e => handleChange('selected_key', e.target.value)} />
              </label>
            </>
          )}

          {/* Для condition */}
          {block.type === 'condition' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Условие (if)</span>
                <input value={block.if_exp} onChange={e => handleChange('if_exp', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>then_id</span>
                <select value={block.then_id} onChange={e => handleChange('then_id', e.target.value)}>
                  <option value="">—</option>
                  {blocks.map(b => <option key={b.id} value={b.id}>{b.label || b.id}</option>)}
                </select>
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>else_id</span>
                <select value={block.else_id} onChange={e => handleChange('else_id', e.target.value)}>
                  <option value="">—</option>
                  {blocks.map(b => <option key={b.id} value={b.id}>{b.label || b.id}</option>)}
                </select>
              </label>
            </>
          )}

          {/* Для group */}
          {block.type === 'group' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Заголовок группы</span>
                <input value={block.title} onChange={e => handleChange('title', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Дочерние блоки (id через запятую)</span>
                <input value={Array.isArray(block.children) ? block.children.map((b: any) => b.id || b).join(',') : ''} onChange={e => {
                  const ids = e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean);
                  const children = ids.map(id => blocks.find(b => b.id === id)).filter(Boolean);
                  handleChange('children', children);
                }} />
              </label>
            </>
          )}

          {/* Для output */}
          {block.type === 'output' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Источник (id)</span>
                <select value={block.sourceId} onChange={e => handleChange('sourceId', e.target.value)}>
                  <option value="">—</option>
                  {blocks.map(b => <option key={b.id} value={b.id}>{b.label || b.id}</option>)}
                </select>
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Формат</span>
                <input value={block.format || ''} onChange={e => handleChange('format', e.target.value)} />
              </label>
            </>
          )}

          {/* Для image */}
          {block.type === 'image' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>URL</span>
                <input value={block.url} onChange={e => handleChange('url', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Alt</span>
                <input value={block.alt || ''} onChange={e => handleChange('alt', e.target.value)} />
              </label>
            </>
          )}

          {/* Для button */}
          {block.type === 'button' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Действие</span>
                <input value={block.action} onChange={e => handleChange('action', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Текст кнопки</span>
                <input value={block.label} onChange={e => handleChange('label', e.target.value)} />
              </label>
            </>
          )}

          {/* Для formula */}
          {block.type === 'formula' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Формула (math.js)</span>
                <input value={block.formula} onChange={e => handleChange('formula', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Зависимости (id через запятую)</span>
                <input value={Array.isArray(block.dependencies) ? block.dependencies.join(',') : ''} onChange={e => handleChange('dependencies', e.target.value.split(',').map(s => s.trim()))} />
              </label>
            </>
          )}

          {/* Для text */}
          {block.type === 'text' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Текст</span>
                <textarea value={block.content} onChange={e => handleChange('content', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Стиль</span>
                <select value={block.style || 'p'} onChange={e => handleChange('style', e.target.value)}>
                  <option value="h1">h1</option>
                  <option value="p">p</option>
                </select>
              </label>
            </>
          )}

          {/* Для data_table */}
          {block.type === 'data_table' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Имя таблицы</span>
                <input value={block.name} onChange={e => handleChange('name', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Столбцы (через запятую)</span>
                <input value={Array.isArray(block.columns) ? block.columns.join(',') : ''} onChange={e => handleChange('columns', e.target.value.split(',').map(s => s.trim()))} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Строки (JSON)</span>
                <textarea value={JSON.stringify(block.rows, null, 2)} onChange={e => {
                  try {
                    handleChange('rows', JSON.parse(e.target.value));
                  } catch {}
                }} />
              </label>
            </>
          )}

          {/* Для chart */}
          {block.type === 'chart' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Тип графика</span>
                <input value={block.chartType} onChange={e => handleChange('chartType', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Источник данных (id)</span>
                <input value={block.dataSource} onChange={e => handleChange('dataSource', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>X-ось (столбец)</span>
                <input value={block.xKey} onChange={e => handleChange('xKey', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: '#888' }}>Y-ось (столбец)</span>
                <input value={block.yKey} onChange={e => handleChange('yKey', e.target.value)} />
              </label>
            </>
          )}
        </form>
      )}
    </aside>
  );
};

export default PropertyEditor;
