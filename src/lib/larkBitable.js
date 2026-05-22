/**
 * Lark Base (Bitable) — đẩy dữ liệu kỳ hiện tại.
 *
 * Tên cột phải trùng đúng **tiêu đề** trong Base (tiếng Việt). Không gửi cột **ID** (Lark/Base tự quản).
 * Khi test toàn bộ cột dạng Text: mọi giá trị được chuyển sang chuỗi.
 *
 * Dev: proxy `/lark-open-api` (vite.config.js). Production: `VITE_LARK_API_BASE`.
 */

import { get } from 'svelte/store'
import {
  equipRows,
  empTrips,
  commuteList,
  isEquipInReport,
  currentMonth,
  currentYear,
  periodLabel,
} from './ghg.js'
import { migrateTripTransports, formatHotelStaysDetail } from './calculations.js'
import { COMPANIES, normalizeCompany } from './companies.js'
import { snapshotTotalsForCompany } from './snapshots.js'
import { LarkApiError, inferLarkStep, throwLarkError } from './larkError.js'

/** Tên cột — Văn phòng (Scope 1 & 2) — trùng Base */
/** Cột kỳ — thêm vào 3 bảng Lark (Text), vd. Tháng 6 - 2026 (khớp «Kỳ đang làm» trên web) */
export const LARK_COL_PERIOD = 'Kỳ báo cáo'

export const LARK_COL_OFFICE = {
  Ky: LARK_COL_PERIOD,
  CongTy: 'Công ty',
  ThietBi: 'Thiết bị',
  NguonPhatThai: 'Nguồn phát thải',
  Scope: 'Scope',
  DonVi: 'Đơn vị',
  KhoiLuong: 'Khối lượng',
  Ef: 'EF (kg CO₂e/đvị)',
  EfRef: 'EF Reference',
  TongGhg: 'Tổng GHG (tấn CO₂e)',
}

/** Tên cột — Nhân viên (Scope 3) */
export const LARK_COL_TRIP = {
  Ky: LARK_COL_PERIOD,
  CongTy: 'Công ty',
  HoTen: 'Họ và tên',
  MaNv: 'Mã NV',
  PhongBan: 'Phòng ban',
  TenChuyen: 'Tên chuyến',
  MucDich: 'Mục đích',
  XuatPhat: 'Điểm xuất phát',
  Den: 'Điểm đến',
  NgayDi: 'Ngày đi',
  NgayVe: 'Ngày về',
  Co2Bay: 'CO₂ bay (kg)',
  Co2MatDat: 'CO₂ mặt đất (kg)',
  Co2LuuTru: 'CO₂ lưu trú (kg)',
  Tong: 'Tổng (kg CO₂e)',
  PhuongTienChiTiet: 'Phương tiện chi tiết',
  LuuTruChiTiet: 'Lưu trú chi tiết',
}

/** Tên cột — Đi làm hằng ngày */
export const LARK_COL_COMMUTE = {
  Ky: LARK_COL_PERIOD,
  CongTy: 'Công ty',
  HoTen: 'Họ và tên',
  MaNv: 'Mã NV',
  PhongBan: 'Phòng ban',
  PhuongTien: 'Phương tiện',
  KmMotChieu: 'Km một chiều',
  NgayDiLamThang: 'Ngày đi làm / Tháng',
  Wfh: 'WFH (ngày/tháng)',
  Carpool: 'Carpool (người)',
  Co2e: 'CO₂e (kg)',
}

/** Bảng tổng hợp đóng kỳ (snapshot) */
export const LARK_COL_CLOSE = {
  Ky: 'Kỳ',
  Loai: 'Loại',
  CongTy: 'Công ty',
  Scope1: 'Scope 1 (tấn)',
  Scope2: 'Scope 2 (tấn)',
  Scope3: 'Scope 3 (tấn)',
  Tong: 'Tổng (tấn)',
  NgayDong: 'Ngày đóng kỳ',
  SoVanPhong: 'Số dòng văn phòng',
  SoChuyen: 'Số chuyến CT',
  SoDiLam: 'Số dòng đi làm',
}

