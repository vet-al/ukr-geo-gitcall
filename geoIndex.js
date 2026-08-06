'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;
const { point } = require('@turf/helpers');

/**
 * Модуль інкапсулює завантаження geojson-файлу з полігонами адмінодиниць
 * (adm2, тобто райони) та пошук полігону, що містить задану точку.
 *
 * Дані завантажуються один раз при старті сервера і зберігаються в пам'яті —
 * це набагато швидше, ніж читати/парсити файл на кожен запит.
 */

const DEFAULT_GEOJSON_PATH = path.join(__dirname, 'data', 'ukr_admin2_light.geojson');

class GeoIndex {
  constructor(geojsonPath = DEFAULT_GEOJSON_PATH) {
    this.geojsonPath = geojsonPath;
    this.featureCollection = null;
  }

  /**
   * Завантажує та валідує geojson-файл у пам'ять.
   * Підтримує як звичайний .geojson, так і стиснутий .geojson.gz
   * (визначається автоматично за розширенням файлу) — це дозволяє
   * тримати великі файли карт у git-репозиторії значно меншого розміру.
   * Кидає помилку, якщо файл не знайдено або він містить некоректний JSON/GeoJSON.
   */
  load() {
    const fileBuffer = fs.readFileSync(this.geojsonPath);
    const isGzipped = this.geojsonPath.endsWith('.gz');
    const raw = isGzipped ? zlib.gunzipSync(fileBuffer).toString('utf-8') : fileBuffer.toString('utf-8');

    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Файл ${this.geojsonPath} містить некоректний JSON: ${err.message}`);
    }

    if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error(`Файл ${this.geojsonPath} не є коректним GeoJSON FeatureCollection`);
    }

    // Залишаємо тільки полігональні фічі (Polygon / MultiPolygon) —
    // це те, з чим уміє працювати booleanPointInPolygon.
    const supported = data.features.filter(
      (f) => f && f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
    );

    this.featureCollection = { type: 'FeatureCollection', features: supported };
    return this;
  }

  get featureCount() {
    return this.featureCollection ? this.featureCollection.features.length : 0;
  }

  /**
   * Знаходить полігон (адмінодиницю), що містить точку.
   * @param {number} lon довгота (longitude, X)
   * @param {number} lat широта (latitude, Y)
   * @returns {object|null} властивості (properties) знайденої фічі, або null якщо не знайдено
   */
  findByPoint(lon, lat) {
    if (!this.featureCollection) {
      throw new Error('GeoIndex не завантажено. Викличте load() перед використанням.');
    }

    const pt = point([lon, lat]);

    for (const feature of this.featureCollection.features) {
      try {
        if (booleanPointInPolygon(pt, feature.geometry)) {
          return feature.properties;
        }
      } catch (err) {
        // Пропускаємо пошкоджену геометрію окремої фічі, не зупиняючи весь пошук
        continue;
      }
    }

    return null;
  }
}

module.exports = { GeoIndex, DEFAULT_GEOJSON_PATH };
