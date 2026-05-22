import { get } from 'svelte/store'
import {
  equipRows,
  empTrips,
  commuteList,
  currentMonth,
  currentYear,
  offSettings,
  periodLabel,
  isEquipInReport,
  currentPK,
} from './ghg.js'
import { normalizeCompany } from './companies.js'
import {
  EXCEL_SHEET,
  EXCEL_OFFICE_HEADERS,
  EXCEL_TRIP_HEADERS,
  EXCEL_COMMUTE_HEADERS,
  EXCEL_OVERVIEW_COMPANY_LABEL,
  EXCEL_OVERVIEW_LOCATION_LABEL,
  EXCEL_COMPANY_LIST,
  EXCEL_COMPANY_LIST_FORMULA,
  EXCEL_FORMULA_LAST_ROW,
} from './periodExcelShared.js'

/** @param {number} col 1-based */
function colLetter(col) {
  let s = ''
  let n = col
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** @param {string} sheetName */
function sheetRef(sheetName) {
  return `'${sheetName.replace(/'/g, "''")}'`
}

/**
 * @param {import('exceljs').Worksheet} ws
 * @param {number} row
 * @param {number} col
 * @param {string} formula
 */
function setFormula(ws, row, col, formula) {
  ws.getCell(row, col).value = { formula }
}

/**
 * @param {import('exceljs').Worksheet} ws
 * @param {number} lastDataRow
 * @param {number[]} sumCols
 */
function addSumFooter(ws, lastDataRow, sumCols) {
  const footerRow = lastDataRow + 1
  const fr = ws.getRow(footerRow)
  fr.getCell(1).value = 'TỔNG'
  fr.getCell(1).font = { bold: true, size: 11, color: { argb: ACCENT } }
  for (const c of sumCols) {
    const cell = fr.getCell(c)
    const L = colLetter(c)
    cell.value = { formula: `SUM(${L}2:${L}${lastDataRow})` }
    cell.numFmt = '#,##0.000'
    cell.font = { bold: true, size: 11, color: { argb: ACCENT } }
    cell.border = thinBorder()
    cell.alignment = { vertical: 'middle', horizontal: 'right' }
  }
  fr.getCell(1).border = thinBorder()
  return footerRow
}

const ACCENT = 'FF1A6B3C'
const HEADER_FG = 'FFFFFFFF'
const ZEBRA = 'FFF5F4F0'
const BORDER = 'FFDDDBD3'

function thinBorder() {
  return {
    top: { style: 'thin', color: { argb: BORDER } },
    left: { style: 'thin', color: { argb: BORDER } },
    bottom: { style: 'thin', color: { argb: BORDER } },
    right: { style: 'thin', color: { argb: BORDER } },
  }
}

/**
 * @param {import('exceljs').Row} row
 * @param {number} colCount
 * @param {Set<number>} [rightCols]
 */
function styleHeaderRow(row, colCount, rightCols = new Set()) {
  row.height = 22
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c)
    cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } }
    cell.alignment = {
      vertical: 'middle',
      horizontal: rightCols.has(c) ? 'right' : 'left',
      wrapText: true,
    }
    cell.border = thinBorder()
  }
}

/**
 * @param {import('exceljs').Row} row
 * @param {Set<number>} rightCols
 * @param {Set<number>} numFmt000
 * @param {Set<number>} numFmtMany
 */
function styleDataRow(row, rightCols, numFmt000, numFmtMany) {
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.border = thinBorder()
    if (row.number > 1 && row.number % 2 === 1) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
    }
    const v = cell.value
    if (v !== '' && v != null && typeof v === 'number') {
      if (numFmt000.has(colNumber)) cell.numFmt = '#,##0.000'
      else if (numFmtMany.has(colNumber)) cell.numFmt = '#,##0.000000'
      else cell.numFmt = '#,##0.###'
    }
    cell.alignment = {
      vertical: 'middle',
      horizontal: rightCols.has(colNumber) ? 'right' : 'left',
      wrapText: true,
    }
  })
}

/**
 * @param {import('exceljs').Workbook} workbook
 * @param {string} pk
 * @param {number} m
 * @param {number} y
 */
/**
 * @param {import('exceljs').Workbook} workbook
 * @param {string} pk
 * @param {number} m
 * @param {number} y
 * @param {number} lastRow
 */