/** @param {unknown} v */
function asText(v) {
  if (v == null || v === '') return ''
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return ''
    return String(v)
  }
  return String(v)
}

/** @param {Record<string, unknown>} fields @returns {Record<string, string>} */
function fieldsAllText(fields) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const [k, v] of Object.entries(fields)) {
    out[k] = asText(v)
  }
  return out
}

/** @param {unknown[]} arr @param {number} size */
function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** @param {unknown} v */
function norm(v) {
  return String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** @param {Record<string, unknown>} f */
/** @param {Record<string, unknown>} trip */
function formatTripTransportDetail(trip) {
  const segs = migrateTripTransports(trip)
  if (!segs.length) return ''
  return segs
    .map((s) => {
      const n = Math.max(1, Number(s.count) || 1)
      const parts = [s.note || s.type]
      if (s.liters) parts.push(`${s.liters}L`)
      if (s.km) parts.push(`${s.km}km`)
      return `${parts.join(' ')}×${n}`
    })
    .join('; ')
}

function officeSig(f) {
  return [
    norm(f[C.Ky]),
    norm(f[C.CongTy]),
    norm(f[C.ThietBi]),
    norm(f[C.NguonPhatThai]),
    norm(f[C.Scope]),
    norm(f[C.DonVi]),
    norm(f[C.KhoiLuong]),
    norm(f[C.Ef]),
    norm(f[C.EfRef]),
    norm(f[C.TongGhg]),
  ].join('|')
}

/** @param {Record<string, unknown>} f */
function tripSig(f) {
  return [
    norm(f[T.Ky]),
    norm(f[T.CongTy]),
    norm(f[T.MaNv]),
    norm(f[T.TenChuyen]),
    norm(f[T.NgayDi]),
    norm(f[T.NgayVe]),
    norm(f[T.XuatPhat]),
    norm(f[T.Den]),
    norm(f[T.Tong]),
  ].join('|')
}

/** @param {Record<string, unknown>} f */
function commuteSig(f) {
  return [
    norm(f[M.Ky]),
    norm(f[M.CongTy]),
    norm(f[M.MaNv]),
    norm(f[M.PhuongTien]),
    norm(f[M.KmMotChieu]),
    norm(f[M.NgayDiLamThang]),
    norm(f[M.Wfh]),
  ].join('|')
}

/** @param {unknown[]} equip @param {unknown[]} trips @param {unknown[]} commute @param {string} periodText */
function buildLarkRecordsFromRows(equip, trips, commute, periodText) {
  const ky = periodText || ''
  const officeRows = equip.filter(isEquipInReport)
  const officeFields = officeRows.map((r) => {
    const tot = r.volume && r.ef ? (r.volume * r.ef) / 1000 : 0
    return fieldsAllText({
      [C.Ky]: ky,
      [C.CongTy]: normalizeCompany(r.company) || '',
      [C.ThietBi]: r.equipment || '',
      [C.NguonPhatThai]: r.source || '',
      [C.Scope]: r.scope ?? '',
      [C.DonVi]: r.unit || '',
      [C.KhoiLuong]: r.volume ?? '',
      [C.Ef]: r.ef ?? '',
      [C.EfRef]: r.efRef || '',
      [C.TongGhg]: tot,
    })
  })

  const tripRows = trips.map((trip) =>
    fieldsAllText({
      [T.Ky]: ky,
      [T.CongTy]: normalizeCompany(trip.company) || '',
      [T.HoTen]: trip.name || '',
      [T.MaNv]: trip.empId || '',
      [T.PhongBan]: trip.dept || '',
      [T.TenChuyen]: trip.trip || '',
      [T.MucDich]: trip.purpose || '',
      [T.XuatPhat]: trip.from || '',
      [T.Den]: trip.to || '',
      [T.NgayDi]: trip.dateFrom || '',
      [T.NgayVe]: trip.dateTo || '',
      [T.Co2Bay]: trip.co2Air ?? '',
      [T.Co2MatDat]: trip.co2Ground ?? '',
      [T.Co2LuuTru]: trip.co2Hotel ?? '',
      [T.Tong]: trip.co2Total ?? '',
      [T.PhuongTienChiTiet]: formatTripTransportDetail(trip),
      [T.LuuTruChiTiet]: formatHotelStaysDetail(trip),
    }),
  )

  const commuteRows = commute.map((c) =>
    fieldsAllText({
      [M.Ky]: ky,
      [M.CongTy]: normalizeCompany(c.company) || '',
      [M.HoTen]: c.name || '',
      [M.MaNv]: c.empId || '',
      [M.PhongBan]: c.dept || '',
      [M.PhuongTien]: c.vehicle || '',
      [M.KmMotChieu]: c.km ?? '',
      [M.NgayDiLamThang]: c.days ?? '',
      [M.Wfh]: c.wfh ?? '',
      [M.Carpool]: c.carpool ?? '',
      [M.Co2e]: c.co2 ?? '',
    }),
  )

  return { officeFields, tripRows, commuteRows }
}

/** Trình duyệt đang chạy local / tunnel (không phải Vercel production). */
function isLocalBrowserHost() {
  if (typeof window === 'undefined') return import.meta.env.DEV
  const h = window.location.hostname
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.endsWith('.trycloudflare.com') ||
    import.meta.env.DEV
  )
}

