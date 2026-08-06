'use strict';

/**
 * Точка входу для Corezoid Git Call вузла.
 *
 * Формат обов'язковий: файл usercode.js в корені репозиторію,
 * що експортує ОДНУ функцію (module.exports = (data) => {...}),
 * яка приймає параметри задачі (task params, об'єкт "data") і
 * повертає (або кидає помилку) новий/змінений об'єкт data.
 *
 * Значення, яке ви повертаєте (return data), стає параметрами задачі
 * на виході з вузла. Якщо кинути помилку (throw) — задача піде у
 * службовий (error) вихід вузла Git Call, з описом помилки в
 * параметрі __conveyor_git_call_return_type_description__.
 */

const { GeoIndex, DEFAULT_GEOJSON_PATH } = require('./geoIndex');

// Завантажуємо geojson ОДИН РАЗ на рівні модуля.
// Git Call тримає контейнер "теплим" між задачами (до ~10 хв простою),
// тому повторні задачі не будуть перечитувати файл з диска.
const geoIndex = new GeoIndex(DEFAULT_GEOJSON_PATH).load();

/**
 * Валідує та парсить координати з параметрів задачі.
 * Приймає lat/lon (а також їх синоніми latitude/longitude/lng).
 * Кидає помилку, якщо параметри відсутні або некоректні.
 */
function parseCoordinates(data) {
  const latRaw = data.lat ?? data.latitude;
  const lonRaw = data.lon ?? data.lng ?? data.longitude;

  if (latRaw === undefined || latRaw === null || lonRaw === undefined || lonRaw === null) {
    throw new Error("Потрібно передати параметри задачі 'lat' та 'lon' (широта/довгота)");
  }

  const lat = Number(latRaw);
  const lon = Number(lonRaw);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    throw new Error("Параметри 'lat' та 'lon' мають бути числами");
  }
  if (lat < -90 || lat > 90) {
    throw new Error("Значення 'lat' має бути в діапазоні [-90, 90]");
  }
  if (lon < -180 || lon > 180) {
    throw new Error("Значення 'lon' має бути в діапазоні [-180, 180]");
  }

  return { lat, lon };
}

module.exports = (data) => {
  const { lat, lon } = parseCoordinates(data);

  const properties = geoIndex.findByPoint(lon, lat);

  if (!properties) {
    // Немає відповідного полігону -> кидаємо помилку.
    // Задача піде у службовий (error) вихід вузла Git Call,
    // а "нормальний" вихід просто не отримає жодних даних (порожній результат).
    throw new Error('Полігон, що містить задану точку, не знайдено');
  }

  // Додаємо знайдені поля до параметрів задачі
  data.adm2_name1 = properties.adm2_name1 ?? '';
  data.adm2_pcode = properties.adm2_pcode ?? '';

  return data;
};
