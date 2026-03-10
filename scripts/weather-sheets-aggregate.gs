/**
 * Google Apps Script: лист 1 — сырой лог (ESP/Sheets API), лист 2 — только последние 24 ч,
 * лист 3 — почасовые максимумы (укороченная база). Плюс очистка листа 1 от старых строк.
 *
 * Настройка:
 * 1. Создайте в книге три листа (имена можно задать в свойствах скрипта).
 * 2. Лист 1 — тот, куда ESP дописывает (как в weather-sheet-to-firebase.gs).
 * 3. В проекте Apps Script → Проект → Свойства скрипта (опционально):
 *    RAW_SHEET_NAME      = Sheet1          (имя листа с сырыми данными)
 *    SHEET_24H_NAME      = Sheet2      (имя листа «сырые за 24 ч» — перезаписывается)
 *    SHEET_HOURLY_NAME   = Sheet3       (имя листа почасовых максимумов)
 *    RETENTION_DAYS      = 60           (после агрегации удалять с листа 1 строки старше N дней)
 *
 * Триггеры (рекомендуется раз в час или раз в 6 ч):
 *   runWeatherSheetsPipeline — всё по порядку: почасовые → 24ч окно → очистка сырья.
 *
 * Отдельные функции:
 *   rebuildHourlyFromRaw      — только обновить лист Hourly из листа Raw
 *   rebuildLast24hFromRaw     — только перезаписать лист Last24h
 *   cleanupRawSheet           — только удалить с листа Raw строки старше RETENTION_DAYS
 */

function getProp(key, def) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return v != null && v !== '' ? v : def;
}

function getSheetByName(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Лист не найден: ' + name);
  return sh;
}

// ——— тот же разбор дат/чисел, что и в weather-sheet-to-firebase.gs ———