/** Base URL: dev/tunnel = proxy Vite; production (Vercel) = /api/lark */
export function larkOpenApiPrefix() {
  const v = import.meta.env.VITE_LARK_API_BASE
  const custom = v != null ? String(v).trim().replace(/\/$/, '') : ''
  if (custom.startsWith('http://') || custom.startsWith('https://')) {
    return custom
  }
  // Không dùng /lark-open-api trên Vercel (chỉ khi npm run dev / preview / tunnel)
  if (custom && custom !== '/lark-open-api') return custom
  if (isLocalBrowserHost()) return '/lark-open-api'
  return '/api/lark'
}

/** @param {unknown} err @param {string} url @param {string} [path] */
function wrapLarkNetworkError(err, url, path = '') {
  const original = err instanceof Error ? err.message : String(err)
  const prefix = larkOpenApiPrefix()
  const step = inferLarkStep(path)

  if (!/failed to fetch/i.test(original)) {
    throw new LarkApiError(original, { step, url, apiPrefix: prefix, original })
  }

  let message = `Không kết nối proxy Lark — Failed to fetch`
  if (/content.decoding|ERR_CONTENT_DECODING/i.test(original)) {
    message =
      'Lỗi giải nén phản hồi (Content-Encoding). Khởi động lại npm run dev — đã sửa proxy; nếu Vercel: redeploy.'
  } else if (prefix.startsWith('http')) {
    message =
      'Không gọi được Lark (CORS). Trên Vercel xóa VITE_LARK_API_BASE trỏ thẳng open.larksuite.com — dùng /api/lark.'
  } else if (import.meta.env.DEV) {
    message = `Không kết nối proxy Lark. Giữ "npm run dev" chạy; F5. Tunnel: npm run tunnel + dev.`
  } else if (isLocalBrowserHost()) {
    message = 'Không kết nối proxy. Chạy npm run dev — không mở file HTML trực tiếp.'
  } else {
    message = 'Không kết nối /api/lark. Redeploy Vercel; xóa VITE_LARK_API_BASE=/lark-open-api trên Vercel.'
  }
  throw new LarkApiError(message, { step, url, apiPrefix: prefix, original })
}

/**
 * @param {string} path e.g. /open-apis/auth/...
 * @param {RequestInit} [init]
 * @param {string} [prefixOverride]
 */
