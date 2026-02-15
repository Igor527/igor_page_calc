// Компонент для рендеринга графиков на основе ChartBlock

import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ChartBlock, DataTableBlock } from '@/types/blocks';

interface ChartRendererProps {
  block: ChartBlock;
  dataSource: DataTableBlock | null;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#ff7300'];

const ChartRenderer: React.FC<ChartRendererProps> = ({ block, dataSource }) => {
  if (!dataSource || !dataSource.rows || dataSource.rows.length === 0) {
    return (
      <div style={{ margin: '12px 0', padding: '16px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 4 }}>
        <strong>Ошибка:</strong> Источник данных "{block.dataSource}" не найден или пуст
      </div>
    );
  }

  // Преобразуем данные таблицы в формат для графиков
  const chartData = dataSource.rows.map((row: any) => {
    const dataPoint: Record<string, any> = {};
    // Копируем все столбцы из строки
    dataSource.columns.forEach((col: string) => {
      dataPoint[col] = row[col];
    });
    return dataPoint;
  });

  // Проверяем наличие необходимых ключей
  if (!block.xKey || !block.yKey) {
    return (
      <div style={{ margin: '12px 0', padding: '16px', background: '#f8d7da', border: '1px solid #dc3545', borderRadius: 4 }}>
        <strong>Ошибка:</strong> Не указаны xKey или yKey для графика
      </div>
    );
  }

  if (!dataSource.columns.includes(block.xKey) || !dataSource.columns.includes(block.yKey)) {
    return (
      <div style={{ margin: '12px 0', padding: '16px', background: '#f8d7da', border: '1px solid #dc3545', borderRadius: 4 }}>
        <strong>Ошибка:</strong> Столбцы "{block.xKey}" или "{block.yKey}" не найдены в таблице
      </div>
    );
  }

  const chartType = block.chartType || 'line';
  const height = block.options?.height || 300;

  // Рендеринг в зависимости от типа графика
  switch (chartType.toLowerCase()) {
    case 'line':
      return (
        <div style={{ margin: '12px 0' }}>
          {block.label && <h3 style={{ marginBottom: 8, fontSize: 16, fontWeight: 600 }}>{block.label}</h3>}
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={block.xKey} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey={block.yKey} stroke="#8884d8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );

    case 'bar':
      return (
        <div style={{ margin: '12px 0' }}>
          {block.label && <h3 style={{ marginBottom: 8, fontSize: 16, fontWeight: 600 }}>{block.label}</h3>}
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={block.xKey} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey={block.yKey} fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );

    case 'pie':
      // Для pie chart данные должны быть в формате [{name, value}]
      const pieData = chartData.map((row: any) => ({
        name: String(row[block.xKey] || ''),
        value: typeof row[block.yKey] === 'number' ? row[block.yKey] : parseFloat(String(row[block.yKey] || 0)) || 0,
      }));

      return (
        <div style={{ margin: '12px 0' }}>
          {block.label && <h3 style={{ marginBottom: 8, fontSize: 16, fontWeight: 600 }}>{block.label}</h3>}
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );

    case 'area':
      return (
        <div style={{ margin: '12px 0' }}>
          {block.label && <h3 style={{ marginBottom: 8, fontSize: 16, fontWeight: 600 }}>{block.label}</h3>}
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={block.xKey} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey={block.yKey} stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );

    default:
      return (
        <div style={{ margin: '12px 0', padding: '16px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 4 }}>
          <strong>Предупреждение:</strong> Неподдерживаемый тип графика "{chartType}". Поддерживаются: line, bar, pie, area
        </div>
      );
  }
};

export default ChartRenderer;
