/**
 * Lỗi Lark có chi tiết — hiển thị trong modal / console (F12).
 */

/** @typedef {{
 *   step?: string
 *   url?: string
 *   method?: string
 *   httpStatus?: number
 *   larkCode?: number | string
 *   larkMsg?: string
 *   tableId?: string
 *   apiPrefix?: string
 *   responseSnippet?: string
 *   original?: string
 *   at?: string
 *   sentFields?: string[]
 *   missingOnBase?: string[]
 *   fieldsOnBase?: string[]
 * }} LarkErrorDetails */

/** @type {LarkErrorDetails | null} */
let lastLarkErrorDetails = null

export function getLastLarkErrorDetails() {
  return lastLarkErrorDetails
}

export class LarkApiError extends Error {
  /** @param {string} message @param {LarkErrorDetails} [details] */
  constructor(message, details = {}) {
    super(message)
    this.name = 'LarkApiError'
    /** @type {LarkErrorDetails} */
    this.details = { at: new Date().toISOString(), ...details }
    lastLarkErrorDetails = this.details
    console.error('[Lark sync]', message, this.details)
  }
}

/** @param {string} path @param {string} [method] */
export function inferLarkStep(path, method = 'GET') {
  if (path.includes('tenant_access_token')) return 'Lấy token (App ID / Secret)'
  if (path.includes('batch_create')) return `Ghi bảng (${method})`
  if (path.includes('/records')) return 'Đọc bảng hiện có (chống trùng)'
  return 'Gọi Lark Open API'
}

/** @param {unknown} text @param {number} [max] */
function snippet(text, max = 480) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return s.length <= max ? s : `${s.slice(0, max)}…`
}

/** @param {string} message @param {LarkErrorDetails} details */
export function throwLarkError(message, details) {
  throw new LarkApiError(message, details)
}

/** @param {unknown} err @param {string} url @param {LarkErrorDetails} extra */
export function throwLarkNetworkError(err, url, extra = {}) {
  const original = err instanceof Error ? err.message : String(err)
  const msg = /failed to fetch/i.test(original)
    ? 'Không kết nối được máy chủ proxy Lark (Failed to fetch)'
    : original
  throw new LarkApiError(msg, { ...extra, url, original, step: extra.step || 'Kết nối mạng' })
}

/** @param {LarkApiError | Error} err */
export function isLarkApiError(err) {
  return err instanceof LarkApiError
}

/** @param {unknown} err */
export function formatLarkErrorReport(err) {
  const e = err instanceof Error ? err : new Error(String(err))
  const d = isLarkApiError(err) ? err.details : lastLarkErrorDetails
  const lines = [`■ ${e.message}`]
  if (d) {
    if (d.step) lines.push(`Bước: ${d.step}`)
    if (d.apiPrefix) lines.push(`API prefix: ${d.apiPrefix}`)
    if (d.method && d.url) lines.push(`${d.method} ${d.url}`)
    else if (d.url) lines.push(`URL: ${d.url}`)
    if (d.httpStatus != null) lines.push(`HTTP: ${d.httpStatus}`)
    if (d.larkCode != null) lines.push(`Mã Lark (code): ${d.larkCode}`)
    if (d.larkMsg) lines.push(`Lark msg: ${d.larkMsg}`)
    if (d.tableId) lines.push(`Table ID: ${d.tableId}`)
    if (d.missingOnBase?.length) {
      lines.push(`Cột app gửi nhưng Base THIẾU / sai tên (${d.missingOnBase.length}):`)
      for (const name of d.missingOnBase) lines.push(`  • ${name}`)
    }
    if (d.sentFields?.length) lines.push(`App đang gửi: ${d.sentFields.join(' | ')}`)
    if (d.fieldsOnBase?.length) lines.push(`Base hiện có: ${d.fieldsOnBase.join(' | ')}`)
    if (d.original && d.original !== e.message) lines.push(`Lỗi gốc: ${d.original}`)
    if (d.responseSnippet) lines.push(`Phản hồi: ${d.responseSnippet}`)
    if (d.at) lines.push(`Thời điểm: ${d.at}`)
  }
  lines.push('', 'Mở F12 → Console để xem object đầy đủ.')
  return lines.join('\n')
}

/** @param {string} s */
function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** @param {unknown} err */
export function larkErrorHtml(err) {
  const report = formatLarkErrorReport(err)
  return `<pre class="lark-error-pre">${esc(report)}</pre>`
}