async function larkFetch(path, init = {}, prefixOverride) {
  const prefix = prefixOverride ?? larkOpenApiPrefix()
  const url = path.startsWith('http') ? path : `${prefix}${path}`
  const method = init.method || 'GET'
  const step = inferLarkStep(path, method)
  let res
  try {
    res = await fetch(url, init)
  } catch (err) {
    wrapLarkNetworkError(err, url, path)
  }
  const text = await res.text()
  /** @type {Record<string, unknown>} */
  let json = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = {}
  }

  const larkCode = json.code
  const larkMsg = typeof json.msg === 'string' ? json.msg : ''
  const responseSnippet = text.trim().slice(0, 480)

  if (!res.ok) {
    const looksLikeSpaHtml =
      res.status === 404 &&
      (text.trimStart().startsWith('<!') || /<!DOCTYPE/i.test(text) || text.includes('<html'))
    if (looksLikeSpaHtml && prefix.startsWith('/')) {
      throwLarkError(
        'HTTP 404 — /api/lark trả về trang HTML (SPA). Redeploy Vercel + vercel.json; xóa VITE_LARK_API_BASE=/lark-open-api.',
        {
          step,
          url,
          method,
          httpStatus: res.status,
          apiPrefix: prefix,
          responseSnippet,
        },
      )
    }
    if (res.status === 404 && prefix.startsWith('/')) {
      throwLarkError(`HTTP 404 — không tìm thấy route Lark: ${url}`, {
        step,
        url,
        method,
        httpStatus: 404,
        apiPrefix: prefix,
        larkCode,
        larkMsg,
        responseSnippet,
      })
    }
    const title = larkMsg ? `HTTP ${res.status}: ${larkMsg}` : `HTTP ${res.status}`
    throwLarkError(title, {
      step,
      url,
      method,
      httpStatus: res.status,
      apiPrefix: prefix,
      larkCode,
      larkMsg,
      responseSnippet,
    })
  }

  return { res, json, url, step, method, apiPrefix: prefix }
}

/**
 * @param {string} prefix
 * @param {string} appId
 * @param {string} appSecret
 */
export async function fetchTenantAccessToken(prefix, appId, appSecret) {
  const path = '/open-apis/auth/v3/tenant_access_token/internal'
  const { json, url, step, method, apiPrefix } = await larkFetch(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    },
    prefix,
  )
  if (json.code !== 0) {
    throwLarkError(String(json.msg || `Lark từ chối token (code ${json.code})`), {
      step,
      url,
      method,
      apiPrefix,
      larkCode: json.code,
      larkMsg: String(json.msg || ''),
    })
  }
  const token = json.tenant_access_token
  if (!token) {
    throwLarkError('Không nhận được tenant_access_token — kiểm tra App ID / Secret trên Lark Open Platform', {
      step,
      url,
      method,
      apiPrefix,
      larkCode: json.code,
    })
  }
  return /** @type {string} */ (token)
}

/**
 * @param {string} prefix
 * @param {string} token
 * @param {string} baseAppToken
 * @param {string} tableId
 */
async function fetchLarkTableFieldNames(prefix, token, baseAppToken, tableId) {
  /** @type {string[]} */
  const names = []
  let pageToken = ''
  for (let i = 0; i < 50; i++) {
    const qs = new URLSearchParams({ page_size: '100' })
    if (pageToken) qs.set('page_token', pageToken)
    const path = `/open-apis/bitable/v1/apps/${encodeURIComponent(baseAppToken)}/tables/${encodeURIComponent(tableId)}/fields?${qs.toString()}`
    const { json } = await larkFetch(
      path,
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      prefix,
    )
    if (json.code !== 0) break
    const items = Array.isArray(json.data?.items) ? json.data.items : []
    for (const item of items) {
      const n = item?.field_name
      if (n != null && String(n).trim()) names.push(String(n).trim())
    }
    if (!json.data?.has_more) break
    pageToken = String(json.data?.page_token || '')
    if (!pageToken) break
  }
  return names
}

