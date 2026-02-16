// Утилиты для работы с формулами

import type { Block } from '@/types/blocks';

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Извлекает зависимости формулы по ID блоков.
 * Учитываются только ID, которые являются валидными идентификаторами.
 */
export function extractFormulaDependencies(
  formula: string,
  blocks: Block[],
  currentId?: string
): string[] {
  if (!formula || typeof formula !== 'string') return [];

  const candidates = blocks
    .map((b) => b.id)
    .filter((id) => id !== currentId && IDENTIFIER_PATTERN.test(id));

  const deps = candidates.filter((id) => {
    const pattern = new RegExp(`\\b${escapeRegExp(id)}\\b`);
    return pattern.test(formula);
  });

  return Array.from(new Set(deps));
}
