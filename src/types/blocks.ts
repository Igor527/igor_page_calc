// Интерфейсы для блоков конструктора калькулятора

export type BlockType =
  | 'input'
  | 'formula'
  | 'text'
  | 'constant'
  | 'table_lookup'
  | 'data_table'
  | 'chart'
  | 'select_from_table'
  | 'select_from_object'
  | 'condition'
  | 'group'
  | 'output'
  | 'image'
  | 'button';
// SELECT_FROM_TABLE: выбор значения из столбца таблицы с поддержкой диапазона, фильтра и комбинированных опций
export interface SelectFromTableBlock extends BaseBlock {
  type: 'select_from_table';
  label: string;
  dataSource: string; // id блока-таблицы
  column: string; // имя столбца (основной)
  defaultValue?: string | number;
  range?: { min?: number; max?: number }; // диапазон значений (опционально)
  filter?: Record<string, string | number>; // фильтр по другим столбцам (например, { Тип: "жилой" })
  multipleColumns?: string[]; // если нужно формировать опции из нескольких столбцов
}

// SELECT_FROM_OBJECT: выбор значения из объекта (например, из constant)
export interface SelectFromObjectBlock extends BaseBlock {
  type: 'select_from_object';
  label: string;
  objectSource: string; // id блока-источника
  defaultValue?: string | number;
}
// CHART: блок для визуализации графиков
export interface ChartBlock extends BaseBlock {
  type: 'chart';
  chartType: 'line' | 'bar' | 'pie' | 'area' | string; // тип графика
  dataSource: string; // id блока-источника (например, data_table)
  xKey: string; // имя столбца для оси X
  yKey: string; // имя столбца для оси Y
  options?: Record<string, any>; // дополнительные параметры для библиотеки графиков
}
// DATA_TABLE: таблица данных с именем, доступом к ячейкам по ключу/индексу
export interface DataTableBlock extends BaseBlock {
  type: 'data_table';
  name: string; // уникальное имя таблицы в рамках калькулятора
  columns: string[]; // имена столбцов
  rows: Array<Record<string, number | string>>; // массив строк (ключ — имя столбца)
}


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
  | DataTableBlock
  | ChartBlock
  | SelectFromTableBlock
  | SelectFromObjectBlock
  | ConditionBlock
  | GroupBlock
  | OutputBlock
  | ImageBlock
  | ButtonBlock;
