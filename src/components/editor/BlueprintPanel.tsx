import React from 'react';

const BlueprintPanel: React.FC = () => {
  return (
    <section style={{ padding: 16 }}>
      <h2 style={{ fontSize: '1.2rem', marginBottom: 12 }}>Блоки калькулятора</h2>
      <div style={{ color: '#888' }}>
        Здесь будет список и добавление блоков (input, formula, table, ...)
      </div>
    </section>
  );
};

export default BlueprintPanel;
