/**
 * Lark Base (Bitable) — đẩy dữ liệu kỳ hiện tại.
 *
 * Tên cột phải trùng đúng **tiêu đề** trong Base (tiếng Việt). Không gửi cột **ID** (Lark/Base tự quản).
 * Khi test toàn bộ cột dạng Text: mọi giá trị được chuyển sang chuỗi.
 *
 * Dev: proxy `/lark-open-api` (vite.config.js). Production: `VITE_LARK_API_BASE`.
 */

import { get } from 'svelte/store'
import { equipRows, empTrips, commuteList, isEquipInReport } from './ghg.js'

/** Tên cột — Văn phòng (Scope 1 & 2) — trùng Base */
export const LARK_COL_OFFICE = {
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
}

/** Tên cột — Đi làm hằng ngày */
export const LARK_COL_COMMUTE = {
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
function officeSig(f) {
  return [
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
  return [norm(f[M.MaNv]), norm(f[M.PhuongTien]), norm(f[M.KmMotChieu]), norm(f[M.NgayDiLamThang]), norm(f[M.Wfh])].join('|')
}

/** Base URL: dev = proxy Vite; production (Vercel) = /api/lark */
export function larkOpenApiPrefix() {
  const v = import.meta.env.VITE_LARK_API_BASE
  const custom = v != null ? String(v).trim().replace(/\/$/, '') : ''
  // Không dùng /lark-open-api trên production (chỉ có khi npm run dev)
  if (custom && custom !== '/lark-open-api') return custom
  if (import.meta.env.DEV) return '/lark-open-api'
  return '/api/lark'
}

/**
 * @param {string} path e.g. /open-apis/auth/...
 * @param {RequestInit} [init]
 * @param {string} [prefixOverride]
 */
async function larkFetch(path, init = {}, prefixOverride) {
  const prefix = prefixOverride ?? larkOpenApiPrefix()
  const url = path.startsWith('http') ? path : `${prefix}${path}`
  const res = await fetch(url, init)
  const text = await res.text()
  /** @type {Record<string, unknown>} */
  let json = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = {}
  }

  if (!res.ok) {
    const looksLikeSpaHtml =
      res.status === 404 &&
      (text.trimStart().startsWith('<!') || /<!DOCTYPE/i.test(text) || text.includes('<html'))
    if (looksLikeSpaHtml && prefix.startsWith('/')) {
      throw new Error(
        'HTTP 404 — route /api/lark chưa chạy trên server. Redeploy Vercel (cần file api/lark.js + vercel.json có "handle": "filesystem"). Xóa biến VITE_LARK_API_BASE=/lark-open-api trên Vercel nếu có.',
      )
    }
    if (res.status === 404 && prefix.startsWith('/')) {
      throw new Error(`HTTP 404 — Lark API: ${url}`)
    }
    const msg = typeof json.msg === 'string' ? json.msg : ''
    throw new Error(msg ? `HTTP ${res.status}: ${msg}` : `HTTP ${res.status}`)
  }

  return { res, json }
}

/**
 * @param {string} prefix
 * @param {string} appId
 * @param {string} appSecret
 */
export async function fetchTenantAccessToken(prefix, appId, appSecret) {
  const { json } = await larkFetch(
    '/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    },
    prefix,
  )
  if (json.code !== 0) throw new Error(String(json.msg || `Lark token code ${json.code}`))
  const token = json.tenant_access_token
  if (!token) throw new Error('Không nhận được tenant_access_token')
  return /** @type {string} */ (token)
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
  const path = `/open-apis/bitable/v1/apps/${encodeURIComponent(baseAppToken)}/tables/${encodeURIComponent(tableId)}/records/batch_create`
  let total = 0
  for (const part of chunk(fieldsList, 80)) {
    const body = { records: part.map((fields) => ({ fields })) }
    const { json } = await larkFetch(
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
      throw new Error(String(json.msg || `Lark batch_create ${json.code}`))
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
    const { json } = await larkFetch(
      path,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      prefix,
    )
    if (json.code !== 0) throw new Error(String(json.msg || `Lark list records ${json.code}`))
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
  const officeRows = get(equipRows).filter(isEquipInReport)
  const officeFields = officeRows.map((r) => {
    const tot = r.volume && r.ef ? (r.volume * r.ef) / 1000 : 0
    return fieldsAllText({
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

  const tripRows = get(empTrips).map((trip) =>
    fieldsAllText({
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
    }),
  )

  const commuteRows = get(commuteList).map((c) =>
    fieldsAllText({
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

/** Gợi ý tên cột trong Lark Base (Text). Cột ID do Base tự quản — không gửi từ app. */
export const LARK_FIELD_HELP = {
  office: [
    'ID — không chỉnh / không gửi từ app',
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
  ],
  commute: [
    'ID — không chỉnh / không gửi từ app',
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
