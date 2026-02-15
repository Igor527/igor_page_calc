import React from 'react';

const PropertyEditor: React.FC = () => {
  return (
    <aside style={{ padding: 16, borderLeft: '1px solid #eee', minWidth: 220 }}>
      <h3 style={{ fontSize: '1.1rem', marginBottom: 10 }}>Свойства блока</h3>
      <div style={{ color: '#888' }}>
        Здесь будут настройки выбранного блока
      </div>
    </aside>
  );
};

export default PropertyEditor;
