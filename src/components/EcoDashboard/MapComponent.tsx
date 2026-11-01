import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Rectangle, useMap, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { LayerState, PollutionSource, AirQualityCell, HazardClass } from './types';

// Fix for default marker icon missing in Leaflet setup
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapComponentProps {
  layerState: LayerState;
  maxHazardClass: number;
  center: [number, number];
  sources: PollutionSource[];
  cells: AirQualityCell[];
  onSourceClick: (source: PollutionSource) => void;
  onCellClick: (cell: AirQualityCell) => void;
  onMapChange: (bounds: { south: number, north: number, west: number, east: number }, zoom: number, center?: [number, number]) => void;
}

const MapUpdater = ({ center, onMapChange }: { center: [number, number], onMapChange: MapComponentProps['onMapChange'] }) => {
  const map = useMap();
  
  useEffect(() => {
    map.flyTo(center, 13, { animate: true, duration: 1.5 });
  }, [center, map]);

  useEffect(() => {
    const handleMove = () => {
      const b = map.getBounds();
      const c = map.getCenter();
      onMapChange(
        { south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() },
        map.getZoom(),
        [c.lat, c.lng]
      );
    };
    
    map.on('moveend', handleMove);
    handleMove(); // Initial call
    
    return () => {
      map.off('moveend', handleMove);
    };
  }, [map, onMapChange]);
  
  return null;
};

const getHazardColor = (hazardClass: HazardClass) => {
  switch (hazardClass) {
    case 1: return '#ef4444'; // red (high danger)
    case 2: return '#f97316'; // orange
    case 3: return '#eab308'; // yellow
    case 4: return '#3b82f6'; // blue
    case 5: return '#22c55e'; // green
    default: return '#888';
  }
};

const getAqiColor = (aqi: number) => {
  if (aqi > 150) return '#ef4444';
  if (aqi > 100) return '#f97316';
  if (aqi > 50) return '#eab308';
  return '#22c55e';
};

export const MapComponent: React.FC<MapComponentProps> = ({ 
  layerState, 
  maxHazardClass, 
  center, 
  sources = [], 
  cells = [], 
  onSourceClick, 
  onCellClick, 
  onMapChange 
}) => {
  const filteredSources = React.useMemo(() => {
    return (sources || []).filter(s => s.hazardClass <= maxHazardClass);
  }, [sources, maxHazardClass]);

  return (
    <div className="w-full h-full relative z-0">
      <MapContainer center={center} zoom={13} minZoom={3} maxZoom={18} style={{ height: '100%', width: '100%' }}>
        <MapUpdater center={center} onMapChange={onMapChange} />
        <TileLayer
          attribution='&copy; <a href="https://osm.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="map-tiles-dark"
        />
        
        <style>{`
          .map-tiles-dark {
            filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7);
          }
        `}</style>
        
        {/* Air Quality Heatmap Grid */}
        {layerState.showAirQuality && (cells || []).map(cell => (
          <Rectangle
            key={cell.id}
            bounds={cell.bounds}
            pathOptions={{
              color: 'transparent',
              fillColor: getAqiColor(cell.aqiIndex),
              fillOpacity: 0.3
            }}
            eventHandlers={{
              click: () => onCellClick(cell)
            }}
          >
            <Tooltip sticky className="bg-slate-800 text-slate-100 border-slate-700 shadow-xl opacity-95">
              <div className="text-xs p-1">
                <div className="font-bold mb-1 border-b border-slate-600 pb-1">
                  AQI: {cell.aqiIndex.toFixed(0)} ({cell.dominantPollutant})
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span></span><span className="text-slate-400">Тек.</span><span className="text-slate-400">Год</span>
                  <span className="font-semibold">PM2.5:</span> <span>{cell.metrics.pm25.current}</span> <span>{cell.metrics.pm25.yearlyAvg}</span>
                  <span className="font-semibold">PM10:</span> <span>{cell.metrics.pm10.current}</span> <span>{cell.metrics.pm10.yearlyAvg}</span>
                  <span className="font-semibold">NO2:</span> <span>{cell.metrics.no2.current}</span> <span>{cell.metrics.no2.yearlyAvg}</span>
                </div>
                <div className="mt-2 text-emerald-400 italic text-center text-[10px]">Кликните для графиков</div>
              </div>
            </Tooltip>
          </Rectangle>
        ))}

        {/* Sources and Buffer Zones */}
        {layerState.showSources && filteredSources.map(source => (
          <React.Fragment key={source.id}>
            {layerState.showBufferZones && (
              <Circle
                center={source.coordinates}
                radius={source.bufferRadius}
                pathOptions={{
                  color: getHazardColor(source.hazardClass),
                  fillColor: getHazardColor(source.hazardClass),
                  fillOpacity: 0.1,
                  weight: 1,
                  dashArray: '5, 5'
                }}
              />
            )}
            <Marker 
              position={source.coordinates} 
              eventHandlers={{ click: () => onSourceClick(source) }}
            >
              <Popup>
                <div className="text-sm">
                  <strong>{source.name}</strong><br/>
                  Тип: {source.type}<br/>
                  Класс: {source.hazardClass}
                </div>
              </Popup>
            </Marker>
          </React.Fragment>
        ))}
      </MapContainer>
    </div>
  );
};
