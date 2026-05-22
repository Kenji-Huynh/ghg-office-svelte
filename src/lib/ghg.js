import { writable, derived, get } from 'svelte/store'
import * as DB from './db.js'
import { EMISSION_SOURCES } from './constants.js'
import { ALL_COMPANIES, COMPANIES, matchesCompany, normalizeCompany } from './companies.js'

const now = new Date()

/** @param {number} m @param {number} y */
export function periodKey(m, y) {
  return `${y}-${String(m).padStart(2, '0')}`
}

/** Hiển thị kỳ — trùng cột Lark «Kỳ báo cáo», vd. Tháng 6 - 2026 */
export function periodLabel(m, y) {
  return `Tháng ${m} - ${y}`
}

export const currentMonth = writable(now.getMonth() + 1)
export const currentYear = writable(now.getFullYear())
export const activePage = writable(
  /** @type {'dashboard'|'office'|'employee'|'commute'|'close'} */ ('dashboard'),
)
export const selectedCompany = writable(ALL_COMPANIES)
export const dashboardMode = writable(/** @type {'month'|'year'} */ ('month'))

/** @param {'dashboard'|'office'|'employee'|'commute'|'close'} p */
export function setActivePage(p) {
  activePage.set(p)
}

export const equipRows = writable([])
export const empTrips = writable([])
export const commuteList = writable([])
export const offSettings = writable(/** @type {{ company?: string, location?: string }} */ (DB.load('ghg-offsettings') || {}))

