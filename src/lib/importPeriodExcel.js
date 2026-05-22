/**
 * Import .xlsx — cùng format Xuất / Mẫu Excel (periodExcelShared.js).
 * Đọc giá trị ô công thức, bỏ dòng TỔNG / mẫu trống, hỗ trợ file cũ & mới.
 */

import { get } from 'svelte/store'
import {
  equipRows,
  empTrips,
  commuteList,
  offSettings,
  setCompanyLocation,
  persistEquip,
  persistEmp,
  persistCommute,
} from './ghg.js'
import {
  EXCEL_SHEET,
  EXCEL_OFFICE_HEADERS,
  EXCEL_TRIP_HEADERS,
  EXCEL_COMMUTE_HEADERS,
  EXCEL_OFFICE_HEADERS_LEGACY,
  EXCEL_TRIP_HEADERS_LEGACY,
  EXCEL_COMMUTE_HEADERS_LEGACY,
  EXCEL_OVERVIEW_COMPANY_LABEL,
  EXCEL_OVERVIEW_COMPANY_LABEL_LEGACY,
  EXCEL_OVERVIEW_LOCATION_LABEL,
  EXCEL_COL_COMPANY,
  EXCEL_OPTIONAL_COLUMNS,
} from './periodExcelShared.js'
import { COMMUTE_VEHICLES } from './constants.js'
import { normalizeCompany, COMPANIES } from './companies.js'
import { calcCommute } from './calculations.js'

/** @param {unknown} cellValue */
function rawScalar(cellValue) {
  if (cellValue == null || cellValue === '') return cellValue
  if (typeof cellValue === 'object' && cellValue !== null && 'result' in cellValue) {
    return /** @type {{ result?: unknown }} */ (cellValue).result
  }
  return cellValue
}

/** @param {import('exceljs').Cell} cell */
export function cellToString(cell) {
  const v = rawScalar(cell.value)
  if (v == null || v === '') return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v).trim()
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object' && v !== null) {
    if ('richText' in v && Array.isArray(/** @type {{ richText: { text: string }[] }} */ (v).richText))
      return /** @type {{ richText: { text: string }[] }} */ (v).richText.map((p) => p.text).join('').trim()
    if ('text' in v && typeof /** @type {{ text?: string }} */ (v).text === 'string')
      return /** @type {{ text: string }} */ (v).text.trim()
  }
  return String(v).trim()
}

/** @param {import('exceljs').Cell} cell */
function cellToNumber(cell) {
  const v = rawScalar(cell.value)
  if (v == null || v === '') return 0
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = cellToString(cell).replace(/,/g, '').replace(/\u00a0/g, '').trim()
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

/** @param {string} h */
function normHeader(h) {
  return String(h ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC')
}

/**
 * @param {import('exceljs').Row} row
 * @param {string[]} expected
 * @param {string[]} [optionalHeaders]
 */
function headerIndexMap(row, expected, optionalHeaders = EXCEL_OPTIONAL_COLUMNS) {
  const opt = new Set(optionalHeaders.map(normHeader))
  /** @type {Record<string, number>} */
  const map = {}
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const key = normHeader(cellToString(cell))
    if (key) map[key] = colNumber
  })
  for (const h of expected) {
    const n = normHeader(h)
    if (opt.has(n)) continue
    if (map[n] === undefined) {
      throw new Error(`Thiếu cột bắt buộc: «${h}». Kiểm tra hàng tiêu đề sheet.`)
    }
  }
  return map
}

/**
 * @param {import('exceljs').Row} row
 * @param {string[]} modern
 * @param {string[]} legacy
 */
function resolveHeaderMap(row, modern, legacy) {
  try {
    return headerIndexMap(row, modern)
  } catch {
    return headerIndexMap(row, legacy)
  }
}

/** @param {Record<string, number>} col @param {string} name */
function colIndex(col, name) {
  return col[normHeader(name)]
}

/** @param {import('exceljs').Row} row @param {Record<string, number>} col @param {string} name */
function cellAt(row, col, name) {
  const i = colIndex(col, name)
  if (!i) return { value: '' }
  return row.getCell(i)
}

