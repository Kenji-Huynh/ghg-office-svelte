import * as DB from './db.js'
import { matchesCompany } from './companies.js'
import { periodKey, periodLabel } from './ghg.js'

function getPeriodKeys() {
  const all = new Set()
  for (const k of DB.keys()) {
    const m = k.match(/^ghg-(?:equip|emptrips|commute)-(\d{4}-\d{2})$/)
    if (m) all.add(m[1])
  }
  const now = new Date()
  all.add(periodKey(now.getMonth() + 1, now.getFullYear()))
  return [...all].sort()
}

/** @param {{ confirmed?: boolean }} r */
function isEquipInReport(r) {
  return r.confirmed !== false
}

const SNAPSHOTS_KEY = 'ghg-period-snapshots'

/** @typedef {'month'|'year'} SnapshotType */
/** @typedef {{ id: string, type: SnapshotType, periodKey: string, label: string, closedAt: string, equip: unknown[], emptrips: unknown[], commute: unknown[], totals: { s1: number, s2: number, s3: number, total: number } }} PeriodSnapshot */

/** @returns {PeriodSnapshot[]} */
export function loadSnapshots() {
  return DB.load(SNAPSHOTS_KEY) || []
}

/** @param {PeriodSnapshot[]} list */
function saveSnapshots(list) {
  DB.save(SNAPSHOTS_KEY, list)
}

/** @param {string} pk @param {SnapshotType} type */
export function hasSnapshot(pk, type) {
  return loadSnapshots().some((s) => s.periodKey === pk && s.type === type)
}

/** @param {string} pk */
function readPeriodRaw(pk) {
  return {
    equip: DB.load(`ghg-equip-${pk}`) || [],
    emptrips: DB.load(`ghg-emptrips-${pk}`) || [],
    commute: DB.load(`ghg-commute-${pk}`) || [],
  }
}

/** @param {unknown[]} equip @param {unknown[]} trips @param {unknown[]} commute */
function totalsFromRows(equip, trips, commute) {
  const rep = equip.filter(isEquipInReport)
  const s1 = rep
    .filter((/** @type {{ scope?: number }} */ r) => r.scope === 1)
    .reduce((s, /** @type {{ volume?: number, ef?: number }} */ r) => s + (r.volume && r.ef ? (r.volume * r.ef) / 1000 : 0), 0)
  const s2 = rep
    .filter((/** @type {{ scope?: number }} */ r) => r.scope === 2)
    .reduce((s, /** @type {{ volume?: number, ef?: number }} */ r) => s + (r.volume && r.ef ? (r.volume * r.ef) / 1000 : 0), 0)
  const s3Trip = trips.reduce(
    (s, /** @type {{ co2Total?: number }} */ t) => s + (t.co2Total || 0) / 1000,
    0,
  )
  const s3Comm = commute.reduce((s, /** @type {{ co2?: number }} */ c) => s + (c.co2 || 0) / 1000, 0)
  const s3 = s3Trip + s3Comm
  return { s1, s2, s3, total: s1 + s2 + s3 }
}

/**
 * @param {SnapshotType} type
 * @param {string} pkOrYear e.g. 2026-05 or 2026
 * @param {string} label
 */
export function createSnapshot(type, pkOrYear, label) {
  if (hasSnapshot(pkOrYear, type)) return null

  let equip = []
  let emptrips = []
  let commute = []

  if (type === 'month') {
    const raw = readPeriodRaw(pkOrYear)
    equip = raw.equip
    emptrips = raw.emptrips
    commute = raw.commute
  } else {
    const prefix = `${pkOrYear}-`
    for (const pk of getPeriodKeys().filter((k) => k.startsWith(prefix))) {
      const raw = readPeriodRaw(pk)
      equip = equip.concat(raw.equip)
      emptrips = emptrips.concat(raw.emptrips)
      commute = commute.concat(raw.commute)
    }
  }

  const snap = {
    id: `${type}-${pkOrYear}-${Date.now()}`,
    type,
    periodKey: pkOrYear,
    label,
    closedAt: new Date().toISOString(),
    equip: JSON.parse(JSON.stringify(equip)),
    emptrips: JSON.parse(JSON.stringify(emptrips)),
    commute: JSON.parse(JSON.stringify(commute)),
    totals: totalsFromRows(equip, emptrips, commute),
  }
  saveSnapshots([snap, ...loadSnapshots()])
  return snap
}

/** Tự đóng kỳ: ngày 30 hàng tháng; năm vào 30/12 */
export function runScheduledSnapshots() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const d = now.getDate()
  const created = []

  if (d >= 30) {
    const pk = periodKey(m, y)
    if (!hasSnapshot(pk, 'month')) {
      const s = createSnapshot('month', pk, periodLabel(m, y))
      if (s) created.push(s)
    }
  }

  if (m === 12 && d >= 30) {
    const yearKey = String(y)
    if (!hasSnapshot(yearKey, 'year')) {
      const s = createSnapshot('year', yearKey, `Năm ${y}`)
      if (s) created.push(s)
    }
  }

  return created
}

/** @param {string} id */
export function deleteSnapshot(id) {
  saveSnapshots(loadSnapshots().filter((s) => s.id !== id))
}

/** @param {PeriodSnapshot} snap @param {string} companyFilter */
export function snapshotTotalsForCompany(snap, companyFilter) {
  const eq = snap.equip.filter((/** @type {{ company?: string }} */ r) => matchesCompany(r.company, companyFilter))
  const tr = snap.emptrips.filter((/** @type {{ company?: string }} */ t) => matchesCompany(t.company, companyFilter))
  const cm = snap.commute.filter((/** @type {{ company?: string }} */ c) => matchesCompany(c.company, companyFilter))
  return totalsFromRows(eq, tr, cm)
}
