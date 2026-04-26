// @ts-check
// 城市数据加载与扁平化。
// CITY_CATALOG 异步从 data/cities.json 拉取；ALL_CITIES 是扁平化结果。

/**
 * @typedef {Object} City
 * @property {string} id     - 城市唯一标识 (e.g. "beijing")
 * @property {string} label  - 显示名 (e.g. "北京")
 * @property {string} tz     - IANA 时区名 (e.g. "Asia/Shanghai")
 * @property {number} lat
 * @property {number} lon
 */

/** @typedef {{ continent: string, countries: { country: string, cities: City[] }[] }} Continent */

/**
 * 异步加载城市目录。失败时渲染错误 UI 并抛出（终止模块）。
 * @returns {Promise<{ catalog: Continent[], all: City[] }>}
 */
export async function loadCities() {
  try {
    const resp = await fetch('data/cities.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    /** @type {Continent[]} */
    const catalog = await resp.json();
    const all = catalog.flatMap(c => c.countries.flatMap(n => n.cities));
    return { catalog, all };
  } catch (err) {
    console.error('[WorldTime] Failed to load data/cities.json:', err);
    document.body.innerHTML =
      '<div style="padding:40px;text-align:center;font-family:sans-serif;color:#666">' +
      '<h2>无法加载城市数据</h2>' +
      '<p>请检查 <code>data/cities.json</code> 是否存在，并通过 HTTP 服务器访问（不要直接 file://）。</p>' +
      '<p>错误：' + (err && err.message ? err.message : err) + '</p></div>';
    throw err;
  }
}

/** 默认显示的 6 个城市 ID。新装机/恢复无效数据时使用。 */
export const DEFAULT_IDS = /** @type {const} */ ([
  'beijing','amsterdam','berlin','london','newyork','sanfrancisco',
]);