/** Tên cột kỳ trên Base (ưu tiên đúng tên app, rồi alias cũ) */
const PERIOD_FIELD_ALIASES = [LARK_COL_PERIOD, 'Kỳ', 'Kỳ (mã)']

/** @param {string[]} onBase */
function periodColumnOnBase(onBase) {
  return PERIOD_FIELD_ALIASES.find((a) => onBase.includes(a)) ?? null
}

/**
 * Chỉ giữ cột tồn tại trên Base. «Kỳ báo cáo» tùy chọn — không có cột kỳ thì bỏ qua.
 * @param {Record<string, string>} row
 * @param {string[]} onBase
 */
function alignRowToBaseColumns(row, onBase) {
  const allowed = new Set(onBase)
  const periodCol = periodColumnOnBase(onBase)
  /** @type {Record<string, string>} */
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    if (k === LARK_COL_PERIOD) {
      if (periodCol) out[periodCol] = v
      continue
    }
    if (allowed.has(k)) out[k] = v
  }
  return out
}

/** @param {Record<string, string>[]} rows @param {string[]} onBase */
function filterRecordsForBase(rows, onBase) {
  const omitted = new Set()
  const filtered = rows
    .map((row) => {
      const aligned = alignRowToBaseColumns(row, onBase)
      for (const k of Object.keys(row)) {
        if (!(k in aligned)) omitted.add(k)
      }
      return aligned
    })
    .filter((r) => Object.keys(r).length > 0)
  return { filtered, omitted: [...omitted] }
}

/** @param {string[]} sent @param {string[]} onBase */
function fieldNamesMissingOnBase(sent, onBase) {
  const set = new Set(onBase)
  return sent.filter((k) => {
    if (k === LARK_COL_PERIOD && periodColumnOnBase(onBase)) return false
    return !set.has(k)
  })
}

/**
 * @param {string} prefix
 * @param {string} token
 * @param {string} baseAppToken
 * @param {string} tableId
 * @param {Record<string, string>[]} fieldsList
 */
async function batchCreateRecords(prefix, token, baseAppToken, tableId, fieldsList) {
  if (!tableId || fieldsList.length === 0) return 0
  const onBase = await fetchLarkTableFieldNames(prefix, token, baseAppToken, tableId)
  const { filtered: alignedList, omitted } = filterRecordsForBase(fieldsList, onBase)
  if (omitted.length) {
    console.info(`[Lark] Bảng ${tableId} — bỏ cột không có trên Base:`, omitted.join(', '))
  }
  if (alignedList.length === 0) {
    throwLarkError('Không còn cột nào khớp Base để ghi — kiểm tra tên cột trên Lark.', {
      step: 'Ghi bảng',
      tableId,
      sentFields: fieldsList[0] ? Object.keys(fieldsList[0]) : [],
      fieldsOnBase: onBase,
      missingOnBase: fieldNamesMissingOnBase(
        fieldsList[0] ? Object.keys(fieldsList[0]) : [],
        onBase,
      ),
    })
  }
  const path = `/open-apis/bitable/v1/apps/${encodeURIComponent(baseAppToken)}/tables/${encodeURIComponent(tableId)}/records/batch_create`
  let total = 0
  for (const part of chunk(alignedList, 80)) {
    const body = { records: part.map((fields) => ({ fields })) }
    const { json, url, step, method, apiPrefix } = await larkFetch(
      path,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(body),
      },
      prefix,
    )
    if (json.code !== 0) {
      const larkMsg = String(json.msg || '')
      const isFieldName =
        json.code === 1254045 || /fieldnamenotfound/i.test(larkMsg)
      /** @type {string[]} */
      const sentFields = part[0] ? Object.keys(part[0]) : []
      let missingOnBase = []
      let fieldsOnBase = []
      if (isFieldName && sentFields.length) {
        fieldsOnBase = await fetchLarkTableFieldNames(prefix, token, baseAppToken, tableId)
        missingOnBase = fieldNamesMissingOnBase(sentFields, fieldsOnBase)
      }
      const title = missingOnBase.length
        ? `FieldNameNotFound — thiếu/sai tên cột: ${missingOnBase.join(', ')}`
        : larkMsg || `Lark batch_create code ${json.code}`
      throwLarkError(title, {
        step,
        url,
        method,
        apiPrefix,
        tableId,
        larkCode: json.code,
        larkMsg,
        sentFields,
        missingOnBase,
        fieldsOnBase,
      })
    }
    const rec = json.data?.records
    total += Array.isArray(rec) ? rec.length : part.length
  }
  return total
}

