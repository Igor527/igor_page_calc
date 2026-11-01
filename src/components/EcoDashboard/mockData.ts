import { PollutionSource, AirQualityCell, PollutionSourceType, HazardClass, City } from './types';

export const DEFAULT_CITIES: City[] = [
  { name: 'Москва', coords: [55.751244, 37.618423] },
  { name: 'Санкт-Петербург', coords: [59.934280, 30.335098] },
  { name: 'Казань', coords: [55.796127, 49.106414] },
  { name: 'Екатеринбург', coords: [56.838926, 60.605702] },
  { name: 'Новосибирск', coords: [55.008353, 82.935733] },
  { name: 'Нижний Новгород', coords: [56.326887, 44.005886] },
  { name: 'Челябинск', coords: [55.164442, 61.436843] },
  { name: 'Красноярск', coords: [56.015283, 92.893248] },
];

export const CITIES = DEFAULT_CITIES;

const pseudoRandom = (seed1: number, seed2: number) => {
  const sin = Math.sin(seed1 * 12.9898 + seed2 * 78.233);
  return (sin * 43758.5453) - Math.floor(sin * 43758.5453);
};

export const generateMockSources = (center: [number, number]): PollutionSource[] => {
  const sources: PollutionSource[] = [
    { id: 'src-1', name: 'ТЭЦ "Главная"', type: 'TETZ', hazardClass: 2, emissionHeight: 120, coordinates: [center[0] - 0.01, center[1] + 0.01], bufferRadius: 500, metrics: { pm25: 45, pm10: 80, no2: 60 } },
    { id: 'src-2', name: 'Завод "ПромТех"', type: 'factory', hazardClass: 3, emissionHeight: 40, coordinates: [center[0] + 0.01, center[1] - 0.01], bufferRadius: 300, metrics: { pm25: 35, pm10: 60, no2: 30 } },
    { id: 'src-3', name: 'Открытый Карьер', type: 'quarry', hazardClass: 1, emissionHeight: 0, coordinates: [center[0] + 0.02, center[1] + 0.015], bufferRadius: 1000, metrics: { pm25: 80, pm10: 120, no2: 20 } },
    { id: 'src-4', name: 'Транспортный узел', type: 'road', hazardClass: 4, emissionHeight: 0, coordinates: [center[0] - 0.01, center[1] - 0.02], bufferRadius: 100, metrics: { pm25: 55, pm10: 60, no2: 70 } },
    { id: 'src-5', name: 'Районная Котельная', type: 'boiler', hazardClass: 5, emissionHeight: 30, coordinates: [center[0] - 0.02, center[1] - 0.005], bufferRadius: 50, metrics: { pm25: 25, pm10: 30, no2: 20 } }
  ];

  const types: PollutionSourceType[] = ['TETZ', 'factory', 'quarry', 'road', 'boiler'];
  
  // Generate 150 more scattered objects for zoom-out visibility
  for (let i = 0; i < 150; i++) {
    const r = pseudoRandom(i, center[0]) * 1.5; // Up to 1.5 degrees away
    const theta = pseudoRandom(i, center[1]) * 2 * Math.PI;
    const lat = center[0] + r * Math.cos(theta);
    const lng = center[1] + r * Math.sin(theta);
    
    const typeIdx = Math.floor(pseudoRandom(lat, lng) * types.length);
    const hazard = Math.floor(pseudoRandom(lng, lat) * 5) + 1 as HazardClass;
    
    sources.push({
      id: `src-scatter-${i}`,
      name: `Объект ${Math.floor(pseudoRandom(i, 3) * 1000)}`,
      type: types[typeIdx],
      hazardClass: hazard,
      emissionHeight: hazard === 1 ? 0 : hazard * 20,
      coordinates: [lat, lng],
      bufferRadius: hazard === 1 ? 1000 : hazard === 2 ? 500 : hazard === 3 ? 300 : hazard === 4 ? 100 : 50,
      metrics: {
        pm25: Math.floor(pseudoRandom(lat, 1) * 100),
        pm10: Math.floor(pseudoRandom(lat, 2) * 150),
        no2: Math.floor(pseudoRandom(lat, 3) * 80)
      }
    });
  }

  return sources;
};

