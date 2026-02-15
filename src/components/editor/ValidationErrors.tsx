// Компонент для отображения ошибок валидации

import React from 'react';
import { validateBlocks } from '@/lib/validation';
import type { Block } from '@/types/blocks';

interface ValidationErrorsProps {
  blocks: Block[];
}

const ValidationErrors: React.FC<ValidationErrorsProps> = ({ blocks }) => {
  if (blocks.length === 0) return null;
  
  const validation = validateBlocks(blocks);
  
  if (validation.valid) return null;
  
  return (
    <div style={{ 
      margin: '12px 0', 
      padding: '12px', 
      background: '#ffe6e6', 
      border: '1px solid #ff9999', 
      borderRadius: 6,
      fontSize: 13
    }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#c00' }}>
        Ошибки валидации ({validation.errors.length}):
      </div>
      <ul style={{ margin: 0, paddingLeft: 20, color: '#800' }}>
        {validation.errors.map((error, idx) => (
          <li key={idx} style={{ marginBottom: 4 }}>
            <strong>{error.blockId}</strong>
            {error.field && ` (${error.field})`}: {error.message}
          </li>
        ))}
      </ul>
      {validation.warnings.length > 0 && (
        <>
          <div style={{ fontWeight: 600, marginTop: 12, marginBottom: 8, color: '#880' }}>
            Предупреждения ({validation.warnings.length}):
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, color: '#660' }}>
            {validation.warnings.map((warning, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>
                <strong>{warning.blockId}</strong>
                {warning.field && ` (${warning.field})`}: {warning.message}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

export default ValidationErrors;
