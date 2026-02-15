// Zustand store для управления состоянием калькулятора
// Содержит массив blocks (описание блоков) и объект values (вычисленные значения по ID)

import { create } from 'zustand';
import type { Block } from '../types/blocks';


// Store хранит массив blocks (описание схемы) и values (значения по id)
// values: { [id]: текущее значение блока (input, constant, formula, ...), для TABLE_LOOKUP — результат поиска, для CONDITION — результат условия }
interface CalcState {
  blocks: Block[];
  values: Record<string, number | string>;
  setBlocks: (blocks: Block[]) => void;
  setValues: (values: Record<string, number | string>) => void;
  updateValue: (id: string, value: number | string) => void;
}

export const useCalcStore = create<CalcState>((set) => ({
  blocks: [],
  values: {},
  setBlocks: (blocks) => set({ blocks }),
  setValues: (values) => set({ values }),
  updateValue: (id, value) => set((state) => ({
    values: { ...state.values, [id]: value },
  })),
}));

// Zustand — это легковесная библиотека для управления состоянием в React-приложениях.
// Здесь store хранит массив блоков калькулятора и объект с вычисленными значениями по их ID.
// Методы setBlocks, setValues, updateValue позволяют обновлять состояние из компонентов.