/**
 * Đọc toàn bộ records hiện có để chống trùng trước khi ghi.
 * @param {string} prefix
 * @param {string} token
 * @param {string} baseAppToken
 * @param {string} tableId
 * @param {(fields: Record<string, unknown>) => string} signatureFn
 */
async function fetchExistingSignatures(prefix, token, baseAppToken, tableId, signatureFn) {
  if (!tableId) return new Set()
  const all = new Set()
  let pageToken = ''
  for (let i = 0; i < 100; i++) {
    const base = `/open-apis/bitable/v1/apps/${encodeURIComponent(baseAppToken)}/tables/${encodeURIComponent(tableId)}/records`
    const qs = new URLSearchParams()
    qs.set('page_size', '500')
    if (pageToken) qs.set('page_token', pageToken)
    const path = `${base}?${qs.toString()}`
    const { json, url, step, method, apiPrefix } = await larkFetch(
      path,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      prefix,
    )
    if (json.code !== 0) {
      throwLarkError(String(json.msg || `Lark đọc bảng code ${json.code}`), {
        step,
        url,
        method,
        apiPrefix,
        tableId,
        larkCode: json.code,
        larkMsg: String(json.msg || ''),
      })
    }
    const items = Array.isArray(json.data?.items) ? json.data.items : []
    for (const item of items) {
      const fields = /** @type {Record<string, unknown>} */ (item?.fields || {})
      all.add(signatureFn(fields))
    }
    if (!json.data?.has_more) break
    pageToken = String(json.data?.page_token || '')
    if (!pageToken) break
  }
  return all
}

const C = LARK_COL_OFFICE
const T = LARK_COL_TRIP
const M = LARK_COL_COMMUTE

/**
 * Dữ liệu kỳ hiện tại định dạng trường Lark Base (text), trước khi gọi API.
 * @returns {{ officeFields: Record<string, string>[], tripRows: Record<string, string>[], commuteRows: Record<string, string>[] }}
 */
export function buildLarkPeriodRecords() {
  const label = periodLabel(get(currentMonth), get(currentYear))
  return buildLarkRecordsFromRows(get(equipRows), get(empTrips), get(commuteList), label)
}

/**
 * Đồng bộ kỳ hiện tại: thêm bản ghi vào 3 bảng (không gửi ID; không bảng tổng quan).
 * @param {import('./larkSettings.js').LarkBitableSettings} s
 * @returns {Promise<{ office: number, trips: number, commute: number, skippedOffice: number, skippedTrips: number, skippedCommute: number }>}
 */
