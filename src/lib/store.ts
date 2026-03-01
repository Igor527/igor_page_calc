// Zustand store для управления состоянием калькулятора
// Содержит массив blocks (описание блоков) и объект values (вычисленные значения по ID)

import { create } from 'zustand';
import type { Block } from '../types/blocks';
import { validateBlocks } from './validation';
import { toMatrixTableBlock } from './tableData';


// Store хранит массив blocks (описание схемы) и values (значения по id)
// values: { [id]: текущее значение блока (input, constant, formula, ...), для TABLE_LOOKUP — результат поиска, для CONDITION — результат условия }
interface CalcState {
  blocks: Block[];
  values: Record<string, number | string>;
  setBlocks: (blocks: Block[]) => void;
  setValues: (values: Record<string, number | string>) => void;
  updateValue: (id: string, value: number | string) => void;
}

// Загрузка из localStorage с валидацией
const loadFromStorage = (): { blocks: Block[]; values: Record<string, number | string> } => {
  try {
    const saved = localStorage.getItem('igor-page-calc');
    if (saved) {
      const parsed = JSON.parse(saved);
      const loadedBlocks = parsed.blocks || [];
      
      // Валидация загруженных блоков
      if (Array.isArray(loadedBlocks) && loadedBlocks.length > 0) {
        const validation = validateBlocks(loadedBlocks);
        if (!validation.valid) {
          return { blocks: [], values: {} };
        }
      }
      
      return {
        blocks: loadedBlocks,
        values: parsed.values || {},
      };
    }
  } catch {
    // ignore corrupted storage
  }
  return { blocks: [], values: {} };
};

// Сохранение в localStorage
const saveToStorage = (blocks: Block[], values: Record<string, number | string>) => {
  try {
    localStorage.setItem('igor-page-calc', JSON.stringify({ blocks, values }));
  } catch {
    // ignore storage write error
  }
};

const initialState = loadFromStorage();

export const useCalcStore = create<CalcState>((set, get) => ({
  blocks: initialState.blocks,
  values: initialState.values,
  setBlocks: (blocks) => {
    const normalizedBlocks = blocks.map((block) => {
      if (block.type === 'data_table') {
        return toMatrixTableBlock(block as any);
      }
      return block;
    });
    // Валидация перед сохранением (только предупреждения, не блокируем сохранение)
    if (normalizedBlocks.length > 0) {
      const validation = validateBlocks(normalizedBlocks);
      if (!validation.valid && validation.errors.length > 0) {
        // Валидация не прошла — ошибки видны в панели ValidationErrors
      }
    }
    set({ blocks: normalizedBlocks });
    saveToStorage(normalizedBlocks, get().values);
  },
  setValues: (values) => {
    set({ values });
    saveToStorage(get().blocks, values);
  },
  updateValue: (id, value) => {
    const newValues = { ...get().values, [id]: value };
    set({ values: newValues });
    saveToStorage(get().blocks, newValues);
  },
}));

// Zustand — это легковесная библиотека для управления состоянием в React-приложениях.
// Здесь store хранит массив блоков калькулятора и объект с вычисленными значениями по их ID.
// Методы setBlocks, setValues, updateValue позволяют обновлять состояние из компонентов.