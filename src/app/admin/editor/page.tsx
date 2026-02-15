// Базовый лейаут редактора с тремя панелями: левая (40%), правая (60%), AI-панель (только для админа)
// Для UI используется простая flex-верстка. AI-панель отображается только если isAdmin === true.

import React from 'react';

interface EditorPageProps {
  isAdmin?: boolean;
}

const EditorPage: React.FC<EditorPageProps> = ({ isAdmin = false }) => {
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      {/* Левая панель (40%) */}
      <div style={{ flex: '0 0 40%', borderRight: '1px solid #eee', padding: 16 }}>
        {/* BlueprintPanel (логика) */}
        <div>Левая панель (BlueprintPanel)</div>
      </div>
      {/* Правая панель (60% без AI, 50% если AI) */}
      <div style={{ flex: isAdmin ? '0 0 50%' : '0 0 60%', borderRight: isAdmin ? '1px solid #eee' : undefined, padding: 16 }}>
        {/* ReportPanel (визуальный отчет) */}
        <div>Правая панель (ReportPanel)</div>
      </div>
      {/* AI-панель (только для админа) */}
      {isAdmin && (
        <div style={{ flex: '0 0 10%', minWidth: 220, background: '#fafbfc', padding: 16 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>AI-панель (Mistral)</div>
          <div>Только для администратора</div>
          {/* Здесь будет UI для общения с Mistral AI */}
        </div>
      )}
    </div>
  );
};

export default EditorPage;