export async function syncCurrentPeriodToLark(s) {
  const prefix = larkOpenApiPrefix()
  const token = await fetchTenantAccessToken(prefix, s.appId.trim(), s.appSecret.trim())
  const appToken = s.baseAppToken.trim()
  const tOffice = s.tableOffice.trim()
  const tTrips = s.tableTrips.trim()
  const tCommute = s.tableCommute.trim()

  const { officeFields, tripRows, commuteRows } = buildLarkPeriodRecords()

  const existingOffice = await fetchExistingSignatures(prefix, token, appToken, tOffice, officeSig)
  const existingTrips = await fetchExistingSignatures(prefix, token, appToken, tTrips, tripSig)
  const existingCommute = await fetchExistingSignatures(prefix, token, appToken, tCommute, commuteSig)

  let skippedOffice = 0
  let skippedTrips = 0
  let skippedCommute = 0
  const seenOffice = new Set(existingOffice)
  const seenTrips = new Set(existingTrips)
  const seenCommute = new Set(existingCommute)

  const officeToCreate = officeFields.filter((f) => {
    const sig = officeSig(f)
    if (seenOffice.has(sig)) {
      skippedOffice++
      return false
    }
    seenOffice.add(sig)
    return true
  })
  const tripsToCreate = tripRows.filter((f) => {
    const sig = tripSig(f)
    if (seenTrips.has(sig)) {
      skippedTrips++
      return false
    }
    seenTrips.add(sig)
    return true
  })
  const commuteToCreate = commuteRows.filter((f) => {
    const sig = commuteSig(f)
    if (seenCommute.has(sig)) {
      skippedCommute++
      return false
    }
    seenCommute.add(sig)
    return true
  })

  const office = await batchCreateRecords(prefix, token, appToken, tOffice, officeToCreate)
  const trips = await batchCreateRecords(prefix, token, appToken, tTrips, tripsToCreate)
  const commute = await batchCreateRecords(prefix, token, appToken, tCommute, commuteToCreate)

  return { office, trips, commute, skippedOffice, skippedTrips, skippedCommute }
}

const CL = LARK_COL_CLOSE

/** @param {import('./snapshots.js').PeriodSnapshot} snap @param {import('./larkSettings.js').LarkBitableSettings} s */
export async function syncSnapshotToLark(snap, s) {
  const prefix = larkOpenApiPrefix()
  const token = await fetchTenantAccessToken(prefix, s.appId.trim(), s.appSecret.trim())
  const appToken = s.baseAppToken.trim()
  const tOffice = s.tableOffice.trim()
  const tTrips = s.tableTrips.trim()
  const tCommute = s.tableCommute.trim()
  const tClose = String(s.tableClose || import.meta.env.VITE_LARK_TABLE_CLOSE || '').trim()

  const { officeFields, tripRows, commuteRows } = buildLarkRecordsFromRows(
    snap.equip,
    snap.emptrips,
    snap.commute,
    snap.label,
  )

  const existingOffice = await fetchExistingSignatures(prefix, token, appToken, tOffice, officeSig)
  const existingTrips = await fetchExistingSignatures(prefix, token, appToken, tTrips, tripSig)
  const existingCommute = await fetchExistingSignatures(prefix, token, appToken, tCommute, commuteSig)
  let skippedOffice = 0
  let skippedTrips = 0
  let skippedCommute = 0
  const seenOffice = new Set(existingOffice)
  const seenTrips = new Set(existingTrips)
  const seenCommute = new Set(existingCommute)
  const officeToCreate = officeFields.filter((f) => {
    const sig = officeSig(f)
    if (seenOffice.has(sig)) {
      skippedOffice++
      return false
    }
    seenOffice.add(sig)
    return true
  })
  const tripsToCreate = tripRows.filter((f) => {
    const sig = tripSig(f)
    if (seenTrips.has(sig)) {
      skippedTrips++
      return false
    }
    seenTrips.add(sig)
    return true
  })
  const commuteToCreate = commuteRows.filter((f) => {
    const sig = commuteSig(f)
    if (seenCommute.has(sig)) {
      skippedCommute++
      return false
    }
    seenCommute.add(sig)
    return true
  })
  const office = await batchCreateRecords(prefix, token, appToken, tOffice, officeToCreate)
  const trips = await batchCreateRecords(prefix, token, appToken, tTrips, tripsToCreate)
  const commute = await batchCreateRecords(prefix, token, appToken, tCommute, commuteToCreate)

  let closeRows = 0
  if (tClose) {
    const summaryFields = []
    const companies = ['', ...COMPANIES]
    for (const co of companies) {
      const t = snapshotTotalsForCompany(snap, co)
      const rep = snap.equip.filter(
        (/** @type {{ company?: string, confirmed?: boolean }} */ r) =>
          isEquipInReport(r) && (!co || r.company === co),
      )
      summaryFields.push(
        fieldsAllText({
          [CL.Ky]: snap.label,
          [CL.Loai]: snap.type === 'year' ? 'Năm' : 'Tháng',
          [CL.CongTy]: co || 'Tất cả',
          [CL.Scope1]: t.s1.toFixed(4),
          [CL.Scope2]: t.s2.toFixed(4),
          [CL.Scope3]: t.s3.toFixed(4),
          [CL.Tong]: t.total.toFixed(4),
          [CL.NgayDong]: snap.closedAt.slice(0, 10),
          [CL.SoVanPhong]: rep.length,
          [CL.SoChuyen]: snap.emptrips.filter(
            (/** @type {{ company?: string }} */ x) => !co || x.company === co,
          ).length,
          [CL.SoDiLam]: snap.commute.filter(
            (/** @type {{ company?: string }} */ x) => !co || x.company === co,
          ).length,
        }),
      )
    }
    closeRows = await batchCreateRecords(prefix, token, appToken, tClose, summaryFields)
  }

  return { office, trips, commute, closeRows, skippedOffice, skippedTrips, skippedCommute }
}