function addOverviewSheet(workbook, pk, m, y, lastRow = EXCEL_FORMULA_LAST_ROW) {
  const ws = workbook.addWorksheet(EXCEL_SHEET.overview, { properties: { defaultRowHeight: 19 } })
  const os = get(offSettings)
  const exportedAt = new Date()
  const off = sheetRef(EXCEL_SHEET.office)
  const trip = sheetRef(EXCEL_SHEET.trip)
  const com = sheetRef(EXCEL_SHEET.commute)

  ws.mergeCells('A1:D1')
  const title = ws.getCell('A1')
  title.value = 'GHG Inventory — Báo cáo phát thải theo kỳ'
  title.font = { size: 16, bold: true, color: { argb: 'FF1A1916' } }
  title.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(1).height = 30

  ws.mergeCells('A2:D2')
  const sub = ws.getCell('A2')
  sub.value = periodLabel(m, y)
  sub.font = { size: 13, bold: true, color: { argb: ACCENT } }
  sub.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(2).height = 24

  const pairs = [
    ['Kỳ báo cáo (mã)', pk],
    ['Xuất file lúc', exportedAt.toLocaleString('vi-VN')],
    [EXCEL_OVERVIEW_COMPANY_LABEL, normalizeCompany(os.company) || '—'],
    [EXCEL_OVERVIEW_LOCATION_LABEL, os.location || '—'],
    ['Công ty hợp lệ (chọn trong sheet)', EXCEL_COMPANY_LIST.join(' · ')],
    ['Tổng Scope 1 + 2 (tấn CO₂e)', null],
    ['Tổng Scope 3 — ước tính (tấn CO₂e)', null],
    ['Tổng toàn kỳ (tấn CO₂e)', null],
  ]

  let r = 4
  let rowS12 = 0
  let rowS3 = 0
  let rowTotal = 0
  for (const [label, val] of pairs) {
    const row = ws.getRow(r)
    row.getCell(1).value = label
    row.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF6B6960' } }
    const b = row.getCell(2)
    if (label === 'Tổng Scope 1 + 2 (tấn CO₂e)') {
      rowS12 = r
      b.value = { formula: `SUM(${off}!I2:I${lastRow})` }
      b.numFmt = '#,##0.000'
      b.font = { size: 12, bold: true, color: { argb: ACCENT } }
    } else if (label === 'Tổng Scope 3 — ước tính (tấn CO₂e)') {
      rowS3 = r
      b.value = {
        formula: `(SUM(${trip}!N2:N${lastRow})+SUM(${com}!K2:K${lastRow}))/1000`,
      }
      b.numFmt = '#,##0.000'
      b.font = { size: 12, bold: true, color: { argb: ACCENT } }
    } else if (label === 'Tổng toàn kỳ (tấn CO₂e)') {
      rowTotal = r
      b.value = { formula: `B${rowS12}+B${rowS3}` }
      b.numFmt = '#,##0.000'
      b.font = { size: 12, bold: true, color: { argb: ACCENT } }
    } else {
      b.value = val
      b.font = { size: 11, color: { argb: 'FF1A1916' } }
    }
    row.getCell(1).border = thinBorder()
    b.border = thinBorder()
    r++
  }

  ws.getColumn(1).width = 38
  ws.getColumn(2).width = 44
}

/**
 * Sheet tổng quan trống cho file mẫu.
 * @param {import('exceljs').Workbook} workbook
 */
/**
 * @param {import('exceljs').Workbook} workbook
 * @param {number} lastRow
 */
