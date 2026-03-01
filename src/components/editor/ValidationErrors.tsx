// Компонент для отображения ошибок валидации

import React from 'react';
import { validateBlocks } from '@/lib/validation';
import type { Block } from '@/types/blocks';

interface ValidationErrorsProps {
  blocks: Block[];
  /** При клике по ошибке — выделить блок в редакторе */
  onSelectBlock?: (blockId: string) => void;
}

const ValidationErrors: React.FC<ValidationErrorsProps> = ({ blocks, onSelectBlock }) => {
  if (blocks.length === 0) return null;
  
  const validation = validateBlocks(blocks);
  
  if (validation.valid) return null;
  
  return (
    <div style={{ 
      margin: '12px 0', 
      padding: '12px', 
      background: 'var(--color-error-bg)', 
      border: '1px solid var(--color-error-border)', 
      borderRadius: 6,
      fontSize: 13,
      color: 'var(--pico-color)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--color-danger)' }}>
        Ошибки валидации ({validation.errors.length}):
      </div>
      <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--color-danger)' }}>
        {validation.errors.map((error, idx) => (
          <li key={idx} style={{ marginBottom: 4 }}>
            {onSelectBlock ? (
              <button
                type="button"
                onClick={() => onSelectBlock(error.blockId)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'var(--color-danger)',
                  textAlign: 'left',
                  font: 'inherit',
                  textDecoration: 'underline',
                }}
              >
                <strong>{error.blockId}</strong>
                {error.field && ` (${error.field})`}: {error.message}
              </button>
            ) : (
              <>
                <strong>{error.blockId}</strong>
                {error.field && ` (${error.field})`}: {error.message}
              </>
            )}
          </li>
        ))}
      </ul>
      {validation.warnings.length > 0 && (
        <>
          <div style={{ fontWeight: 600, marginTop: 12, marginBottom: 8, color: 'var(--color-warning-text)' }}>
            Предупреждения ({validation.warnings.length}):
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--color-warning-text)' }}>
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