export const generateMockAirQualityCells = (
  bounds: { south: number, north: number, west: number, east: number } | null, 
  zoom: number
): AirQualityCell[] => {
  if (!bounds) return [];

  // Clamp bounds to valid geographic limits to prevent overflow or world-wrap issues
  const south = Math.max(-85, Math.min(85, bounds.south));
  const north = Math.max(-85, Math.min(85, bounds.north));
  const west = Math.max(-180, Math.min(180, bounds.west));
  const east = Math.max(-180, Math.min(180, bounds.east));

  if (north <= south || east <= west) return [];

  const latSpan = north - south;
  const lngSpan = east - west;

  // Adaptive density: calculate target step count to prevent browser freezing on zoom out.
  // When zoomed out, latSpan / lngSpan are large, so stepLat / stepLng automatically scale up!
  const targetSteps = zoom >= 15 ? 22 : zoom >= 13 ? 18 : zoom >= 10 ? 15 : 12;
  const stepLat = Math.max(0.002, latSpan / targetSteps);
  const stepLng = Math.max(0.003, lngSpan / targetSteps);

  if (!Number.isFinite(stepLat) || !Number.isFinite(stepLng) || stepLat <= 0 || stepLng <= 0) {
    return [];
  }

  const minLat = Math.floor(south / stepLat) * stepLat;
  const maxLat = Math.ceil(north / stepLat) * stepLat;
  const minLng = Math.floor(west / stepLng) * stepLng;
  const maxLng = Math.ceil(east / stepLng) * stepLng;

  const cells: AirQualityCell[] = [];
  const pollutants: ('PM2.5' | 'PM10' | 'NO2')[] = ['PM2.5', 'PM10', 'NO2'];
  const MAX_CELLS = 350; // Hard safety cap against freeze

  for (let lat = minLat; lat <= maxLat; lat += stepLat) {
    for (let lng = minLng; lng <= maxLng; lng += stepLng) {
      if (cells.length >= MAX_CELLS) break;

      const r = pseudoRandom(lat, lng);
      // Smooth out AQI slightly based on coordinates
      const aqiIndex = Math.max(10, (r * 150) + (Math.sin(lat * 10) * 20)); 

      const currentPM25 = Math.floor(Math.max(5, aqiIndex * 0.4 + pseudoRandom(lat, 1) * 20));
      const currentPM10 = Math.floor(Math.max(10, aqiIndex * 0.6 + pseudoRandom(lat, 2) * 30));
      const currentNO2 = Math.floor(Math.max(2, aqiIndex * 0.2 + pseudoRandom(lat, 3) * 10));

      const yearlyPM25 = Math.floor(currentPM25 * (0.8 + pseudoRandom(lng, 1) * 0.4));
      const yearlyPM10 = Math.floor(currentPM10 * (0.8 + pseudoRandom(lng, 2) * 0.4));
      const yearlyNO2 = Math.floor(currentNO2 * (0.8 + pseudoRandom(lng, 3) * 0.4));

      // Generate 24h history
      const history = [];
      for (let h = 0; h < 24; h += 4) {
        const timeOffset = Math.sin((h / 24) * Math.PI * 2 + r * Math.PI);
        history.push({
          time: `${h.toString().padStart(2, '0')}:00`,
          pm25: Math.max(0, Math.floor(currentPM25 + timeOffset * 15)),
          pm10: Math.max(0, Math.floor(currentPM10 + timeOffset * 25)),
          no2: Math.max(0, Math.floor(currentNO2 + timeOffset * 8)),
        });
      }

      cells.push({
        id: `cell-${lat.toFixed(4)}-${lng.toFixed(4)}`,
        bounds: [
          [lat, lng],
          [lat + stepLat, lng + stepLng]
        ],
        aqiIndex,
        dominantPollutant: pollutants[Math.floor(pseudoRandom(lng, lat) * pollutants.length)],
        metrics: {
          pm25: { current: currentPM25, yearlyAvg: yearlyPM25 },
          pm10: { current: currentPM10, yearlyAvg: yearlyPM10 },
          no2: { current: currentNO2, yearlyAvg: yearlyNO2 }
        },
        history
      });
    }
    if (cells.length >= MAX_CELLS) break;
  }

  return cells;
};