/** @param {unknown} v */
function normText(v) {
  return String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function currentPK() {
  return periodKey(get(currentMonth), get(currentYear))
}

export function dataKey(type) {
  return `ghg-${type}-${currentPK()}`
}

export function getPeriodKeys() {
  const all = new Set()
  for (const k of DB.keys()) {
    const m = k.match(/^ghg-(?:equip|emptrips|commute)-(\d{4}-\d{2})$/)
    if (m) all.add(m[1])
  }
  all.add(currentPK())
  return [...all].sort()
}

export function loadPeriodData() {
  equipRows.set(DB.load(dataKey('equip')) || [])
  empTrips.set(DB.load(dataKey('emptrips')) || [])
  commuteList.set(DB.load(dataKey('commute')) || [])
}

export function persistEquip() {
  DB.save(dataKey('equip'), get(equipRows))
}
export function persistEmp() {
  DB.save(dataKey('emptrips'), get(empTrips))
}
export function persistCommute() {
  DB.save(dataKey('commute'), get(commuteList))
}
export function persistOffSettings() {
  DB.save('ghg-offsettings', get(offSettings))
}

/** Dòng đã ✓ vào báo cáo (mặc định true nếu không có field — tương thích dữ liệu cũ) */
export function isEquipInReport(r) {
  return r.confirmed !== false
}

export function setCompanyLocation(company, location) {
  offSettings.update((o) => ({ ...o, company, location }))
  persistOffSettings()
}

/** @param {number} m @param {number} y */
export function setPeriod(m, y) {
  currentMonth.set(m)
  currentYear.set(y)
  loadPeriodData()
}

export function shiftPeriod(delta) {
  let m = get(currentMonth) + delta
  let y = get(currentYear)
  if (m > 12) {
    m = 1
    y++
  }
  if (m < 1) {
    m = 12
    y--
  }
  setPeriod(m, y)
}

/** @param {string} id */
export function deleteEquipRow(id) {
  equipRows.update((rows) => rows.filter((r) => r.id !== id))
  persistEquip()
}

export function addEquipRow() {
  const id = Date.now().toString()
  equipRows.update((rows) => [
    ...rows,
    {
      id,
      source: '',
      equipment: '',
      unit: '',
      ef: 0,
      efRef: '',
      volume: 0,
      scope: 1,
      confirmed: false,
      company: '',
    },
  ])
  persistEquip()
}

/** @param {string} id @param {string} key @param {unknown} val */
export function updateEquip(id, key, val) {
  equipRows.update((rows) => rows.map((r) => (r.id === id ? { ...r, [key]: val } : r)))
  persistEquip()
}

/** @param {string} id @param {string} label */
export function selectSource(id, label) {
  const src = EMISSION_SOURCES.find((s) => s.label === label) || {}
  const rows = get(equipRows)
  const row = rows.find((r) => r.id === id)
  if (!row) return
  const next = { ...row, source: label }
  if (src.ef) next.ef = src.ef
  if (src.unit) next.unit = src.unit
  if (src.ref) next.efRef = src.ref
  if (src.scope !== undefined) next.scope = src.scope
  equipRows.update((rs) => rs.map((r) => (r.id === id ? next : r)))
  persistEquip()
}

/** @param {string} id */
export function deleteEmpTripById(id) {
  empTrips.update((t) => t.filter((x) => x.id !== id))
  persistEmp()
}

/** @param {Record<string, unknown>} entry */
function empTripSignature(entry) {
  return [
    normText(entry.empId),
    normText(entry.trip),
    normText(entry.dateFrom),
    normText(entry.dateTo),
    normText(entry.from),
    normText(entry.to),
  ].join('|')
}

/** @param {Record<string, unknown>} entry */
export function addEmpTrip(entry) {
  const sig = empTripSignature(entry)

  let added = false
  empTrips.update((t) => {
    const dup = t.some((x) => empTripSignature(x) === sig)
    if (dup) return t
    added = true
    return [entry, ...t]
  })
  persistEmp()
  return added
}

/** @param {string} id @param {Record<string, unknown>} entry */
export function updateEmpTripById(id, entry) {
  const sig = empTripSignature(entry)
  let updated = false
  empTrips.update((t) => {
    const dup = t.some((x) => x.id !== id && empTripSignature(x) === sig)
    if (dup) return t
    updated = true
    return t.map((x) => (x.id === id ? { ...entry, id } : x))
  })
  persistEmp()
  return updated
}

/** @param {string} id */
export function deleteCommuteById(id) {
  commuteList.update((c) => c.filter((x) => x.id !== id))
  persistCommute()
}

/** @param {Record<string, unknown>} entry */
export function upsertCommute(entry) {
  commuteList.update((list) => {
    const i = list.findIndex((c) => c.empId === entry.empId)
    if (i >= 0) {
      const copy = [...list]
      copy[i] = entry
      return copy
    }
    return [...list, entry]
  })
  persistCommute()
}

/**
 * @param {unknown[]} equip
 * @param {unknown[]} trips
 * @param {unknown[]} commute
 * @param {string} companyFilter
 */
export function computeDashData(equip, trips, commute, companyFilter = '') {
  const e = equip.filter((/** @type {{ company?: string }} */ r) => matchesCompany(r.company, companyFilter))
  const t = trips.filter((/** @type {{ company?: string }} */ x) => matchesCompany(x.company, companyFilter))
  const c = commute.filter((/** @type {{ company?: string }} */ x) => matchesCompany(x.company, companyFilter))

  const rep = e.filter(isEquipInReport)
  const s1 = rep
    .filter((r) => r.scope === 1)
    .reduce((s, r) => s + (r.volume && r.ef ? (r.volume * r.ef) / 1000 : 0), 0)
  const s2 = rep
    .filter((r) => r.scope === 2)
    .reduce((s, r) => s + (r.volume && r.ef ? (r.volume * r.ef) / 1000 : 0), 0)
  const s3Trip = t.reduce((s, x) => s + (x.co2Total || 0) / 1000, 0)
  const s3Comm = c.reduce((s, x) => s + (x.co2 || 0) / 1000, 0)
  const s3 = s3Trip + s3Comm
  const total = s1 + s2 + s3
  const fmt = (n) => n.toFixed(3)

  const sources = [
    ['Đốt nhiên liệu (S1)', s1, '#C0392B'],
    ['Điện & hơi nước (S2)', s2, '#B85C00'],
    ['Công tác (S3.6)', s3Trip, '#1B4F8A'],
    ['Đi làm hàng ngày (S3.7)', s3Comm, '#1A6B3C'],
  ].filter((x) => x[1] > 0)
  const maxS = Math.max(...sources.map((s) => s[1]), 0.001)

  const allItems = [
    ...rep
      .filter((r) => r.volume && r.ef)
      .map((r) => ({ label: r.equipment || r.source || 'Thiết bị', val: (r.volume * r.ef) / 1000 })),
    ...t.map((x) => ({ label: `${x.trip} (${x.name})`, val: x.co2Total / 1000 })),
    ...c.map((x) => ({ label: `Đi làm: ${x.name}`, val: x.co2 / 1000 })),
  ]
    .sort((a, b) => b.val - a.val)
    .slice(0, 6)
  const maxA = Math.max(...allItems.map((a) => a.val), 0.001)

  const deptMap = {}
  for (const x of t) {
    deptMap[x.dept] = (deptMap[x.dept] || 0) + (x.co2Total || 0) / 1000
  }
  for (const x of c) {
    const d = x.dept || 'Khác'
    deptMap[d] = (deptMap[d] || 0) + (x.co2 / 1000)
  }
  const deptArr = Object.entries(deptMap).sort((a, b) => b[1] - a[1])
  const maxD = Math.max(...deptArr.map((d) => d[1]), 0.001)

  const offItems = rep
    .filter((r) => r.volume && r.ef)
    .map((r) => ({
      label: r.equipment || r.source || '—',
      val: (r.volume * r.ef) / 1000,
      scope: r.scope,
    }))
  const maxO = Math.max(...offItems.map((o) => o.val), 0.001)

  return {
    total: fmt(total),
    s1: fmt(s1),
    s2: fmt(s2),
    s3: fmt(s3),
    sources,
    maxS,
    totalTon: total,
    allItems,
    maxA,
    deptArr,
    maxD,
    offItems,
    maxO,
  }
}

/** Dashboard kỳ tháng hiện tại + lọc công ty */
export const dash = derived(
  [equipRows, empTrips, commuteList, selectedCompany],
  ([$e, $t, $c, $co]) => computeDashData($e, $t, $c, $co),
)

/** Dashboard tổng hợp theo năm (mọi tháng trong năm đang chọn) */
export const dashYear = derived(
  [currentYear, selectedCompany],
  ([$y, $co]) => {
    const prefix = `${$y}-`
    let equip = []
    let trips = []
    let commute = []
    for (const pk of getPeriodKeys().filter((k) => k.startsWith(prefix))) {
      equip = equip.concat(DB.load(`ghg-equip-${pk}`) || [])
      trips = trips.concat(DB.load(`ghg-emptrips-${pk}`) || [])
      commute = commute.concat(DB.load(`ghg-commute-${pk}`) || [])
    }
    const monthly = []
    for (let m = 1; m <= 12; m++) {
      const pk = periodKey(m, $y)
      const d = computeDashData(
        DB.load(`ghg-equip-${pk}`) || [],
        DB.load(`ghg-emptrips-${pk}`) || [],
        DB.load(`ghg-commute-${pk}`) || [],
        $co,
      )
      monthly.push({ month: m, pk, total: d.totalTon, label: periodLabel(m, $y) })
    }
    const agg = computeDashData(equip, trips, commute, $co)
    const maxM = Math.max(...monthly.map((x) => x.total), 0.001)
    return { ...agg, monthly, maxM, year: $y }
  },
)

/** @param {string} pk */
export function periodTotalsForKey(pk) {
  const eq = (DB.load(`ghg-equip-${pk}`) || []).filter(isEquipInReport)
  const tr = DB.load(`ghg-emptrips-${pk}`) || []
  const cm = DB.load(`ghg-commute-${pk}`) || []
  const s12 = eq.reduce((s, r) => s + (r.volume && r.ef ? (r.volume * r.ef) / 1000 : 0), 0)
  const s3 =
    tr.reduce((s, t) => s + (t.co2Total || 0) / 1000, 0) + cm.reduce((s, c) => s + (c.co2 || 0) / 1000, 0)
  return { s12, s3, total: s12 + s3 }
}

export function exportAllCSV() {
  const pk = currentPK()
  const $e = get(equipRows)
  const $t = get(empTrips)
  const $c = get(commuteList)
  const m = get(currentMonth)
  const y = get(currentYear)
  let csv = `Kỳ báo cáo: ${periodLabel(m, y)}\n\n`
  csv += '=== STATIONARY COMBUSTION (SCOPE 1 & 2) ===\n'
  csv +=
    'Thiết bị,Công ty,Nguồn phát thải,Scope,Đơn vị,Khối lượng,EF (kg),EF Reference,Tổng GHG (tấn CO₂e)\n'
  for (const r of $e.filter(isEquipInReport)) {
    const tot = r.volume && r.ef ? +((r.volume * r.ef) / 1000).toFixed(6) : 0
    csv += `"${r.equipment || ''}","${normalizeCompany(r.company) || ''}","${r.source || ''}",${r.scope},"${r.unit || ''}",${r.volume || 0},${r.ef || 0},"${r.efRef || ''}",${tot}\n`
  }
  csv += '\n=== CHUYẾN CÔNG TÁC NHÂN VIÊN (SCOPE 3.6) ===\n'
  csv += 'Họ tên,Mã NV,Công ty,Phòng ban,Chuyến đi,Từ,Đến,Ngày đi,CO₂ Bay (kg),CO₂ Xe/Tàu (kg),CO₂ KS (kg),Tổng (kg)\n'
  for (const t of $t) {
    csv += `"${t.name}","${t.empId}","${normalizeCompany(t.company) || ''}","${t.dept}","${t.trip}","${t.from || ''}","${t.to || ''}","${t.dateFrom || ''}",${t.co2Air || 0},${t.co2Ground || 0},${t.co2Hotel || 0},${t.co2Total || 0}\n`
  }
  csv += '\n=== ĐI LÀM HÀNG NGÀY (SCOPE 3.7) ===\n'
  csv += 'Họ tên,Mã NV,Công ty,Phòng ban,Phương tiện,Km 1 chiều,Ngày/tháng,WFH/tháng,Carpool,CO₂e (kg)\n'
  for (const c of $c) {
    csv += `"${c.name}","${c.empId}","${normalizeCompany(c.company) || ''}","${c.dept || ''}","${c.vehicle}",${c.km},${c.days},${c.wfh || 0},${c.carpool || 1},${c.co2 || 0}\n`
  }
  return { csv: '\uFEFF' + csv, filename: `ghg_${pk}_${new Date().toISOString().slice(0, 10)}.csv` }
}

export function exportBackupJSON() {
  const allData = {
    schemaVersion: 2,
    companies: [...COMPANIES],
    offSettings: get(offSettings),
    exportedAt: new Date().toISOString(),
    periods: {},
  }
  for (const pk of getPeriodKeys()) {
    allData.periods[pk] = {
      equip: DB.load(`ghg-equip-${pk}`) || [],
      emptrips: DB.load(`ghg-emptrips-${pk}`) || [],
      commute: DB.load(`ghg-commute-${pk}`) || [],
    }
  }
  return {
    json: JSON.stringify(allData, null, 2),
    filename: `ghg_backup_${new Date().toISOString().slice(0, 10)}.json`,
  }
}

/** @param {unknown} data */
export function importBackup(data) {
  if (data && typeof data === 'object' && 'periods' in data && data.periods) {
    for (const [pk, d] of Object.entries(data.periods)) {
      const row = /** @type {{ equip?: unknown, emptrips?: unknown, commute?: unknown }} */ (d)
      if (row.equip) DB.save(`ghg-equip-${pk}`, row.equip)
      if (row.emptrips) DB.save(`ghg-emptrips-${pk}`, row.emptrips)
      if (row.commute) DB.save(`ghg-commute-${pk}`, row.commute)
    }
  } else {
    const legacy = /** @type {{ equipRows?: unknown, empTrips?: unknown, commuteList?: unknown }} */ (data)
    if (legacy.equipRows) DB.save(dataKey('equip'), legacy.equipRows)
    if (legacy.empTrips) DB.save(dataKey('emptrips'), legacy.empTrips)
    if (legacy.commuteList) DB.save(dataKey('commute'), legacy.commuteList)
  }
  if (data && typeof data === 'object' && 'offSettings' in data && data.offSettings) {
    const os = /** @type {{ company?: string, location?: string }} */ (data).offSettings
    offSettings.set({
      company: normalizeCompany(os.company) || os.company || '',
      location: os.location ?? '',
    })
    DB.save('ghg-offsettings', get(offSettings))
  }
  loadPeriodData()
}

export function downloadText(content, filename, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** @param {BlobPart} data */
export function downloadBlob(data, filename, type) {
  const blob = new Blob([data], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

loadPeriodData()
