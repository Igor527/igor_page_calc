/**
 * Метеостанция: графики температуры, давления, PM1/2.5/10.
 * Данные загружаются из Google Таблицы (опубликованный CSV).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  fetchWeatherFromSheet,
  fetchWeatherFromFirebase,
  getWeatherFirebaseConfig,
  parseWeatherCsv,
  getWeatherSheetUrl,
  getWeatherStationId,
  type WeatherRow,
} from '@/lib/weatherSheet';

const chartHeight = 260;

const WeatherPage: React.FC = () => {
  const [data, setData] = useState<WeatherRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'firebase' | 'csv' | null>(null);
  const [csvUrl, setCsvUrl] = useState(getWeatherSheetUrl());
  const [pasteCsv, setPasteCsv] = useState('');

  const loadFromFirebase = useCallback(async () => {
    const config = getWeatherFirebaseConfig();
    if (!config) return false;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchWeatherFromFirebase(config);
      setData(rows);
      setSource('firebase');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки из Firebase');
      setData([]);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const load = useCallback(async (url: string) => {
    if (!url.trim()) {
      setError('Укажите URL CSV или настройте Firebase (VITE_FIREBASE_DATABASE_URL + VITE_WEATHER_DATA_KEY).');
      setData([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchWeatherFromSheet(url);
      setData(rows);
      setSource('csv');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки данных');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const config = getWeatherFirebaseConfig();
    const url = getWeatherSheetUrl();
    if (config) {
      setCsvUrl(url);
      loadFromFirebase().catch(() => {});
    } else if (url) {
      setCsvUrl(url);
      load(url);
    }
  }, [loadFromFirebase, load]);

  const hasTemp = data.some((r) => r.temperature != null);
  const hasPressure = data.some((r) => r.pressure != null);
  const hasPm = data.some((r) => r.pm1 != null || r.pm25 != null || r.pm10 != null);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        Метеостанция
      </h1>

      {/* Номер станции: из .env (VITE_WEATHER_STATION_ID) или из первой строки таблицы */}
      {(getWeatherStationId() || data[0]?.station) && (
        <p className="text-gray-600 dark:text-gray-400 mb-4" style={{ fontSize: 14 }}>
          <strong>Станция:</strong> {getWeatherStationId() || data[0]?.station}
        </p>
      )}

      {/* Источник: Firebase или URL CSV */}
      {source === 'firebase' && (
        <p style={{ fontSize: 12, color: 'var(--pico-muted-color)', marginBottom: 8 }}>
          Данные из Firebase (лог из Google Таблицы через скрипт).
        </p>
      )}
      <div style={{ marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {!getWeatherFirebaseConfig() && (
          <input
            type="url"
            value={csvUrl}
            onChange={(e) => setCsvUrl(e.target.value)}
            placeholder="URL CSV (Google Таблица → Публикация в интернете → CSV)"
            style={{
              flex: '1',
              minWidth: 200,
              padding: '8px 12px',
              fontSize: 13,
              border: '1px solid var(--pico-border-color)',
              borderRadius: 6,
              background: 'var(--pico-form-element-background-color)',
              color: 'var(--pico-color)',
            }}
          />
        )}
        <button
          type="button"
          onClick={() => (getWeatherFirebaseConfig() ? loadFromFirebase() : load(csvUrl))}
          disabled={loading}
          className="primary"
          style={{ padding: '8px 16px', fontSize: 13 }}
        >
          {loading ? 'Загрузка…' : 'Обновить'}
        </button>
      </div>

      {error && (
        <p style={{ color: 'var(--pico-del-color)', marginBottom: 16, fontSize: 14 }}>{error}</p>
      )}

      {/* Запасной вариант: вставка CSV вручную (при ошибке открыт автоматически) */}
      <details style={{ marginBottom: 16, fontSize: 13 }} open={!!error}>
        <summary style={{ cursor: 'pointer', color: 'var(--pico-muted-color)' }}>
          Если по ссылке не загружается — вставьте CSV вручную
        </summary>
        <p style={{ margin: '8px 0 6px', color: 'var(--pico-muted-color)' }}>
          Откройте таблицу в браузере, скопируйте всё (Ctrl+A, Ctrl+C) или скачайте CSV и вставьте сюда.
        </p>
        <textarea
          value={pasteCsv}
          onChange={(e) => setPasteCsv(e.target.value)}
          placeholder="Вставьте сюда содержимое CSV..."
          rows={6}
          style={{
            width: '100%',
            padding: 10,
            fontSize: 12,
            fontFamily: 'monospace',
            border: '1px solid var(--pico-border-color)',
            borderRadius: 6,
            background: 'var(--pico-form-element-background-color)',
            color: 'var(--pico-color)',
            resize: 'vertical',
          }}
        />
        <button
          type="button"
          onClick={() => {
            setError(null);
            try {
              const rows = parseWeatherCsv(pasteCsv);
              setData(rows);
              if (rows.length === 0) setError('В вставленном тексте нет подходящих строк.');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Ошибка разбора CSV');
            }
          }}
          className="primary"
          style={{ marginTop: 8, padding: '8px 16px', fontSize: 13 }}
        >
          Применить
        </button>
      </details>

      {!error && data.length === 0 && !loading && (
        <div className="text-gray-500 dark:text-gray-400 mb-6" style={{ fontSize: 13 }}>
          <p style={{ marginBottom: 8 }}>
            Загрузите данные: укажите URL опубликованного CSV выше или задайте VITE_WEATHER_SHEET_CSV_URL в .env.
          </p>
          <p style={{ marginBottom: 6, fontWeight: 600, color: 'var(--pico-color)' }}>
            «Открыть доступ» по ссылке — недостаточно. Нужна именно <strong>Публикация в интернете</strong>:
          </p>
          <ol style={{ margin: '0 0 0 16px', paddingLeft: 8 }}>
            <li>В Google Таблице: <strong>Файл → Публикация в интернете</strong> (или Share → Publish to web).</li>
            <li>Выберите лист и формат <strong>CSV</strong>, нажмите «Опубликовать».</li>
            <li>Скопируйте ссылку (вид: <code style={{ background: 'var(--pico-code-background-color)', padding: '1px 4px', borderRadius: 4 }}>.../pub?gid=0&single=true&output=csv</code> или <code style={{ background: 'var(--pico-code-background-color)', padding: '1px 4px', borderRadius: 4 }}>.../export?format=csv&gid=0</code>) и вставьте в поле выше.</li>
          </ol>
          <p style={{ marginTop: 10, padding: 8, background: 'var(--pico-card-background-color)', borderRadius: 6, border: '1px solid var(--pico-border-color)', fontSize: 12 }}>
            <strong>Если по ссылке не грузится (CORS):</strong> откройте эту ссылку в новой вкладке. Если браузер показывает таблицу или скачивает CSV — скопируйте весь текст (Ctrl+A, Ctrl+C) и вставьте в блок «Вставьте CSV вручную» ниже. Так данные загрузятся без прокси.
          </p>
          <p style={{ marginTop: 8, fontSize: 12 }}>
            Колонки: дата/время, температура, давление, pm1, pm2.5, pm10, станция (или формат AirStationLog без заголовка).
          </p>
        </div>
      )}

      {data.length > 0 && (
        <>
          {/* Температура */}
          {hasTemp && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 16, marginBottom: 8, color: 'var(--pico-color)' }}>
                Температура, °C
              </h2>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--pico-border-color)" />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 11 }}
                    stroke="var(--pico-muted-color)"
                  />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--pico-muted-color)" />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--pico-card-background-color)',
                      border: '1px solid var(--pico-border-color)',
                      borderRadius: 8,
                    }}
                    labelStyle={{ color: 'var(--pico-color)' }}
                    formatter={(value: number) => [value != null ? `${value} °C` : '—', 'Температура']}
                  />
                  <Line
                    type="monotone"
                    dataKey="temperature"
                    stroke="var(--pico-primary)"
                    strokeWidth={2}
                    dot={false}
                    name="Температура"
                  />
                </LineChart>
              </ResponsiveContainer>
            </section>
          )}

          {/* Давление */}
          {hasPressure && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 16, marginBottom: 8, color: 'var(--pico-color)' }}>
                Давление
              </h2>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--pico-border-color)" />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 11 }}
                    stroke="var(--pico-muted-color)"
                  />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--pico-muted-color)" />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--pico-card-background-color)',
                      border: '1px solid var(--pico-border-color)',
                      borderRadius: 8,
                    }}
                    formatter={(value: number) => [value != null ? value : '—', 'Давление']}
                  />
                  <Line
                    type="monotone"
                    dataKey="pressure"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={false}
                    name="Давление"
                  />
                </LineChart>
              </ResponsiveContainer>
            </section>
          )}

          {/* PM1, PM2.5, PM10 */}
          {hasPm && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 16, marginBottom: 8, color: 'var(--pico-color)' }}>
                PM (мкг/м³)
              </h2>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--pico-border-color)" />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 11 }}
                    stroke="var(--pico-muted-color)"
                  />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--pico-muted-color)" />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--pico-card-background-color)',
                      border: '1px solid var(--pico-border-color)',
                      borderRadius: 8,
                    }}
                    formatter={(value: number) => [value != null ? `${value} µg/m³` : '—', '']}
                  />
                  <Legend />
                  {data.some((r) => r.pm1 != null) && (
                    <Line
                      type="monotone"
                      dataKey="pm1"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                      name="PM1"
                    />
                  )}
                  {data.some((r) => r.pm25 != null) && (
                    <Line
                      type="monotone"
                      dataKey="pm25"
                      stroke="#eab308"
                      strokeWidth={2}
                      dot={false}
                      name="PM2.5"
                    />
                  )}
                  {data.some((r) => r.pm10 != null) && (
                    <Line
                      type="monotone"
                      dataKey="pm10"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                      name="PM10"
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </section>
          )}
        </>
      )}

      <p style={{ marginTop: 24 }}>
        <a href="/" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>
          ← На главную
        </a>
      </p>
    </div>
  );
};

export default WeatherPage;
