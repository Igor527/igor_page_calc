// Интерфейсы для блоков конструктора калькулятора

export type BlockType =
  | 'input'
  | 'formula'
  | 'constant'
  | 'table_lookup'
  | 'table_range'
  | 'data_table'
  | 'select_from_table'
  | 'select_from_object'
  | 'condition'
  | 'group'
  | 'output'
  | 'image'
  | 'button'
  | 'table_viewer'; // Новый тип для просмотра и выбора свойств таблицы
// SELECT_FROM_TABLE: выбор значения из столбца таблицы с поддержкой диапазона, фильтра и комбинированных опций
export interface SelectFromTableBlock extends BaseBlock {
  type: 'select_from_table';
  label: string;
  dataSource: string; // id блока-таблицы
  column: string; // имя столбца (основной)
  defaultValue?: string | number;
  range?: { min?: number; max?: number }; // диапазон значений по колонке (опционально)
  rowRange?: { start?: number; end?: number }; // диапазон строк (1-based)
  sortBy?: string; // сортировка по столбцу
  sortDirection?: 'asc' | 'desc';
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
  dataSource?: string; // id блока-таблицы
  key_col: string;
  target_col: string;
  selected_key: string | number;
}

export interface TableRangeBlock extends BaseBlock {
  type: 'table_range';
  dataSource: string; // id блока-таблицы
  inputId: string; // id блока, значение которого сравнивается
  minColumn?: string; // имя столбца min (опционально)
  maxColumn: string; // имя столбца max
  valueColumn: string; // имя столбца результата
  fallbackValue?: number | string;
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

// TABLE_VIEWER: промежуточный блок для просмотра и выбора свойств/столбцов таблицы
export interface TableViewerBlock extends BaseBlock {
  type: 'table_viewer';
  label: string;
  dataSource: string; // id блока-таблицы
  selectedColumn?: string; // выбранный столбец
  selectedRow?: number; // выбранная строка (индекс)
  outputType?: 'column' | 'row' | 'cell'; // что выводить
}

export type Block =
  | InputBlock
  | FormulaBlock
  | ConstantBlock
  | TableLookupBlock
  | TableRangeBlock
  | DataTableBlock
  | SelectFromTableBlock
  | SelectFromObjectBlock
  | ConditionBlock
  | GroupBlock
  | OutputBlock
  | ImageBlock
  | ButtonBlock
  | TableViewerBlock;
