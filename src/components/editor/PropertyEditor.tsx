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
