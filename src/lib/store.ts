// Zustand store для управления состоянием калькулятора
// Содержит массив blocks (описание блоков) и объект values (вычисленные значения по ID)

import { create } from 'zustand';
import type { Block } from '../types/blocks';
import { validateBlocks } from './validation';


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
          console.warn('Ошибки валидации при загрузке:', validation.errors);
          // Возвращаем пустые блоки, если валидация не прошла
          return { blocks: [], values: {} };
        }
      }
      
      return {
        blocks: loadedBlocks,
        values: parsed.values || {},
      };
    }
  } catch (e) {
    console.warn('Ошибка загрузки из localStorage:', e);
  }
  return { blocks: [], values: {} };
};

// Сохранение в localStorage
const saveToStorage = (blocks: Block[], values: Record<string, number | string>) => {
  try {
    localStorage.setItem('igor-page-calc', JSON.stringify({ blocks, values }));
  } catch (e) {
    console.warn('Ошибка сохранения в localStorage:', e);
  }
};

const initialState = loadFromStorage();

export const useCalcStore = create<CalcState>((set, get) => ({
  blocks: initialState.blocks,
  values: initialState.values,
  setBlocks: (blocks) => {
    // Валидация перед сохранением
    if (blocks.length > 0) {
      const validation = validateBlocks(blocks);
      if (!validation.valid) {
        console.error('❌ Ошибки валидации блоков:', validation.errors);
        // Показываем предупреждение пользователю
        const errorCount = validation.errors.length;
        const errorMessages = validation.errors.slice(0, 3).map(e => `• ${e.blockId}: ${e.message}`).join('\n');
        const moreErrors = errorCount > 3 ? `\n... и ещё ${errorCount - 3} ошибок` : '';
        console.warn(`⚠️ Обнаружено ${errorCount} ошибок валидации:\n${errorMessages}${moreErrors}\n\nПроверьте панель ошибок валидации.`);
      } else {
        console.log('✅ Блоки валидированы успешно');
      }
    }
    set({ blocks });
    saveToStorage(blocks, get().values);
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