/** Gợi ý tên cột trong Lark Base (Text). Cột ID do Base tự quản — không gửi từ app. */
export const LARK_FIELD_HELP = {
  office: [
    'ID — không chỉnh / không gửi từ app',
    `${LARK_COL_PERIOD} (tùy chọn — chỉ gửi nếu Base có cột «Kỳ báo cáo» hoặc «Kỳ»)`,
    LARK_COL_OFFICE.CongTy,
    LARK_COL_OFFICE.ThietBi,
    LARK_COL_OFFICE.NguonPhatThai,
    LARK_COL_OFFICE.Scope,
    LARK_COL_OFFICE.DonVi,
    LARK_COL_OFFICE.KhoiLuong,
    LARK_COL_OFFICE.Ef,
    LARK_COL_OFFICE.EfRef,
    LARK_COL_OFFICE.TongGhg,
  ],
  trips: [
    'ID — không chỉnh / không gửi từ app',
    `${LARK_COL_PERIOD} (tùy chọn)`,
    LARK_COL_TRIP.CongTy,
    LARK_COL_TRIP.HoTen,
    LARK_COL_TRIP.MaNv,
    LARK_COL_TRIP.PhongBan,
    LARK_COL_TRIP.TenChuyen,
    LARK_COL_TRIP.MucDich,
    LARK_COL_TRIP.XuatPhat,
    LARK_COL_TRIP.Den,
    LARK_COL_TRIP.NgayDi,
    LARK_COL_TRIP.NgayVe,
    LARK_COL_TRIP.Co2Bay,
    LARK_COL_TRIP.Co2MatDat,
    LARK_COL_TRIP.Co2LuuTru,
    LARK_COL_TRIP.Tong,
    LARK_COL_TRIP.PhuongTienChiTiet,
    LARK_COL_TRIP.LuuTruChiTiet,
  ],
  commute: [
    'ID — không chỉnh / không gửi từ app',
    `${LARK_COL_PERIOD} (tùy chọn)`,
    LARK_COL_COMMUTE.CongTy,
    LARK_COL_COMMUTE.HoTen,
    LARK_COL_COMMUTE.MaNv,
    LARK_COL_COMMUTE.PhongBan,
    LARK_COL_COMMUTE.PhuongTien,
    LARK_COL_COMMUTE.KmMotChieu,
    LARK_COL_COMMUTE.NgayDiLamThang,
    LARK_COL_COMMUTE.Wfh,
    LARK_COL_COMMUTE.Carpool,
    LARK_COL_COMMUTE.Co2e,
  ],
}
