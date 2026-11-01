import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Layers, Sliders, Info, X, MapPin, Factory, Pickaxe, Wind, Activity, Map as MapIcon, TrendingUp, Plus, Trash2, Crosshair, RotateCcw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { MapComponent } from './MapComponent';
import { LayerState, PollutionSource, AirQualityCell, City } from './types';
import { DEFAULT_CITIES, CITIES, generateMockSources, generateMockAirQualityCells } from './mockData';

const STORAGE_KEY_CITIES = 'eco_dashboard_saved_cities';
const STORAGE_KEY_CURRENT_CITY = 'eco_dashboard_selected_city';

export const EcoDashboard: React.FC = () => {
  const [layerState, setLayerState] = useState<LayerState>({
    showAirQuality: true,
    showSources: true,
    showBufferZones: true,
  });
  
  const [cities, setCities] = useState<City[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CITIES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load saved cities', e);
    }
    return DEFAULT_CITIES;
  });

  const [currentCityName, setCurrentCityName] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CURRENT_CITY);
      if (saved) return saved;
    } catch (e) {}
    return DEFAULT_CITIES[0].name;
  });

  const [maxHazardClass, setMaxHazardClass] = useState<number>(5);
  const [selectedSource, setSelectedSource] = useState<PollutionSource | null>(null);
  const [selectedCell, setSelectedCell] = useState<AirQualityCell | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const [mapBounds, setMapBounds] = useState<{ south: number, north: number, west: number, east: number } | null>(null);
  const [mapZoom, setMapZoom] = useState(13);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);

  // Form state for adding custom city
  const [isAddingCity, setIsAddingCity] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [newCityLat, setNewCityLat] = useState('');
  const [newCityLng, setNewCityLng] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  // Save cities to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CITIES, JSON.stringify(cities));
    } catch (e) {}
  }, [cities]);

  // Save selected city to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CURRENT_CITY, currentCityName);
    } catch (e) {}
  }, [currentCityName]);

  const currentCity = useMemo(() => {
    return cities.find(c => c.name === currentCityName) || cities[0] || DEFAULT_CITIES[0];
  }, [cities, currentCityName]);
  
  // Sources are generated globally for the city (around 150 of them now)
  const sources = useMemo(() => generateMockSources(currentCity.coords), [currentCity]);
  
  // Cells are generated dynamically ONLY for the visible bounds at the current zoom level
  const cells = useMemo(() => generateMockAirQualityCells(mapBounds, mapZoom), [mapBounds, mapZoom]);

  const handleMapChange = useCallback((
    bounds: { south: number, north: number, west: number, east: number }, 
    zoom: number,
    center?: [number, number]
  ) => {
    setMapBounds(bounds);
    setMapZoom(zoom);
    if (center) {
      setMapCenter(center);
    }
  }, []);

  const handleSourceClick = useCallback((source: PollutionSource) => {
    setSelectedSource(source);
    setSelectedCell(null);
  }, []);

  const handleCellClick = useCallback((cell: AirQualityCell) => {
    setSelectedCell(cell);
    setSelectedSource(null);
  }, []);

  const toggleLayer = (key: keyof LayerState) => {
    setLayerState(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleUseCenter = () => {
    if (mapCenter) {
      setNewCityLat(mapCenter[0].toFixed(5));
      setNewCityLng(mapCenter[1].toFixed(5));
      setAddError(null);
    }
  };

  const handleAddCity = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newCityName.trim();
    if (!trimmedName) {
      setAddError('Укажите название города');
      return;
    }
    const lat = parseFloat(newCityLat.replace(',', '.'));
    const lng = parseFloat(newCityLng.replace(',', '.'));

    if (isNaN(lat) || lat < -85 || lat > 85) {
      setAddError('Широта должна быть числом от -85 до 85');
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setAddError('Долгота должна быть числом от -180 до 180');
      return;
    }

    if (cities.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
      setAddError('Город с таким названием уже есть в списке');
      return;
    }

    const newCity: City = {
      name: trimmedName,
      coords: [lat, lng],
      isCustom: true,
    };

    const updated = [...cities, newCity];
    setCities(updated);
    setCurrentCityName(trimmedName);
    setSelectedSource(null);
    setSelectedCell(null);
    setNewCityName('');
    setNewCityLat('');
    setNewCityLng('');
    setAddError(null);
    setIsAddingCity(false);
  };

  const handleDeleteCity = (cityName: string) => {
    const updated = cities.filter(c => c.name !== cityName);
    setCities(updated);
    if (currentCityName === cityName) {
      const nextCity = updated[0]?.name || DEFAULT_CITIES[0].name;
      setCurrentCityName(nextCity);
    }
    setSelectedSource(null);
    setSelectedCell(null);
  };

  const handleResetCities = () => {
    if (window.confirm('Сбросить список городов к исходным?')) {
      setCities(DEFAULT_CITIES);
      setCurrentCityName(DEFAULT_CITIES[0].name);
      setSelectedSource(null);
      setSelectedCell(null);
    }
  };

  return (
    <div 
      className="w-full flex flex-col md:flex-row bg-slate-900 text-slate-100 overflow-hidden font-sans relative"
      style={{ height: 'calc(100vh - var(--content-offset-from-header, 64px) - var(--site-footer-height, 56px))' }}
    >
      
      {/* Map Area */}
      <div className="flex-1 relative">
        <MapComponent 
          layerState={layerState} 
          maxHazardClass={maxHazardClass}
          center={currentCity.coords}
          sources={sources}
          cells={cells}
          onSourceClick={handleSourceClick}
          onCellClick={handleCellClick}
          onMapChange={handleMapChange}
        />
        
        {/* Mobile Sidebar Toggle */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          aria-label={isSidebarOpen ? "Закрыть панель управления" : "Открыть панель управления"}
          title={isSidebarOpen ? "Закрыть панель управления" : "Открыть панель управления"}
          className="absolute top-4 left-4 z-10 p-2 bg-slate-800/80 backdrop-blur-md rounded-md md:hidden border border-slate-700 shadow-lg hover:bg-slate-700 transition-colors"
        >
          <Layers size={20} />
        </button>

        {/* Floating Legend */}
        <div className="absolute bottom-6 right-6 z-10 p-4 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-lg shadow-xl hidden md:block">
          <h4 className="font-semibold mb-2 text-sm border-b border-slate-700 pb-1">Легенда (Класс опасности)</h4>
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-red-500"></div> I класс (1000м)</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-orange-500"></div> II класс (500м)</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-yellow-500"></div> III класс (300м)</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-blue-500"></div> IV класс (100м)</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-green-500"></div> V класс (50м)</div>
          </div>
        </div>
      </div>

      {/* Control Sidebar */}
      <div className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 absolute md:relative z-20 w-80 h-full bg-slate-800/95 backdrop-blur-lg border-r border-slate-700 flex flex-col shadow-2xl overflow-y-auto`}>
        <div className="p-5 border-b border-slate-700 flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2 text-emerald-400">
            <Activity size={24} /> 
            Эко-Монитор
          </h2>
          <button 
            className="md:hidden p-2 hover:bg-slate-700 rounded-md transition-colors" 
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Закрыть панель управления"
            title="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 flex-1 flex flex-col gap-6">
          {/* Location Picker */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label htmlFor="city-select" className="font-semibold text-slate-300 flex items-center gap-2 cursor-pointer text-sm">
                <MapIcon size={18} className="text-emerald-400" /> Выбор города
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsAddingCity(!isAddingCity);
                  setAddError(null);
                }}
                className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium transition-colors"
                title="Добавить свой город"
              >
                <Plus size={14} /> {isAddingCity ? 'Скрыть' : 'Добавить'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <select
                id="city-select"
                value={currentCityName}
                onChange={(e) => {
                  setCurrentCityName(e.target.value);
                  setSelectedSource(null);
                  setSelectedCell(null);
                }}
                className="flex-1 bg-slate-700 border border-slate-600 text-slate-100 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none"
              >
                {cities.map(city => (
                  <option key={city.name} value={city.name}>
                    {city.name} {city.isCustom ? '★' : ''}
                  </option>
                ))}
              </select>

              {currentCity.isCustom && (
                <button
                  type="button"
                  onClick={() => handleDeleteCity(currentCity.name)}
                  className="p-2.5 bg-red-500/20 hover:bg-red-500/40 text-red-300 border border-red-500/30 rounded-lg transition-colors"
                  title="Удалить этот город"
                  aria-label="Удалить добавленный город"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            {/* Form for adding a custom city */}
            {isAddingCity && (
              <form onSubmit={handleAddCity} className="mt-3 p-3 bg-slate-900/70 border border-slate-700 rounded-lg text-xs space-y-2.5 animate-in fade-in">
                <div className="font-semibold text-slate-200 flex justify-between items-center">
                  <span>Новая локация</span>
                  <button
                    type="button"
                    onClick={handleUseCenter}
                    disabled={!mapCenter}
                    className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1 disabled:opacity-40"
                    title="Заполнить координатами текущего центра карты"
                  >
                    <Crosshair size={12} /> Из центра карты
                  </button>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Название города:</label>
                  <input
                    type="text"
                    value={newCityName}
                    onChange={(e) => setNewCityName(e.target.value)}
                    placeholder="Например: Самара"
                    className="w-full bg-slate-800 border border-slate-600 rounded px-2.5 py-1.5 text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 mb-1">Широта (Lat):</label>
                    <input
                      type="text"
                      value={newCityLat}
                      onChange={(e) => setNewCityLat(e.target.value)}
                      placeholder="53.195"
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2.5 py-1.5 text-slate-100 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Долгота (Lng):</label>
                    <input
                      type="text"
                      value={newCityLng}
                      onChange={(e) => setNewCityLng(e.target.value)}
                      placeholder="50.100"
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2.5 py-1.5 text-slate-100 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                {addError && (
                  <div className="text-red-400 text-[11px]">{addError}</div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-1.5 rounded transition-colors text-center"
                  >
                    Сохранить и перейти
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingCity(false);
                      setAddError(null);
                    }}
                    className="px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 py-1.5 rounded transition-colors"
                  >
                    Отмена
                  </button>
                </div>
              </form>
            )}

            {cities.some(c => c.isCustom) && (
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={handleResetCities}
                  className="text-[11px] text-slate-400 hover:text-slate-300 flex items-center gap-1 ml-auto"
                  title="Сбросить список к стандартным городам"
                >
                  <RotateCcw size={11} /> Сбросить список
                </button>
              </div>
            )}
          </div>

          {/* Layer Controls */}
          <div className="border-t border-slate-700 pt-5">
            <h3 className="font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Layers size={18} /> Управление слоями
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="form-checkbox text-emerald-500 rounded bg-slate-700 border-slate-600 focus:ring-emerald-500" 
                  checked={layerState.showAirQuality} onChange={() => toggleLayer('showAirQuality')} />
                <span className="text-sm">Качество воздуха (Heatmap)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="form-checkbox text-emerald-500 rounded bg-slate-700 border-slate-600 focus:ring-emerald-500" 
                  checked={layerState.showSources} onChange={() => toggleLayer('showSources')} />
                <span className="text-sm">Источники загрязнения</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="form-checkbox text-emerald-500 rounded bg-slate-700 border-slate-600 focus:ring-emerald-500" 
                  checked={layerState.showBufferZones} onChange={() => toggleLayer('showBufferZones')} disabled={!layerState.showSources} />
                <span className="text-sm opacity-90">Санитарно-защитные зоны</span>
              </label>
            </div>
          </div>

          {/* Filters */}
          <div className="border-t border-slate-700 pt-5">
            <h3 className="font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Sliders size={18} /> Фильтры
            </h3>
            <div className="space-y-2">
              <label className="text-sm block">
                Классы опасности (I — самый опасный):
                <div className="font-semibold text-emerald-400 mt-1">
                  Показывать от I до {['I', 'II', 'III', 'IV', 'V'][maxHazardClass - 1]}
                </div>
              </label>
              <input 
                type="range" min="1" max="5" step="1" 
                value={maxHazardClass} 
                onChange={(e) => setMaxHazardClass(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 mt-2"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>Только I</span>
                <span>Все (I-V)</span>
              </div>
            </div>
          </div>
          
          {/* Object Information Panel */}
          <div className="border-t border-slate-700 pt-5 flex-1">
            <h3 className="font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Info size={18} /> Детальная информация
            </h3>
            
            {!selectedSource && !selectedCell && (
              <div className="text-sm text-slate-500 italic p-4 bg-slate-900/50 rounded-lg text-center">
                Выберите объект на карте
              </div>
            )}

            {selectedSource && (
              <div className="bg-slate-900/50 p-4 rounded-lg space-y-3 text-sm animate-in fade-in slide-in-from-bottom-2">
                <h4 className="font-bold text-lg text-white flex items-center gap-2 border-b border-slate-700 pb-2">
                  {selectedSource.type === 'TETZ' ? <Factory className="text-orange-400"/> : 
                   selectedSource.type === 'quarry' ? <Pickaxe className="text-red-400"/> : <MapPin className="text-blue-400"/>}
                  {selectedSource.name}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">Тип:</span> <span>{selectedSource.type}</span>
                  <span className="text-slate-400">Класс опасности:</span> <span className="font-semibold">{selectedSource.hazardClass}</span>
                  <span className="text-slate-400">Радиус СЗЗ:</span> <span>{selectedSource.bufferRadius} м</span>
                  <span className="text-slate-400">Высота выброса:</span> <span>{selectedSource.emissionHeight} м</span>
                </div>
                
                <div className="mt-4 pt-3 border-t border-slate-700">
                  <h5 className="font-semibold mb-2 text-slate-300">Показатели выбросов</h5>
                  <div className="space-y-1">
                    <div className="flex justify-between"><span>PM2.5:</span> <span className={selectedSource.metrics.pm25 > 50 ? 'text-red-400' : 'text-green-400'}>{selectedSource.metrics.pm25} µg/m³</span></div>
                    <div className="flex justify-between"><span>PM10:</span> <span className={selectedSource.metrics.pm10 > 50 ? 'text-red-400' : 'text-green-400'}>{selectedSource.metrics.pm10} µg/m³</span></div>
                    <div className="flex justify-between"><span>NO2:</span> <span className={selectedSource.metrics.no2 > 40 ? 'text-red-400' : 'text-green-400'}>{selectedSource.metrics.no2} µg/m³</span></div>
                  </div>
                </div>
              </div>
            )}

            {selectedCell && (
              <div className="bg-slate-900/50 p-4 rounded-lg space-y-4 text-sm animate-in fade-in slide-in-from-bottom-2">
                <h4 className="font-bold text-lg text-white flex items-center gap-2 border-b border-slate-700 pb-2">
                  <Wind className="text-blue-400"/>
                  Сводка по квадрату
                </h4>
                
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div className="bg-slate-800 p-2 rounded border border-slate-700 text-center">
                    <div className="text-slate-400 text-xs mb-1">AQI (Индекс)</div>
                    <div className={`font-bold text-lg ${
                      selectedCell.aqiIndex > 150 ? 'text-red-500' : 
                      selectedCell.aqiIndex > 100 ? 'text-orange-500' : 
                      selectedCell.aqiIndex > 50 ? 'text-yellow-500' : 'text-green-500'
                    }`}>
                      {selectedCell.aqiIndex.toFixed(0)}
                    </div>
                  </div>
                  <div className="bg-slate-800 p-2 rounded border border-slate-700 text-center">
                    <div className="text-slate-400 text-xs mb-1">Доминанта</div>
                    <div className="font-bold text-lg text-slate-200">
                      {selectedCell.dominantPollutant}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h5 className="font-semibold text-slate-300 text-xs uppercase tracking-wider">Текущие / За год</h5>
                  <div className="grid grid-cols-3 gap-2 text-center bg-slate-800 p-2 rounded border border-slate-700">
                    <div>
                      <div className="text-xs text-slate-400">PM2.5</div>
                      <div className="font-semibold">{selectedCell.metrics.pm25.current} <span className="text-slate-500 text-xs font-normal">/ {selectedCell.metrics.pm25.yearlyAvg}</span></div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">PM10</div>
                      <div className="font-semibold">{selectedCell.metrics.pm10.current} <span className="text-slate-500 text-xs font-normal">/ {selectedCell.metrics.pm10.yearlyAvg}</span></div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">NO2</div>
                      <div className="font-semibold">{selectedCell.metrics.no2.current} <span className="text-slate-500 text-xs font-normal">/ {selectedCell.metrics.no2.yearlyAvg}</span></div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-700">
                  <h5 className="font-semibold text-slate-300 mb-3 flex items-center gap-2">
                    <TrendingUp size={16} className="text-emerald-400"/> Суточная динамика
                  </h5>
                  <div className="h-48 w-full -ml-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={selectedCell.history} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tickMargin={5} />
                        <YAxis stroke="#94a3b8" fontSize={10} />
                        <RechartsTooltip 
                          contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', fontSize: '12px' }}
                          itemStyle={{ padding: 0 }}
                        />
                        <Line type="monotone" name="PM2.5" dataKey="pm25" stroke="#10b981" strokeWidth={2} dot={false} />
                        <Line type="monotone" name="PM10" dataKey="pm10" stroke="#f59e0b" strokeWidth={2} dot={false} />
                        <Line type="monotone" name="NO2" dataKey="no2" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
