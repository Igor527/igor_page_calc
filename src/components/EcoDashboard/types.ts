export type PollutionSourceType = 'TETZ' | 'factory' | 'quarry' | 'road' | 'boiler';
export type HazardClass = 1 | 2 | 3 | 4 | 5;

export interface City {
  name: string;
  coords: [number, number];
  isCustom?: boolean;
}

export interface PollutionMetrics {
  pm25: number;
  pm10: number;
  no2: number;
}

export interface PollutionSource {
  id: string;
  name: string;
  type: PollutionSourceType;
  hazardClass: HazardClass;
  emissionHeight: number;
  coordinates: [number, number]; // [lat, lng]
  bufferRadius: number; // in meters
  metrics: PollutionMetrics;
}

export interface AirQualityCell {
  id: string;
  bounds: [[number, number], [number, number]]; // [SW, NE] corners
  aqiIndex: number; // 0 to 500
  dominantPollutant: 'PM2.5' | 'PM10' | 'NO2';
  metrics: {
    pm25: { current: number; yearlyAvg: number };
    pm10: { current: number; yearlyAvg: number };
    no2: { current: number; yearlyAvg: number };
  };
  history: {
    time: string;
    pm25: number;
    pm10: number;
    no2: number;
  }[];
}

export interface LayerState {
  showAirQuality: boolean;
  showSources: boolean;
  showBufferZones: boolean;
}
