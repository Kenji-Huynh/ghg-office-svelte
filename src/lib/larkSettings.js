/** @typedef {Object} LarkBitableSettings
 * @property {string} appId
 * @property {string} appSecret
 * @property {string} baseAppToken
 * @property {string} tableOffice
 * @property {string} tableTrips
 * @property {string} tableCommute
 * @property {string} tableClose
 */

const STORAGE_KEY = 'ghg-lark-bitable'

/** @type {LarkBitableSettings} */
const defaults = {
  appId: '',
  appSecret: '',
  baseAppToken: '',
  tableOffice: '',
  tableTrips: '',
  tableCommute: '',
  tableClose: '',
}

/** Giá trị mặc định từ `.env.local` (VITE_LARK_*) — override bởi localStorage nếu đã lưu từ UI. */
function fromEnv() {
  return {
    appId: String(import.meta.env.VITE_LARK_APP_ID ?? '').trim(),
    appSecret: String(import.meta.env.VITE_LARK_APP_SECRET ?? '').trim(),
    baseAppToken: String(import.meta.env.VITE_LARK_BASE_APP_TOKEN ?? '').trim(),
    tableOffice: String(import.meta.env.VITE_LARK_TABLE_OFFICE ?? '').trim(),
    tableTrips: String(import.meta.env.VITE_LARK_TABLE_TRIPS ?? '').trim(),
    tableCommute: String(import.meta.env.VITE_LARK_TABLE_COMMUTE ?? '').trim(),
    tableClose: String(import.meta.env.VITE_LARK_TABLE_CLOSE ?? '').trim(),
  }
}

/** Ưu tiên `.env.local` (VITE_LARK_*) — tránh localStorage cũ ghi đè cấu hình đúng. */
function mergePreferEnv(stored, env) {
  return {
    appId: env.appId || stored.appId,
    appSecret: env.appSecret || stored.appSecret,
    baseAppToken: env.baseAppToken || stored.baseAppToken,
    tableOffice: env.tableOffice || stored.tableOffice,
    tableTrips: env.tableTrips || stored.tableTrips,
    tableCommute: env.tableCommute || stored.tableCommute,
    tableClose: env.tableClose || stored.tableClose,
  }
}

/** Trạng thái biến VITE_LARK_* lúc `npm run build` (Vercel: phải Redeploy sau khi thêm env). */
export function getLarkEnvBuildFlags() {
  const e = fromEnv()
  return {
    appId: !!e.appId,
    appSecret: !!e.appSecret,
    baseAppToken: !!e.baseAppToken,
    tableOffice: !!e.tableOffice,
    tableTrips: !!e.tableTrips,
    tableCommute: !!e.tableCommute,
    tableClose: !!e.tableClose,
  }
}

/** @param {string} s @param {number} [show] */
export function maskLarkValue(s, show = 4) {
  const t = String(s ?? '').trim()
  if (!t) return '(trống)'
  if (t.length <= show + 2) return '••••'
  return `${t.slice(0, show)}…${t.slice(-3)}`
}

/** @returns {LarkBitableSettings} */
export function loadLarkSettings() {
  const env = fromEnv()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaults, ...env }
    const parsed = JSON.parse(raw)
    /** @type {Record<string, unknown>} */
    const o = typeof parsed === 'object' && parsed !== null ? parsed : {}
    const stored = {
      appId: String(o.appId ?? ''),
      appSecret: String(o.appSecret ?? ''),
      baseAppToken: String(o.baseAppToken ?? ''),
      tableOffice: String(o.tableOffice ?? ''),
      tableTrips: String(o.tableTrips ?? ''),
      tableCommute: String(o.tableCommute ?? ''),
      tableClose: String(o.tableClose ?? ''),
    }
    return mergePreferEnv(stored, { ...defaults, ...env })
  } catch {
    return { ...defaults, ...env }
  }
}

/** Xóa cấu hình Lark đã lưu trên trình duyệt (dùng lại `.env.local`). */
export function clearLarkSettingsStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** @param {Partial<LarkBitableSettings>} patch */
export function saveLarkSettings(patch) {
  const next = { ...loadLarkSettings(), ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