/** @param {import('exceljs').Worksheet} ws */
function sheetLastUsedRow(ws) {
  let max = 1
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    max = Math.max(max, rowNumber)
  })
  return max
}

/** @param {import('exceljs').Worksheet} sheet @param {number} rowNum */
function rowIsPlaceholder(sheet, rowNum) {
  const t = cellToString(sheet.getRow(rowNum).getCell(1))
  const u = t.toUpperCase()
  return t.startsWith('(') || u === 'TỔNG' || u === 'TONG'
}

/** @param {string} raw @param {string} defaultCompany @param {string[]} warnings @param {string} ctx */
function resolveCompany(raw, defaultCompany, warnings, ctx) {
  const t = String(raw ?? '').trim()
  if (!t) return defaultCompany
  const n = normalizeCompany(t)
  if (n) return n
  warnings.push(`${ctx}: công ty «${t}» không hợp lệ — dùng mặc định hoặc bỏ trống (${COMPANIES.join(', ')})`)
  return defaultCompany
}

function emptyFlightLeg() {
  return {
    id: `leg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    from: '',
    to: '',
    km: 0,
    legs: 1,
    cabin: 0.133,
    cabinLabel: 'Economy',
  }
}

/** @param {unknown} v */
function normKey(v) {
  return String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** @param {any} r */
function equipSig(r) {
  return [
    normKey(r.company),
    normKey(r.equipment),
    normKey(r.source),
    Number(r.scope) || 1,
    normKey(r.unit),
    Number(r.volume) || 0,
    Number(r.ef) || 0,
    normKey(r.efRef),
  ].join('|')
}

/** @param {any} t */
function tripSig(t) {
  return [
    normKey(t.company),
    normKey(t.empId),
    normKey(t.trip),
    normKey(t.dateFrom),
    normKey(t.dateTo),
    normKey(t.from),
    normKey(t.to),
  ].join('|')
}

/** @param {any} c */
function commuteSig(c) {
  return [
    normKey(c.company),
    normKey(c.empId),
    normKey(c.vehicle),
    Number(c.km) || 0,
    Number(c.days) || 0,
    Number(c.wfh) || 0,
  ].join('|')
}

/** @param {string} label */
function efFromVehicleLabel(label) {
  const t = label.trim()
  if (!t) return 0
  const hit = COMMUTE_VEHICLES.find(
    (x) => t === x.label || x.label.startsWith(t) || t.startsWith(x.label.split(' (')[0]),
  )
  return hit ? hit.value : 0
}

/**
 * @param {import('exceljs').Workbook} workbook
 * @returns {{ company?: string, location?: string }}
 */
function parseOverview(workbook) {
  const ws = workbook.getWorksheet(EXCEL_SHEET.overview)
  if (!ws) return {}
  /** @type {{ company?: string, location?: string }} */
  const out = {}
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber < 4) return
    const label = normHeader(cellToString(row.getCell(1)))
    const valB = cellToString(row.getCell(2))
    if (
      (label === normHeader(EXCEL_OVERVIEW_COMPANY_LABEL) ||
        label === normHeader(EXCEL_OVERVIEW_COMPANY_LABEL_LEGACY)) &&
      valB &&
      !valB.includes('·')
    ) {
      out.company = normalizeCompany(valB) || valB
    }
    if (label === normHeader(EXCEL_OVERVIEW_LOCATION_LABEL) && valB) out.location = valB
  })
  return out
}

/**
 * @param {ArrayBuffer} arrayBuffer
 */
export async function parsePeriodExcel(arrayBuffer) {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(arrayBuffer)

  /** @type {string[]} */
  const warnings = []
  const overview = parseOverview(workbook)
  const defaultCompany = normalizeCompany(overview.company) || ''

  let hasOfficeSheet = false
  /** @type {unknown[]} */
  const equip = []

  const wsO = workbook.getWorksheet(EXCEL_SHEET.office)
  if (wsO) {
    hasOfficeSheet = true
    const col = resolveHeaderMap(wsO.getRow(1), EXCEL_OFFICE_HEADERS, EXCEL_OFFICE_HEADERS_LEGACY)
    const lastRow = sheetLastUsedRow(wsO)
    for (let r = 2; r <= lastRow; r++) {
      if (rowIsPlaceholder(wsO, r)) continue
      const row = wsO.getRow(r)
      const equipment = cellToString(cellAt(row, col, 'Thiết bị'))
      const source = cellToString(cellAt(row, col, 'Nguồn phát thải'))
      const volume = cellToNumber(cellAt(row, col, 'Khối lượng'))
      const ef = cellToNumber(cellAt(row, col, 'EF (kg CO₂e/đvị)'))
      if (!equipment && !source && !volume && !ef) continue

      let scope = cellToNumber(cellAt(row, col, 'Scope'))
      if (!scope) {
        const st = cellToString(cellAt(row, col, 'Scope'))
        if (st) scope = parseInt(st, 10) || 1
      }
      if (!scope) scope = 1

      const company = resolveCompany(
        cellToString(cellAt(row, col, EXCEL_COL_COMPANY)),
        defaultCompany,
        warnings,
        `Văn phòng dòng ${r}`,
      )

      equip.push({
        id: `imp_${Date.now()}_${r}_${Math.random().toString(36).slice(2, 7)}`,
        equipment,
        company,
        source,
        scope: scope === 2 ? 2 : 1,
        unit: cellToString(cellAt(row, col, 'Đơn vị')),
        volume,
        ef,
        efRef: cellToString(cellAt(row, col, 'EF Reference')),
        confirmed: true,
      })
    }
  }

  let hasTripSheet = false
  /** @type {unknown[]} */
  const trips = []

  const wsT = workbook.getWorksheet(EXCEL_SHEET.trip)
  if (wsT) {
    hasTripSheet = true
    const col = resolveHeaderMap(wsT.getRow(1), EXCEL_TRIP_HEADERS, EXCEL_TRIP_HEADERS_LEGACY)
    const lastRow = sheetLastUsedRow(wsT)
    for (let r = 2; r <= lastRow; r++) {
      if (rowIsPlaceholder(wsT, r)) continue
      const row = wsT.getRow(r)
      const name = cellToString(cellAt(row, col, 'Họ và tên'))
      const empId = cellToString(cellAt(row, col, 'Mã NV'))
      const tripName = cellToString(cellAt(row, col, 'Tên chuyến'))
      if (!name && !empId) continue
      if (!tripName && !name) continue

      const company = resolveCompany(
        cellToString(cellAt(row, col, EXCEL_COL_COMPANY)),
        defaultCompany,
        warnings,
        `Chuyến CT dòng ${r}`,
      )

      const co2Air = cellToNumber(cellAt(row, col, 'CO₂ bay (kg)'))
      const co2Ground = cellToNumber(cellAt(row, col, 'CO₂ mặt đất (kg)'))
      const co2Hotel = cellToNumber(cellAt(row, col, 'CO₂ lưu trú (kg)'))
      let co2Total = cellToNumber(cellAt(row, col, 'Tổng (kg CO₂e)'))
      if (!co2Total && (co2Air || co2Ground || co2Hotel)) {
        co2Total = Math.round((co2Air + co2Ground + co2Hotel) * 10) / 10
      }

      trips.push({
        id: `imp_${Date.now()}_${r}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        empId,
        company,
        dept: cellToString(cellAt(row, col, 'Phòng ban')),
        trip: tripName,
        purpose: cellToString(cellAt(row, col, 'Mục đích')),
        from: cellToString(cellAt(row, col, 'Điểm xuất phát')),
        to: cellToString(cellAt(row, col, 'Điểm đến')),
        dateFrom: cellToString(cellAt(row, col, 'Ngày đi')),
        dateTo: cellToString(cellAt(row, col, 'Ngày về')),
        proj: '',
        note: '',
        flightLegs: [emptyFlightLeg()],
        otherTransports: [],
        groundType: '',
        groundKm: 0,
        fuel: 0,
        hotelStays: [],
        hotelLabel: '',
        nights: 0,
        rooms: 1,
        co2Air,
        co2Ground,
        co2Hotel,
        co2Total,
        savedAt: new Date().toISOString(),
      })
    }
  }

  let hasCommuteSheet = false
  /** @type {unknown[]} */
  const commutes = []

  const wsC = workbook.getWorksheet(EXCEL_SHEET.commute)
  if (wsC) {
    hasCommuteSheet = true
    const col = resolveHeaderMap(wsC.getRow(1), EXCEL_COMMUTE_HEADERS, EXCEL_COMMUTE_HEADERS_LEGACY)
    const hasEfCol = colIndex(col, 'EF (kg/km)') != null
    const lastRow = sheetLastUsedRow(wsC)
    for (let r = 2; r <= lastRow; r++) {
      if (rowIsPlaceholder(wsC, r)) continue
      const row = wsC.getRow(r)
      const name = cellToString(cellAt(row, col, 'Họ và tên'))
      const empId = cellToString(cellAt(row, col, 'Mã NV'))
      if (!name && !empId) continue

      const vehicle = cellToString(cellAt(row, col, 'Phương tiện'))
      const km = cellToNumber(cellAt(row, col, 'Km một chiều'))
      const days = cellToNumber(cellAt(row, col, 'Ngày đi làm / tháng'))
      const wfh = cellToNumber(cellAt(row, col, 'WFH (ngày/tháng)'))
      if (!vehicle && !km && !days) continue

      const company = resolveCompany(
        cellToString(cellAt(row, col, EXCEL_COL_COMPANY)),
        defaultCompany,
        warnings,
        `Đi làm dòng ${r}`,
      )

      let ef = hasEfCol ? cellToNumber(cellAt(row, col, 'EF (kg/km)')) : 0
      if (!ef) ef = efFromVehicleLabel(vehicle)
      const carpool = cellToNumber(cellAt(row, col, 'Carpool (người)')) || 1
      let co2 = cellToNumber(cellAt(row, col, 'CO₂e (kg)'))
      if (!co2 && ef && km) co2 = calcCommute(ef, km, days, 1, wfh, carpool)

      commutes.push({
        id: `imp_${Date.now()}_${r}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        empId,
        company,
        dept: cellToString(cellAt(row, col, 'Phòng ban')),
        vehicle,
        ef,
        km,
        days,
        months: 1,
        wfh,
        carpool,
        effectiveDays: Math.max(0, days - wfh),
        co2,
        savedAt: new Date().toISOString(),
      })
    }
  }

  if (!hasOfficeSheet && !hasTripSheet && !hasCommuteSheet) {
    throw new Error(
      `Không tìm thấy sheet dữ liệu. Cần ít nhất một trong: «${EXCEL_SHEET.office}», «${EXCEL_SHEET.trip}», «${EXCEL_SHEET.commute}».`,
    )
  }

  return {
    hasOfficeSheet,
    equip,
    hasTripSheet,
    trips,
    hasCommuteSheet,
    commutes,
    overview,
    warnings,
    counts: {
      equip: equip.length,
      trips: trips.length,
      commutes: commutes.length,
    },
  }
}

/** @param {Awaited<ReturnType<typeof parsePeriodExcel>>} parsed */
export function buildImportPreviewHtml(parsed) {
  const lines = []
  if (parsed.hasOfficeSheet) lines.push(`<strong>Văn phòng:</strong> ${parsed.counts.equip} dòng`)
  if (parsed.hasTripSheet) lines.push(`<strong>Chuyến CT:</strong> ${parsed.counts.trips} dòng`)
  if (parsed.hasCommuteSheet) lines.push(`<strong>Đi làm:</strong> ${parsed.counts.commutes} dòng`)
  if (parsed.overview.company) {
    lines.push(`<strong>Công ty mặc định kỳ:</strong> ${parsed.overview.company}`)
  }
  if (!lines.length) lines.push('Không có dòng dữ liệu hợp lệ trong file.')
  let html = `<p style="margin:0 0 8px">${lines.join('<br>')}</p>`
  html +=
    '<p style="margin:0;font-size:12px;color:#6B6960"><strong>Gộp thêm:</strong> giữ dữ liệu cũ, chỉ thêm dòng mới (bỏ trùng).<br><strong>Thay thế:</strong> xóa dữ liệu sheet có trong file rồi ghi từ Excel (thiết bị nháp chưa ✓ vẫn giữ).</p>'
  if (parsed.warnings.length) {
    const show = parsed.warnings.slice(0, 5)
    html += `<p style="margin:8px 0 0;font-size:11px;color:#B85C00">⚠ ${show.join('<br>⚠ ')}${parsed.warnings.length > 5 ? `<br>… +${parsed.warnings.length - 5} cảnh báo` : ''}</p>`
  }
  return html
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {{ mode?: 'merge'|'replace' }} [options]
 */
export async function importPeriodExcelAndApply(arrayBuffer, options = {}) {
  const mode = options.mode === 'replace' ? 'replace' : 'merge'
  const parsed = await parsePeriodExcel(arrayBuffer)

  const currentEquipAll = get(equipRows)
  const drafts = currentEquipAll.filter((r) => r.confirmed === false)
  const currentConfirmedEquip = currentEquipAll.filter((r) => r.confirmed !== false)
  const currentTrips = get(empTrips)
  const currentCommutes = get(commuteList)

  let skippedEquip = 0
  let skippedTrips = 0
  let skippedCommutes = 0
  let addedEquip = 0
  let addedTrips = 0
  let addedCommutes = 0

  if (parsed.hasOfficeSheet) {
    const base = mode === 'replace' ? [...drafts] : [...drafts, ...currentConfirmedEquip]
    const seen = new Set(base.map(equipSig))
    /** @type {any[]} */
    const uniq = []
    for (const row of /** @type {any[]} */ (parsed.equip)) {
      const sig = equipSig(row)
      if (seen.has(sig)) {
        skippedEquip++
        continue
      }
      seen.add(sig)
      uniq.push(row)
    }
    addedEquip = uniq.length
    equipRows.set([...base, ...uniq])
    persistEquip()
  }

  if (parsed.hasTripSheet) {
    const base = mode === 'replace' ? [] : [...currentTrips]
    const seen = new Set(base.map(tripSig))
    /** @type {any[]} */
    const uniq = []
    for (const row of /** @type {any[]} */ (parsed.trips)) {
      const sig = tripSig(row)
      if (seen.has(sig)) {
        skippedTrips++
        continue
      }
      seen.add(sig)
      uniq.push(row)
    }
    addedTrips = uniq.length
    empTrips.set([...base, ...uniq])
    persistEmp()
  }

  if (parsed.hasCommuteSheet) {
    const base = mode === 'replace' ? [] : [...currentCommutes]
    const seen = new Set(base.map(commuteSig))
    /** @type {any[]} */
    const uniq = []
    for (const row of /** @type {any[]} */ (parsed.commutes)) {
      const sig = commuteSig(row)
      if (seen.has(sig)) {
        skippedCommutes++
        continue
      }
      seen.add(sig)
      uniq.push(row)
    }
    addedCommutes = uniq.length
    commuteList.set([...base, ...uniq])
    persistCommute()
  }

  const o = get(offSettings)
  if (parsed.overview.company !== undefined || parsed.overview.location !== undefined) {
    const co =
      parsed.overview.company !== undefined
        ? normalizeCompany(parsed.overview.company) || parsed.overview.company
        : normalizeCompany(o.company ?? '') || o.company || ''
    setCompanyLocation(
      co,
      parsed.overview.location !== undefined ? parsed.overview.location : (o.location ?? ''),
    )
  }

  const totalAdded = addedEquip + addedTrips + addedCommutes
  if (totalAdded === 0 && !parsed.warnings.length) {
    throw new Error('Không có dòng dữ liệu hợp lệ để import (file trống hoặc chỉ có công thức mẫu?).')
  }

  return {
    mode,
    addedEquip,
    addedTrips,
    addedCommutes,
    skippedEquip,
    skippedTrips,
    skippedCommutes,
    warnings: parsed.warnings,
    equip: parsed.hasOfficeSheet ? get(equipRows).filter((r) => r.confirmed !== false).length : null,
    trips: parsed.hasTripSheet ? get(empTrips).length : null,
    commutes: parsed.hasCommuteSheet ? get(commuteList).length : null,
  }
}

/** Preview trước khi ghi — dùng trong UI */
export async function previewPeriodExcelImport(arrayBuffer) {
  const parsed = await parsePeriodExcel(arrayBuffer)
  return {
    html: buildImportPreviewHtml(parsed),
    parsed,
  }
}