function addOverviewSheetTemplate(workbook, lastRow = EXCEL_FORMULA_LAST_ROW) {
  const ws = workbook.addWorksheet(EXCEL_SHEET.overview, { properties: { defaultRowHeight: 19 } })

  ws.mergeCells('A1:D1')
  const title = ws.getCell('A1')
  title.value = 'GHG Inventory — Báo cáo phát thải theo kỳ (mẫu)'
  title.font = { size: 16, bold: true, color: { argb: 'FF1A1916' } }
  title.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(1).height = 30

  ws.mergeCells('A2:D2')
  const sub = ws.getCell('A2')
  sub.value =
    'Chọn công ty trong cột «Công ty» (dropdown) trên từng sheet; mặc định kỳ ở bảng dưới.'
  sub.font = { size: 12, bold: true, color: { argb: ACCENT } }
  sub.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(2).height = 22

  const pairs = [
    ['Kỳ báo cáo (mã)', '(vd: 2026-05)'],
    ['Xuất file lúc', '—'],
    [EXCEL_OVERVIEW_COMPANY_LABEL, ''],
    [EXCEL_OVERVIEW_LOCATION_LABEL, ''],
    ['Công ty hợp lệ (chọn trong sheet)', EXCEL_COMPANY_LIST.join(' · ')],
    ['Tổng Scope 1 + 2 (tấn CO₂e)', null],
    ['Tổng Scope 3 — ước tính (tấn CO₂e)', null],
    ['Tổng toàn kỳ (tấn CO₂e)', null],
  ]

  let r = 4
  let rowS12 = 0
  let rowS3 = 0
  for (const [label, val] of pairs) {
    const row = ws.getRow(r)
    row.getCell(1).value = label
    row.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF6B6960' } }
    const b = row.getCell(2)
    if (label === 'Tổng Scope 1 + 2 (tấn CO₂e)') {
      rowS12 = r
      const off = sheetRef(EXCEL_SHEET.office)
      b.value = { formula: `SUM(${off}!I2:I${lastRow})` }
      b.numFmt = '#,##0.000'
    } else if (label === 'Tổng Scope 3 — ước tính (tấn CO₂e)') {
      rowS3 = r
      const trip = sheetRef(EXCEL_SHEET.trip)
      const com = sheetRef(EXCEL_SHEET.commute)
      b.value = {
        formula: `(SUM(${trip}!N2:N${lastRow})+SUM(${com}!K2:K${lastRow}))/1000`,
      }
      b.numFmt = '#,##0.000'
    } else if (label === 'Tổng toàn kỳ (tấn CO₂e)') {
      b.value = { formula: `B${rowS12}+B${rowS3}` }
      b.numFmt = '#,##0.000'
    } else {
      b.value = val
    }
    b.font = { size: 11, color: { argb: 'FF1A1916' } }
    row.getCell(1).border = thinBorder()
    b.border = thinBorder()
    r++
  }

  ws.getColumn(1).width = 38
  ws.getColumn(2).width = 44
}

/** @param {import('exceljs').Worksheet} ws @param {number[]} widths */
function setColWidths(ws, widths) {
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })
}

/**
 * Dropdown 6 công ty trên một cột (file mẫu / gợi ý khi nhập tay).
 * @param {import('exceljs').Worksheet} ws
 * @param {string} colLetter
 * @param {number} [lastRow]
 */
function addCompanyColumnValidation(ws, colLetter, lastRow = 500) {
  ws.dataValidations.add(`${colLetter}2:${colLetter}${lastRow}`, {
    type: 'list',
    allowBlank: true,
    formulae: [EXCEL_COMPANY_LIST_FORMULA],
    showErrorMessage: true,
    errorTitle: 'Công ty không hợp lệ',
    error: `Chọn một trong: ${EXCEL_COMPANY_LIST.join(', ')}`,
  })
}

/**
 * @param {import('exceljs').Workbook} workbook
 * @param {any[]} rows
 * @param {{ forTemplate?: boolean }} [opts]
 */
/** Công thức web: khối lượng × EF ÷ 1000 (tấn) — cột F,G → I */
function applyOfficeRowFormulas(ws, rowNum) {
  setFormula(ws, rowNum, 9, `IF(AND(F${rowNum}<>"",G${rowNum}<>""),F${rowNum}*G${rowNum}/1000,0)`)
}