function parseNum(val) {
  if (val === null || val === undefined || val === '') return undefined;
  if (typeof val === 'number' && !isNaN(val)) return val;
  var s = String(val).replace(/,/, '.').replace(/\s/g, '').toLowerCase();
  if (s === 'nan' || s === 'n/a' || s === '-') return undefined;
  var n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

/** DD.MM.YYYY HH:mm:ss — как 26.01.2026 14:55:27 */
function parseDate(val) {
  if (val === null || val === undefined || val === '') return undefined;
  if (typeof val === 'number' && !isNaN(val)) {
    if (val > 1000000000000) return val;
    return new Date((val - 25569) * 86400 * 1000).getTime();
  }
  var s = String(val).trim();
  var dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmy) {
    var day = parseInt(dmy[1], 10);
    var month = parseInt(dmy[2], 10) - 1;
    var year = parseInt(dmy[3], 10);
    var hh = dmy[4] != null ? parseInt(dmy[4], 10) : 0;
    var mm = dmy[5] != null ? parseInt(dmy[5], 10) : 0;
    var ss = dmy[6] != null ? parseInt(dmy[6], 10) : 0;
    var d = new Date(year, month, day, hh, mm, ss);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  var d2 = new Date(val);
  return isNaN(d2.getTime()) ? undefined : d2.getTime();
}

function getPmReadings(cells, cols) {
  return {
    pm1: cols.iPm1 >= 0 ? parseNum(cells[cols.iPm1]) : undefined,
    pm25: cols.iPm25 >= 0 ? parseNum(cells[cols.iPm25]) : undefined,
    pm10: cols.iPm10 >= 0 ? parseNum(cells[cols.iPm10]) : undefined
  };
}

/**
 * Отсекаем типичные ошибки датчика:
 * 1) все PM одновременно равны 0;
 * 2) любое значение PM > 500.
 */
function isInvalidPmReadings(pm) {
  var list = [pm.pm1, pm.pm25, pm.pm10].filter(function(v) { return v != null; });
  if (list.length === 0) return false;
  for (var i = 0; i < list.length; i++) {
    if (list[i] > 500) return true;
  }
  return list.length === 3 && list[0] === 0 && list[1] === 0 && list[2] === 0;
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

function looksLikeDataRow(cells) {
  var c0 = cells[0];
  var c1 = cells[1];
  if (parseDate(c1)) return true;
  if (parseDate(c0)) return true;
  if (typeof c0 === 'string' && (/^\d{4}-\d{2}-\d{2}/.test(c0) || /^\d{1,2}\.\d{1,2}/.test(c0))) return true;
  if (typeof c1 === 'string' && (/^\d{4}-\d{2}-\d{2}/.test(c1) || /^\d{1,2}\.\d{1,2}/.test(c1))) return true;
  return false;
}

/** Дата в A; PM в логе ESP: индексы PM1:6, PM25:7, PM10:9. См. weather-sheet-to-firebase.gs */
function isStationLogRowFormat(cells) {
  if (!cells || cells.length < 10) return false;
  var ts = parseDate(cells[0]) || parseDate(cells[1]);
  if (!ts) return false;
  var c2 = String(cells[2] != null ? cells[2] : '').trim();
  if (!c2) return false;
  return true;
}

function getColumnIndices(headers, firstRowLooksLikeData) {
  if (firstRowLooksLikeData) {
    if (isStationLogRowFormat(headers)) {
      return { iDate: 0, iTemp: -1, iPressure: -1, iPm1: 6, iPm25: 7, iPm10: 9, iStation: -1, startRow: 0 };
    }
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

/** Читает лист Raw, возвращает { data, cols, headerRowIndex 0-based } */
function readRawSheet(ss) {
  var name = getProp('RAW_SHEET_NAME', 'Raw');
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  if (!data || data.length === 0) return { data: [], cols: null, sheet: sheet, headerRow: 0 };
  var firstRow = data[0].map(function(c) { return c != null ? String(c) : ''; });
  var noHeader = looksLikeDataRow(firstRow);
  var cols = getColumnIndices(firstRow, noHeader);
  return { data: data, cols: cols, sheet: sheet, noHeader: noHeader };
}

/** Ключ часа: начало часа в мс (локальное время скрипта) */
function hourBucket(ts) {
  var d = new Date(ts);
  d.setMinutes(0, 0, 0);
  d.setSeconds(0, 0);
  d.setMilliseconds(0);
  return d.getTime();
}

/**
 * Обновляет лист Hourly: для каждого часа — максимумы temp, pressure,
 * и по трём фракциям пыли: PM1, PM2.5, PM10 (мкг/м³), плюс count.
 */
function rebuildHourlyFromRaw() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hourlyName = getProp('SHEET_HOURLY_NAME', 'Hourly');
  var hourlySheet = ss.getSheetByName(hourlyName);
  if (!hourlySheet) hourlySheet = ss.insertSheet(hourlyName);

  var ctx = readRawSheet(ss);
  var data = ctx.data;
  var cols = ctx.cols;
  if (!cols || data.length <= cols.startRow) {
    Logger.log('Нет данных для Hourly');
    return { message: 'Нет данных' };
  }

  // Агрегаты по hourBucket (PM — три размера: pm1, pm25, pm10)
  var agg = {}; // key hourMs -> { temp_max, pressure_max, pm1_max, pm25_max, pm10_max, count }
  var startRow = cols.startRow;
  for (var i = startRow; i < data.length; i++) {
    var cells = data[i];
    var dateRaw = cols.iDate >= 0 ? (cells[cols.iDate] || cells[cols.iDate + 1]) : '';
    var ts = parseDate(dateRaw);
    if (ts == null && cols.iDate >= 0) continue;
    if (ts == null) ts = Date.now();
    var pm = getPmReadings(cells, cols);
    if (isInvalidPmReadings(pm)) continue;
    var bucket = hourBucket(ts);
    if (!agg[bucket]) {
      agg[bucket] = { temp_max: null, pressure_max: null, pm1_max: null, pm25_max: null, pm10_max: null, count: 0 };
    }
    var a = agg[bucket];
    a.count++;
    var p1 = pm.pm1;
    if (p1 != null) a.pm1_max = a.pm1_max == null ? p1 : Math.max(a.pm1_max, p1);
    if (cols.iTemp >= 0) {
      var t = parseNum(cells[cols.iTemp]);
      if (t != null) a.temp_max = a.temp_max == null ? t : Math.max(a.temp_max, t);
    }
    if (cols.iPressure >= 0) {
      var p = parseNum(cells[cols.iPressure]);
      if (p != null) a.pressure_max = a.pressure_max == null ? p : Math.max(a.pressure_max, p);
    }
    var p25 = pm.pm25;
    if (p25 != null) a.pm25_max = a.pm25_max == null ? p25 : Math.max(a.pm25_max, p25);
    var p10 = pm.pm10;
    if (p10 != null) a.pm10_max = a.pm10_max == null ? p10 : Math.max(a.pm10_max, p10);
  }

  // Существующие строки на Hourly — мерж по hour_start
  var existing = hourlySheet.getDataRange().getValues();
  // pm1_max, pm25_max, pm10_max — три размера PM (мкг/м³)
  var header = ['hour_start_ms', 'date_iso', 'temp_max', 'pressure_max', 'pm1_max', 'pm25_max', 'pm10_max', 'count'];
  var byHour = {};
  if (existing.length > 1) {
    for (var r = 1; r < existing.length; r++) {
      var hMs = existing[r][0];
      if (typeof hMs !== 'number') continue;
      var rowLen = existing[r].length;
      // Старый формат без pm1: 7 колонок; новый: 8
      if (rowLen >= 8) {
        byHour[hMs] = {
          temp_max: existing[r][2],
          pressure_max: existing[r][3],
          pm1_max: existing[r][4],
          pm25_max: existing[r][5],
          pm10_max: existing[r][6],
          count: existing[r][7]
        };
      } else {
        byHour[hMs] = {
          temp_max: existing[r][2],
          pressure_max: existing[r][3],
          pm1_max: null,
          pm25_max: existing[r][4],
          pm10_max: existing[r][5],
          count: existing[r][6]
        };
      }
    }
  }
  for (var k in agg) {
    var km = Number(k);
    if (!byHour[km]) byHour[km] = agg[k];
    else {
      var o = byHour[km];
      var n = agg[k];
      if (n.temp_max != null) o.temp_max = o.temp_max == null ? n.temp_max : Math.max(o.temp_max, n.temp_max);
      if (n.pressure_max != null) o.pressure_max = o.pressure_max == null ? n.pressure_max : Math.max(o.pressure_max, n.pressure_max);
      if (n.pm1_max != null) o.pm1_max = o.pm1_max == null ? n.pm1_max : Math.max(o.pm1_max, n.pm1_max);
      if (n.pm25_max != null) o.pm25_max = o.pm25_max == null ? n.pm25_max : Math.max(o.pm25_max, n.pm25_max);
      if (n.pm10_max != null) o.pm10_max = o.pm10_max == null ? n.pm10_max : Math.max(o.pm10_max, n.pm10_max);
      o.count = (o.count || 0) + n.count;
    }
  }

  var keys = Object.keys(byHour).map(Number).sort(function(a, b) { return a - b; });
  var out = [header];
  for (var j = 0; j < keys.length; j++) {
    var hm = keys[j];
    var row = byHour[hm];
    out.push([
      hm,
      new Date(hm).toISOString(),
      row.temp_max != null ? row.temp_max : '',
      row.pressure_max != null ? row.pressure_max : '',
      row.pm1_max != null ? row.pm1_max : '',
      row.pm25_max != null ? row.pm25_max : '',
      row.pm10_max != null ? row.pm10_max : '',
      row.count || 0
    ]);
  }
  hourlySheet.clearContents();
  if (out.length > 0) hourlySheet.getRange(1, 1, out.length, header.length).setValues(out);
  return { message: 'Hourly: ' + (out.length - 1) + ' строк' };
}

/**
 * В строке дата без времени (только DD.MM.YYYY)? Тогда окно «24 ч» по календарю: сегодня + вчера.
 */
function dateRawHasTime(dateRaw) {
  return /\d{1,2}:\d{1,2}/.test(String(dateRaw || ''));
}

function rowFitsLast24hWindow(dateRaw, fromMs, nowMs) {
  var ts = parseDate(dateRaw);
  if (ts == null) return false;
  if (dateRawHasTime(dateRaw)) return ts >= fromMs && ts <= nowMs;
  // только дата — включаем, если календарный день строки = сегодня или вчера (локальное время скрипта)
  var rowDay = new Date(ts);
  rowDay.setHours(0, 0, 0, 0);
  var today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  var yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
  var rd = rowDay.getTime();
  return rd === today.getTime() || rd === yesterday.getTime();
}

/**
 * Лист Last24h — строки за последние 24 ч по времени; если в логе только дата без часов — за сегодня и вчера.
 */
function rebuildLast24hFromRaw() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name24 = getProp('SHEET_24H_NAME', 'Last24h');
  var sheet24 = ss.getSheetByName(name24);
  if (!sheet24) sheet24 = ss.insertSheet(name24);

  var ctx = readRawSheet(ss);
  var data = ctx.data;
  var cols = ctx.cols;
  if (!cols || data.length <= cols.startRow) {
    sheet24.clearContents();
    return { message: 'Нет данных для 24h' };
  }

  var now = Date.now();
  var from = now - 24 * 3600 * 1000;
  var out = [];
  // Шапка — как в Raw, если первая строка — заголовок
  if (!ctx.noHeader && data.length > 0) out.push(data[0]);

  var startRow = cols.startRow;
  for (var i = startRow; i < data.length; i++) {
    var cells = data[i];
    var dateRaw = cols.iDate >= 0 ? (cells[cols.iDate] || cells[cols.iDate + 1]) : '';
    if (!rowFitsLast24hWindow(dateRaw, from, now)) continue;
    var pm = getPmReadings(cells, cols);
    if (isInvalidPmReadings(pm)) continue;
    out.push(data[i]);
  }

  sheet24.clearContents();
  if (out.length > 0) {
    var ncols = Math.max.apply(null, out.map(function(r) { return r.length; }));
    var padded = out.map(function(r) {
      var row = r.slice();
      while (row.length < ncols) row.push('');
      return row;
    });
    sheet24.getRange(1, 1, padded.length, ncols).setValues(padded);
  }
  return { message: 'Last24h: ' + (out.length - 1) + ' строк' };
}

/**
 * Удаляет с листа Raw строки старше RETENTION_DAYS (данные уже должны быть в Hourly).
 * Удаляет пачками сверху, пока дата в строке 2 (первая data) < cutoff.
 */
function cleanupRawSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = getProp('RAW_SHEET_NAME', 'Raw');
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.getSheets()[0];

  var retention = parseInt(getProp('RETENTION_DAYS', '7'), 10);
  if (isNaN(retention) || retention < 1) retention = 7;
  var cutoff = Date.now() - retention * 24 * 3600 * 1000;

  // Найти первую строку данных, которую оставляем (дата >= cutoff)
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { deleted: 0, message: 'Не что чистить' };
  var lastCol = sheet.getLastColumn();
  var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var firstRow = data[0].map(function(c) { return c != null ? String(c) : ''; });
  var noHeader = looksLikeDataRow(firstRow);
  var cols = getColumnIndices(firstRow, noHeader);
  var firstDataRow1Based = cols.startRow + 1;
  var firstKept = 0;
  for (var i = cols.startRow; i < data.length; i++) {
    var cells = data[i];
    var dateRaw = cols.iDate >= 0 ? (cells[cols.iDate] || cells[cols.iDate + 1]) : '';
    var ts = parseDate(dateRaw);
    if (ts != null && ts >= cutoff) {
      firstKept = i + 1;
      break;
    }
  }
  if (firstKept === 0) return { deleted: 0, message: 'Нет строк с датой >= cutoff' };
  // С заголовком: строка 1 — шапка, данные с 2. Без шапки — данные с 1.
  var deleteFrom = noHeader ? 1 : 2;
  var deleteCount = noHeader ? (firstKept - 1) : (firstKept - 2);
  if (deleteCount <= 0) return { deleted: 0, message: 'Нечего удалять' };
  sheet.deleteRows(deleteFrom, deleteCount);
  return { deleted: deleteCount, message: 'Удалено строк: ' + deleteCount };
}

/**
 * Только заполнение Sheet2 (Last24h) и Sheet3 (Hourly) без очистки Sheet1.
 * Вызывай вручную или с меню — чтобы сразу появились данные.
 */
function runWeatherSheetsFillOnly() {
  var a = rebuildHourlyFromRaw();
  var b = rebuildLast24hFromRaw();
  var fb = { message: '' };
  try {
    if (typeof syncWeatherToFirebaseFromRawSheet === 'function') {
      fb = syncWeatherToFirebaseFromRawSheet();
    }
  } catch (e) {
    fb = { message: 'Firebase: ' + (e && e.message ? e.message : 'skip') };
  }
  var msg = a.message + ' · ' + b.message + (fb.message ? ' · ' + (fb.message || fb) : '');
  Logger.log(msg);
  SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Метео: листы + база', 10);
  return { hourly: a, last24: b, firebase: fb };
}

/**
 * Полный цикл: сначала Hourly (чтобы не потерять историю), потом Last24h, потом очистка Raw.
 */
function runWeatherSheetsPipeline() {
  var a = rebuildHourlyFromRaw();
  var b = rebuildLast24hFromRaw();
  var c = cleanupRawSheet();
  var fb = {};
  try {
    if (typeof syncWeatherToFirebaseFromRawSheet === 'function') fb = syncWeatherToFirebaseFromRawSheet();
  } catch (e) {}
  var msg = a.message + ' · ' + b.message + ' · ' + c.message + (fb.message ? ' · ' + fb.message : '');
  Logger.log(msg);
  SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Метео: полный цикл', 12);
  return { hourly: a, last24: b, cleanup: c, firebase: fb };
}

/**
 * Меню при открытии таблицы — запуск без API, сразу из книги.
 * После вставки скрипта: обнови страницу таблицы (F5), появится меню «Метео».
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Метео')
    .addItem('Заполнить Sheet2 и Sheet3 сейчас', 'runWeatherSheetsFillOnly')
    .addItem('Полный цикл (+ очистка Sheet1 по RETENTION_DAYS)', 'runWeatherSheetsPipeline')
    .addToUi();
}

/**
 * «API» через Web App: один раз задеплой Deploy → New deployment → Web app.
 * Execute as: Me. Who has access: Anyone (или Anyone with Google account).
 * В свойствах скрипта: WEBAPP_SECRET = длинная_случайная_строка
 * URL: .../exec?key=WEBAPP_SECRET — открываешь в браузере или curl → листы 2 и 3 заполняются.
 * Без правильного key — ничего не выполняется.
 */
function doGet(e) {
  var secret = PropertiesService.getScriptProperties().getProperty('WEBAPP_SECRET');
  if (!secret || !e || !e.parameter || e.parameter.key !== secret) {
    return ContentService.createTextOutput('forbidden').setMimeType(ContentService.MimeType.TEXT);
  }
  var r = runWeatherSheetsFillOnly();
  var msg = (r.hourly && r.hourly.message) + ' | ' + (r.last24 && r.last24.message) + (r.firebase && r.firebase.message ? ' | ' + r.firebase.message : '');
  return ContentService.createTextOutput('ok: ' + msg).setMimeType(ContentService.MimeType.TEXT);
}
