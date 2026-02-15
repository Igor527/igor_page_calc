// Компонент для отображения ошибок в блоках

import React from 'react';
import { extractErrorMessage, isErrorValue } from '@/lib/errors';

interface ErrorDisplayProps {
  value: any;
  blockId: string;
  blockLabel?: string;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ value, blockId, blockLabel }) => {
  if (!isErrorValue(value)) {
    return null;
  }

  const errorMessage = extractErrorMessage(value);
  const displayLabel = blockLabel || blockId;

  return (
    <div style={{
      margin: '4px 0',
      padding: '8px',
      background: '#fff3cd',
      border: '1px solid #ffc107',
      borderRadius: 4,
      fontSize: 13,
      color: '#856404'
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        ⚠️ Ошибка в блоке "{displayLabel}":
      </div>
      <div style={{ marginLeft: 8 }}>
        {errorMessage || 'Неизвестная ошибка'}
      </div>
    </div>
  );
};

export default ErrorDisplay;
