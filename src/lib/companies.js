/**
 * Danh sách công ty — trùng Single Option trên Lark Base (cột "Công ty").
 * Không đổi chữ / thêm khoảng trắng thừa để sync Lark không lỗi.
 */
export const COMPANIES = [
  'ECS',
  'LEONG LEE',
  'MLOG',
  'SPEC HUB',
  'SUNNY AUTO',
  'TREE MARINE',
]

/** Giá trị filter Dashboard = tất cả công ty */
export const ALL_COMPANIES = ''

/** @param {string} v */
export function normalizeCompany(v) {
  const t = String(v ?? '').trim()
  return COMPANIES.includes(t) ? t : ''
}

/** @param {string} v */
export function isValidCompany(v) {
  return normalizeCompany(v) !== ''
}

/** @param {string | undefined} recordCompany @param {string} filter */
export function matchesCompany(recordCompany, filter) {
  if (!filter) return true
  return normalizeCompany(recordCompany) === filter
}
