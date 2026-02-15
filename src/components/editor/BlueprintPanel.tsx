import { useCalcStore } from '@/lib/store';
import type { Block } from '@/types/blocks';

interface BlueprintPanelProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const BlueprintPanel: React.FC<BlueprintPanelProps> = ({ selectedId, onSelect }) => {
  const blocks = useCalcStore((s) => s.blocks);
  return (
    <section style={{ padding: 16 }}>
      <h2 style={{ fontSize: '1.2rem', marginBottom: 12 }}>Блоки калькулятора</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {blocks.map((b) => (
          <li
            key={b.id}
            style={{
              cursor: 'pointer',
              fontWeight: selectedId === b.id ? 'bold' : undefined,
              background: selectedId === b.id ? '#222' : undefined,
              color: selectedId === b.id ? '#fff' : undefined,
              borderRadius: 6,
              padding: '4px 8px',
              marginBottom: 4,
            }}
            onClick={() => onSelect(b.id)}
          >
            {b.label || b.id} <span style={{ color: '#aaa' }}>({b.type})</span>
          </li>
        ))}
      </ul>
      <div style={{ color: '#888', marginTop: 16 }}>
        <i>Добавление/удаление блоков — скоро!</i>
      </div>
    </section>
  );
};

export default BlueprintPanel;