function addOfficeSheet(workbook, rows, opts = {}) {
  const { forTemplate = false } = opts
  const ws = workbook.addWorksheet(EXCEL_SHEET.office, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  })
  const hdr = ws.addRow([...EXCEL_OFFICE_HEADERS])
  styleHeaderRow(hdr, 9, new Set([4, 6, 7, 9]))

  let lastDataRow = 1
  if (forTemplate) {
    for (let r = 2; r <= EXCEL_FORMULA_LAST_ROW; r++) {
      applyOfficeRowFormulas(ws, r)
      lastDataRow = r
    }
  } else if (rows.length === 0) {
    const row = ws.addRow(['(Chưa có dòng đã xác nhận trong tổng hợp)', '', '', '', '', '', '', '', ''])
    row.getCell(1).font = { italic: true, color: { argb: 'FF9A9890' } }
    ws.mergeCells('A2:I2')
  } else {
    let rowNum = 1
    for (const r of rows) {
      rowNum += 1
      const row = ws.addRow([
        r.equipment || '',
        normalizeCompany(r.company) || '',
        r.source || '',
        r.scope ?? '',
        r.unit || '',
        Number(r.volume) || 0,
        Number(r.ef) || 0,
        r.efRef || '',
        null,
      ])
      applyOfficeRowFormulas(ws, rowNum)
      styleDataRow(row, new Set([4, 6, 7, 9]), new Set([9]), new Set([7]))
      lastDataRow = rowNum
    }
    addSumFooter(ws, lastDataRow, [9])
  }

  if (forTemplate) {
    addCompanyColumnValidation(ws, 'B')
    addSumFooter(ws, lastDataRow, [9])
  }
  setColWidths(ws, [26, 18, 30, 10, 12, 14, 16, 28, 18])
  return lastDataRow
}

/**
 * @param {import('exceljs').Workbook} workbook
 * @param {unknown[]} trips
 * @param {{ forTemplate?: boolean }} [opts]
 */
/** Tổng chuyến = bay + mặt đất + lưu trú (kg) — cột K,L,M → N */
function applyTripRowFormulas(ws, rowNum) {
  setFormula(ws, rowNum, 14, `ROUND(K${rowNum}+L${rowNum}+M${rowNum},1)`)
}

function addTripSheet(workbook, trips, opts = {}) {
  const { forTemplate = false } = opts
  const ws = workbook.addWorksheet(EXCEL_SHEET.trip, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  })
  const hdr = ws.addRow([...EXCEL_TRIP_HEADERS])
  styleHeaderRow(hdr, 14, new Set([11, 12, 13, 14]))

  let lastDataRow = 1
  if (forTemplate) {
    for (let r = 2; r <= EXCEL_FORMULA_LAST_ROW; r++) {
      applyTripRowFormulas(ws, r)
      lastDataRow = r
    }
  } else if (trips.length === 0) {
    const row = ws.addRow(['(Chưa có chuyến công tác trong kỳ)', '', '', '', '', '', '', '', '', '', '', '', '', ''])
    row.getCell(1).font = { italic: true, color: { argb: 'FF9A9890' } }
    ws.mergeCells('A2:N2')
  } else {
    let rowNum = 1
    for (const t of trips) {
      rowNum += 1
      const rowObj = /** @type {Record<string, unknown>} */ (t)
      const row = ws.addRow([
        rowObj.name ?? '',
        rowObj.empId ?? '',
        normalizeCompany(rowObj.company) || '',
        rowObj.dept ?? '',
        rowObj.trip ?? '',
        rowObj.purpose ?? '',
        rowObj.from ?? '',
        rowObj.to ?? '',
        rowObj.dateFrom ?? '',
        rowObj.dateTo ?? '',
        Number(rowObj.co2Air) || 0,
        Number(rowObj.co2Ground) || 0,
        Number(rowObj.co2Hotel) || 0,
        null,
      ])
      applyTripRowFormulas(ws, rowNum)
      styleDataRow(row, new Set([11, 12, 13, 14]), new Set([11, 12, 13, 14]), new Set())
      lastDataRow = rowNum
    }
    addSumFooter(ws, lastDataRow, [11, 12, 13, 14])
  }

  if (forTemplate) {
    addCompanyColumnValidation(ws, 'C')
    addSumFooter(ws, lastDataRow, [11, 12, 13, 14])
  }
  setColWidths(ws, [18, 12, 18, 16, 26, 18, 16, 16, 12, 12, 14, 16, 16, 16])
  return lastDataRow
}

/**
 * @param {import('exceljs').Workbook} workbook
 * @param {unknown[]} list
 * @param {{ forTemplate?: boolean }} [opts]
 */
/**
 * Đi làm: km×2×(ngày−WFH)×EF÷carpool (kg) — F=EF, G=km, H=ngày, I=WFH, J=carpool → K
 */
