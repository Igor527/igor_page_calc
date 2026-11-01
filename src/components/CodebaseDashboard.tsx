import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip
} from 'recharts';

const data = [
  { name: '2 окт 25', ruby: 50, ts: 40, data: 60, docs: 5, infra: 25 },
  { name: 'ноя 25', ruby: 52, ts: 45, data: 62, docs: 5, infra: 25 },
  { name: 'дек 25', ruby: 53, ts: 50, data: 65, docs: 5, infra: 25 },
  { name: 'янв 26', ruby: 54, ts: 55, data: 66, docs: 5, infra: 25 },
  { name: 'фев 26', ruby: 55, ts: 60, data: 67, docs: 5, infra: 20 },
  { name: 'мар 26', ruby: 56, ts: 65, data: 68, docs: 5, infra: 15 },
  { name: 'апр 26', ruby: 58, ts: 70, data: 70, docs: 5, infra: 15 },
  { name: 'май 26', ruby: 60, ts: 75, data: 72, docs: 5, infra: 10 },
  { name: 'июн 26', ruby: 65, ts: 40, data: 90, docs: 5, infra: 10 },
  { name: 'июл 26', ruby: 70, ts: 50, data: 92, docs: 5, infra: 10 },
  { name: 'авг 26', ruby: 80, ts: 60, data: 95, docs: 5, infra: 10 },
  { name: 'сен 26', ruby: 90, ts: 80, data: 98, docs: 5, infra: 10 },
  { name: '2 окт 26', ruby: 110, ts: 100, data: 97, docs: 5, infra: 10 },
];

const legendItems = [
  { key: 'ruby', label: 'Ruby', color: '#4a88e9' },
  { key: 'ts', label: 'TypeScript / JS', color: '#ed885c' },
  { key: 'data', label: 'Данные и конфиги (YAML, JSON)', color: '#4ab087' },
  { key: 'docs', label: 'Документация', color: '#dfb43a' },
  { key: 'infra', label: 'Инфраструктура и шаблоны', color: '#f285a9' },
];

const formatYAxis = (value: number) => {
  if (value === 0) return '0';
  return `${value} тыс.`;
};

export const CodebaseDashboard: React.FC = () => {
  return (
    <div className="max-w-6xl mx-auto p-8 font-sans text-gray-900 bg-[#fbfbfb] min-h-screen">
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="text-sm text-gray-500 mb-1 font-medium">Объём кода</div>
          <div className="text-3xl font-bold mb-1 tracking-tight">322 тыс.</div>
          <div className="text-[13px] text-gray-500 font-mono flex items-center gap-1">
            было 180 тыс., <span className="text-green-600 font-sans font-semibold">×1,8</span>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="text-sm text-gray-500 mb-1 font-medium">Коммитов за год</div>
          <div className="text-3xl font-bold mb-1 tracking-tight">5 268</div>
          <div className="text-[13px] text-gray-500 font-mono">
            +633 тыс. / -460 тыс. строк
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="text-sm text-gray-500 mb-1 font-medium">Тестов (Ruby)</div>
          <div className="text-3xl font-bold mb-1 tracking-tight">1 948</div>
          <div className="text-[13px] text-gray-500 font-mono flex items-center gap-1">
            было 918, <span className="text-green-600 font-sans font-semibold">×2,1</span>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="text-sm text-gray-500 mb-1 font-medium">Покрытие строк сейчас</div>
          <div className="text-3xl font-bold mb-1 tracking-tight">92,4%</div>
          <div className="text-[13px] text-gray-500 font-mono">
            47 344 из 51 251 строки, SimpleCov
          </div>
        </div>
      </div>

      {/* Main Section */}
      <h2 className="text-2xl font-bold mb-3 tracking-tight">Объём кодовой базы</h2>
      <p className="text-gray-600 text-[15px] mb-8 leading-relaxed max-w-5xl">
        Код вырос со 180 до 322 тыс. строк, в 1,8 раза. TypeScript вырос вдвое, и это переезд на Inertia: в те же месяцы HAML
        сократился до нуля. Ruby полгода держался на одном уровне и начал расти с весны. В июне TypeScript просел, а JSON
        вырос: это переехали локали.
      </p>

      {/* Chart Card */}
      <div className="border border-gray-200 rounded-xl bg-white p-6 shadow-sm">
        
        {/* Custom Legend */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-8">
          {legendItems.map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-sm" 
                style={{ backgroundColor: item.color }} 
              />
              <span className="text-sm text-gray-600 font-medium">{item.label}</span>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="h-[400px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart 
              data={data} 
              margin={{ top: 10, right: 0, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis 
                dataKey="name" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#888', fontSize: 12 }}
                dy={10}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tickFormatter={formatYAxis}
                tick={{ fill: '#888', fontSize: 12 }}
                domain={[0, 400]}
                ticks={[0, 100, 200, 300, 400]}
                dx={-10}
              />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              
              <Area 
                type="linear" 
                dataKey="ruby" 
                stackId="1" 
                stroke={legendItems[0].color} 
                fill={legendItems[0].color} 
                strokeWidth={1}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Area 
                type="linear" 
                dataKey="ts" 
                stackId="1" 
                stroke={legendItems[1].color} 
                fill={legendItems[1].color}
                strokeWidth={1}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Area 
                type="linear" 
                dataKey="data" 
                stackId="1" 
                stroke={legendItems[2].color} 
                fill={legendItems[2].color} 
                strokeWidth={1}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Area 
                type="linear" 
                dataKey="docs" 
                stackId="1" 
                stroke={legendItems[3].color} 
                fill={legendItems[3].color} 
                strokeWidth={1}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Area 
                type="linear" 
                dataKey="infra" 
                stackId="1" 
                stroke={legendItems[4].color} 
                fill={legendItems[4].color} 
                strokeWidth={1}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              
              {/* Optional: reference lines or custom annotations can go here */}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
