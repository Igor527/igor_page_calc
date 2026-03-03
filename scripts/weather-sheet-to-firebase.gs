/**
 * Google Apps Script: отправка данных из листа в Firebase Realtime Database.
 * Настройка: Расширения → Apps Script → вставить этот код.
 * В Файл → Настройки проекта → Скрипты: добавьте свойства
 *   FIREBASE_DB_URL = https://ВАШ_ПРОЕКТ-default-rtdb.firebaseio.com
 *   WEATHER_DATA_KEY = длинный_секретный_ключ (тот же, что VITE_WEATHER_DATA_KEY в .env сайта)
 *
 * Триггер: Редактирование → Триггеры → Добавить триггер → по времени (каждые 5–15 мин) или при изменении листа.
 */

var CONFIG = null;

function getConfig() {
  if (CONFIG) return CONFIG;
  var props = PropertiesService.getScriptProperties();
  var url = (props.getProperty('FIREBASE_DB_URL') || '').replace(/\/$/, '');
  var key = props.getProperty('WEATHER_DATA_KEY') || '';
  if (!url || !key) {
    throw new Error('Задайте FIREBASE_DB_URL и WEATHER_DATA_KEY в Настройки проекта → Скрипты');
  }
  CONFIG = { databaseUrl: url, dataKey: key };
  return CONFIG;
}

function parseNum(val) {
  if (val === null || val === undefined || val === '') return undefined;
  if (typeof val === 'number' && !isNaN(val)) return val;
  var s = String(val).replace(/,/, '.').replace(/\s/g, '').toLowerCase();
  if (s === 'nan' || s === 'n/a' || s === '-') return undefined;
  var n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

function parseDate(val) {
  if (val === null || val === undefined || val === '') return undefined;
  if (typeof val === 'number' && !isNaN(val)) {
    if (val > 1000000000000) return val;
    return new Date((val - 25569) * 86400 * 1000).getTime();
  }
  var d = new Date(val);
  return isNaN(d.getTime()) ? undefined : d.getTime();
}

function findCol(headers, names) {
  for (var n = 0; n < names.length; n++) {
    var need = names[n].toLowerCase().replace(/\s+/g, ' ');
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i] || '').toLowerCase().replace(/\s+/g, ' ');
      if (h === need || h.indexOf(need) !== -1 || need.indexOf(h) !== -1) return i;
    }
  }
  return -1;
}

function rowToObject(cells, iDate, iTemp, iPressure, iPm1, iPm25, iPm10, iStation) {
  var dateRaw = iDate >= 0 ? (cells[iDate] || cells[iDate + 1]) : '';
  var ts = parseDate(dateRaw);
  if (ts == null && iDate >= 0) return null;
  var date = ts || new Date().getTime();
  var row = {
    date: date,
    temperature: iTemp >= 0 ? parseNum(cells[iTemp]) : undefined,
    pressure: iPressure >= 0 ? parseNum(cells[iPressure]) : undefined,
    pm1: iPm1 >= 0 ? parseNum(cells[iPm1]) : undefined,
    pm25: iPm25 >= 0 ? parseNum(cells[iPm25]) : undefined,
    pm10: iPm10 >= 0 ? parseNum(cells[iPm10]) : undefined,
    station: iStation >= 0 ? (cells[iStation] ? String(cells[iStation]).trim() : undefined) : undefined
  };
  return row;
}

function getColumnIndices(headers, firstRowLooksLikeData) {
  if (firstRowLooksLikeData) {
    return { iDate: 1, iTemp: 4, iPressure: 7, iPm1: -1, iPm25: 5, iPm10: 6, iStation: -1, startRow: 0 };
  }
  var iDate = findCol(headers, ['date', 'datetime', 'дата', 'время', 'time']);
  var iTemp = findCol(headers, ['temp', 'temperature', 'температура', 't']);
  var iPressure = findCol(headers, ['pressure', 'давление', 'p']);
  var iPm1 = findCol(headers, ['pm1', 'pm 1']);
  var iPm25 = findCol(headers, ['pm2.5', 'pm25', 'pm 2.5']);
  var iPm10 = findCol(headers, ['pm10', 'pm 10']);
  var iStation = findCol(headers, ['station', 'станция', 'id']);
  return { iDate: iDate, iTemp: iTemp, iPressure: iPressure, iPm1: iPm1, iPm25: iPm25, iPm10: iPm10, iStation: iStation, startRow: 1 };
}

function looksLikeDataRow(cells) {
  var c0 = cells[0];
  var c1 = cells[1];
  if (parseDate(c1)) return true;
  if (parseDate(c0)) return true;
  if (typeof c0 === 'string' && (/^\d{4}-\d{2}-\d{2}/.test(c0) || /^\d{1,2}\.\d{1,2}/.test(c0))) return true;
  if (typeof c1 === 'string' && (/^\d{4}-\d{2}-\d{2}/.test(c1) || /^\d{1,2}\.\d{1,2}/.test(c1))) return true;
  return false;
}

function pushRowsToFirebase(rows) {
  var config = getConfig();
  var baseUrl = config.databaseUrl + '/weather/' + encodeURIComponent(config.dataKey) + '/rows.json';
  var pushed = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r || r.date == null) continue;
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(r),
      muteHttpExceptions: true
    };
    var resp = UrlFetchApp.fetch(baseUrl, options);
    if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) {
      pushed++;
    } else {
      Logger.log('Firebase error row ' + i + ': ' + resp.getContentText());
    }
  }
  return pushed;
}

function getLastProcessedRow() {
  var props = PropertiesService.getScriptProperties();
  var v = props.getProperty('WEATHER_LAST_ROW');
  return v ? parseInt(v, 10) : 0;
}

function setLastProcessedRow(row) {
  PropertiesService.getScriptProperties().setProperty('WEATHER_LAST_ROW', String(row));
}

/**
 * Синхронизировать новые строки листа с Firebase (только строки после последней обработанной).
 */
function syncWeatherToFirebase() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  if (!data || data.length === 0) return { pushed: 0, message: 'Нет данных' };

  var firstRow = data[0].map(function(c) { return c != null ? String(c) : ''; });
  var noHeader = looksLikeDataRow(firstRow);
  var cols = getColumnIndices(firstRow, noHeader);
  var startRow = cols.startRow;
  var lastProcessed = getLastProcessedRow();
  var rowsToSend = [];

  for (var i = Math.max(startRow, lastProcessed); i < data.length; i++) {
    var row = rowToObject(data[i], cols.iDate, cols.iTemp, cols.iPressure, cols.iPm1, cols.iPm25, cols.iPm10, cols.iStation);
    if (row) rowsToSend.push(row);
  }

  var pushed = pushRowsToFirebase(rowsToSend);
  if (pushed > 0 || rowsToSend.length > 0) {
    setLastProcessedRow(data.length);
  }
  return { pushed: pushed, total: rowsToSend.length, message: 'Отправлено ' + pushed + ' из ' + rowsToSend.length };
}

/**
 * Отправить все строки листа в Firebase (при первом запуске или после сброса).
 * Сброс последней строки: в консоли выполнить setLastProcessedRow(0) или удалить свойство WEATHER_LAST_ROW.
 */
function syncWeatherToFirebaseFull() {
  PropertiesService.getScriptProperties().deleteProperty('WEATHER_LAST_ROW');
  return syncWeatherToFirebase();
}