function applyCommuteRowFormulas(ws, rowNum) {
  setFormula(
    ws,
    rowNum,
    11,
    `IF(J${rowNum}=0,0,ROUND(G${rowNum}*2*MAX(0,H${rowNum}-I${rowNum})*F${rowNum}/J${rowNum},1))`,
  )
}

function addCommuteSheet(workbook, list, opts = {}) {
  const { forTemplate = false } = opts
  const ws = workbook.addWorksheet(EXCEL_SHEET.commute, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  })
  const hdr = ws.addRow([...EXCEL_COMMUTE_HEADERS])
  styleHeaderRow(hdr, 11, new Set([6, 7, 8, 9, 10, 11]))

  let lastDataRow = 1
  if (forTemplate) {
    for (let r = 2; r <= EXCEL_FORMULA_LAST_ROW; r++) {
      applyCommuteRowFormulas(ws, r)
      lastDataRow = r
    }
  } else if (list.length === 0) {
    const row = ws.addRow(['(Chưa có bản ghi đi làm trong kỳ)', '', '', '', '', '', '', '', '', '', ''])
    row.getCell(1).font = { italic: true, color: { argb: 'FF9A9890' } }
    ws.mergeCells('A2:K2')
  } else {
    let rowNum = 1
    for (const c of list) {
      rowNum += 1
      const rowObj = /** @type {Record<string, unknown>} */ (c)
      const row = ws.addRow([
        rowObj.name ?? '',
        rowObj.empId ?? '',
        normalizeCompany(rowObj.company) || '',
        rowObj.dept ?? '',
        rowObj.vehicle ?? '',
        Number(rowObj.ef) || 0,
        Number(rowObj.km) || 0,
        Number(rowObj.days) || 0,
        Number(rowObj.wfh) || 0,
        Number(rowObj.carpool) || 1,
        null,
      ])
      applyCommuteRowFormulas(ws, rowNum)
      styleDataRow(row, new Set([6, 7, 8, 9, 10, 11]), new Set([11]), new Set([6]))
      lastDataRow = rowNum
    }
    addSumFooter(ws, lastDataRow, [11])
  }

  if (forTemplate) {
    addCompanyColumnValidation(ws, 'C')
    addSumFooter(ws, lastDataRow, [11])
  }
  setColWidths(ws, [18, 12, 18, 16, 28, 12, 14, 18, 16, 14, 14])
  return lastDataRow
}

/**
 * Tạo workbook .xlsx cho kỳ hiện tại: sheet tổng quan + dữ liệu có định dạng.
 * @returns {Promise<{ buffer: ArrayBuffer, filename: string }>}
 */
export async function exportCurrentPeriodExcel() {
  const ExcelJS = (await import('exceljs')).default
  const pk = currentPK()
  const m = get(currentMonth)
  const y = get(currentYear)
  const $e = get(equipRows).filter(isEquipInReport)
  const $t = get(empTrips)
  const $c = get(commuteList)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GHG Inventory'
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.properties.date1904 = false

  const offLast = addOfficeSheet(workbook, $e)
  const tripLast = addTripSheet(workbook, $t)
  const comLast = addCommuteSheet(workbook, $c)
  const sumLastRow = Math.max(offLast, tripLast, comLast, 2)
  addOverviewSheet(workbook, pk, m, y, sumLastRow)

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = `ghg_${pk}_${new Date().toISOString().slice(0, 10)}.xlsx`
  return { buffer, filename }
}

/**
 * File mẫu cùng cấu trúc sheet / cột với export (dữ liệu trống, không dòng placeholder).
 * @returns {Promise<{ buffer: ArrayBuffer, filename: string }>}
 */
export async function exportPeriodExcelTemplate() {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GHG Inventory'
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.properties.date1904 = false

  const lastRow = EXCEL_FORMULA_LAST_ROW
  addOfficeSheet(workbook, [], { forTemplate: true })
  addTripSheet(workbook, [], { forTemplate: true })
  addCommuteSheet(workbook, [], { forTemplate: true })
  addOverviewSheetTemplate(workbook, lastRow)

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = `ghg_mau_nhap_lieu_${new Date().toISOString().slice(0, 10)}.xlsx`
  return { buffer, filename }
}
