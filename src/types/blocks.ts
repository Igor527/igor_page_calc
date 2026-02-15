// Интерфейсы для блоков конструктора калькулятора

export type BlockType =
  | 'input'
  | 'formula'
  | 'text'
  | 'constant'
  | 'table_lookup'
  | 'condition'
  | 'group'
  | 'output'
  | 'image'
  | 'button';


export interface BaseBlock {
  id: string;
  type: BlockType;
  label?: string;
}

export interface InputBlock extends BaseBlock {
  type: 'input';
  inputType: 'number' | 'text' | 'select';
  options?: string[]; // для select
  defaultValue?: number | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}
export interface ConstantBlock extends BaseBlock {
  type: 'constant';
  value: number | string;
}

export interface TableLookupBlock extends BaseBlock {
  type: 'table_lookup';
  data: any[]; // массив объектов или массив массивов
  key_col: string;
  target_col: string;
  selected_key: string | number;
}

export interface ConditionBlock extends BaseBlock {
  type: 'condition';
  if_exp: string; // выражение для проверки
  then_id: string; // id блока, если true
  else_id: string; // id блока, если false
}

export interface FormulaBlock extends BaseBlock {
  type: 'formula';
  formula: string; // Формула в формате math.js, например: "a + b * 2"
  dependencies: string[]; // ID блоков, от которых зависит формула
  template?: string; // шаблон для отображения формулы
}

export interface TextBlock extends BaseBlock {
  type: 'text';
  content: string;
  style?: 'h1' | 'p';
}
export interface GroupBlock extends BaseBlock {
  type: 'group';
  title: string;
  children: Block[];
}

export interface OutputBlock extends BaseBlock {
  type: 'output';
  sourceId: string; // id блока, чье значение выводится
  format?: string; // шаблон отображения
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  url: string;
  alt?: string;
}

export interface ButtonBlock extends BaseBlock {
  type: 'button';
  action: 'calculate' | 'reset' | string;
  label: string;
}

export type Block =
  | InputBlock
  | FormulaBlock
  | TextBlock
  | ConstantBlock
  | TableLookupBlock
  | ConditionBlock
  | GroupBlock
  | OutputBlock
  | ImageBlock
  | ButtonBlock;
