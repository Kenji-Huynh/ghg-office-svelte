<script>
  import { EMISSION_SOURCES, UNIT_OPTIONS } from '../lib/constants.js'
  import { COMPANIES, isValidCompany, matchesCompany } from '../lib/companies.js'
  import CompanySelect from './CompanySelect.svelte'
  import CompanyFilterBadge from './CompanyFilterBadge.svelte'
  import RowActionIcons from './RowActionIcons.svelte'
  import { get } from 'svelte/store'
  import {
    equipRows,
    offSettings,
    periodLabel,
    currentMonth,
    currentYear,
    setCompanyLocation,
    deleteEquipRow,
    addEquipRow,
    updateEquip,
    selectSource,
    isEquipInReport,
    selectedCompany,
  } from '../lib/ghg.js'
  import { confirmDanger, toastOk, confirmAction, toastErr } from '../lib/notify.js'

  let location = $state('')
  let defaultCompany = $state(COMPANIES[0])

  $effect(() => {
    const saved = $offSettings.company ?? ''
    if (isValidCompany(saved)) defaultCompany = saved
    location = $offSettings.location ?? ''
  })

  $effect(() => {
    if ($selectedCompany) defaultCompany = $selectedCompany
  })

  $effect(() => {
    if (!isValidCompany(defaultCompany)) return
    setCompanyLocation(defaultCompany, location)
  })

  function persistLocation() {
    if (!isValidCompany(defaultCompany)) return
    setCompanyLocation(defaultCompany, location)
  }

  const visibleEquipRows = $derived.by(() => {
    if (!$selectedCompany) return $equipRows
    return $equipRows.filter((r) => matchesCompany(r.company, $selectedCompany))
  })

  const officeTotals = $derived.by(() => {
    let s1 = 0
    let s2 = 0
    for (const r of visibleEquipRows) {
      if (!isEquipInReport(r)) continue
      const t = r.volume && r.ef ? (r.volume * r.ef) / 1000 : 0
      if (r.scope === 1) s1 += t
      else s2 += t
    }
    return { s1, s2 }
  })

  const confirmedEquipRows = $derived(visibleEquipRows.filter(isEquipInReport))

  /** Chỉ các dòng đang nhập (chưa ✓ vào tổng hợp) */
  const draftEquipRows = $derived(visibleEquipRows.filter((r) => r.confirmed === false))

  async function onDeleteRow(id) {
    const ok = await confirmDanger('Xóa dòng thiết bị?', 'Hành động này không thể hoàn tác.', 'Xóa')
    if (!ok) return
    deleteEquipRow(id)
    toastOk('Đã xóa dòng thiết bị')
  }

  async function onDeleteFromSummary(id) {
    const ok = await confirmDanger(
      'Xóa khỏi tổng hợp?',
      'Dòng sẽ bị xóa hoàn toàn khỏi kỳ báo cáo.',
      'Xóa',
    )
    if (!ok) return
    deleteEquipRow(id)
    toastOk('Đã xóa khỏi tổng hợp')
  }

  function onEditFromSummary(id) {
    updateEquip(id, 'confirmed', false)
    toastOk('Đã đưa dòng lên phần nhập phía trên để chỉnh sửa')
  }

  function onAddRow() {
    addEquipRow()
    const rows = get(equipRows)
    const last = rows[rows.length - 1]
    if (last) updateEquip(last.id, 'company', defaultCompany)
  }

  async function onConfirmRow(row) {
    if (!row.source?.trim()) {
      toastErr('Vui lòng chọn nguồn phát thải')
      return
    }
    if (!row.ef || row.ef <= 0) {
      toastErr('Vui lòng nhập hệ số phát thải (EF) hợp lệ')
      return
    }
    if (!row.volume || row.volume <= 0) {
      toastErr('Vui lòng nhập khối lượng lớn hơn 0')
      return
    }
    if (!isValidCompany(row.company || defaultCompany)) {
      toastErr('Vui lòng chọn công ty')
      return
    }
    const ok = await confirmAction('Bạn có muốn thêm vào tổng hợp?', '')
    if (!ok) return
    updateEquip(row.id, 'confirmed', true)
    toastOk('Đã thêm dòng vào bảng tổng hợp phía dưới')
  }
</script>

<div class="page-title">Stationary Combustion — Văn phòng</div>
<div class="page-sub">
  Nguồn phát thải cố định tại văn phòng / nhà máy · Scope 1 (đốt trực tiếp) & Scope 2 (điện mua ngoài)
</div>

<div class="card">
  <div class="card-head">
    <div class="card-head-left"><div class="card-title">Thông tin kỳ báo cáo</div></div>
  </div>
  <div class="card-body g3">
    <div class="field">
      <label>Kỳ báo cáo</label>
      <input
        type="text"
        readonly
        value={periodLabel($currentMonth, $currentYear)}
        style="background: var(--surface2); color: var(--text2); cursor: default"
      />
    </div>
    <div class="field">
      <label>Địa điểm / Cơ sở</label>
      <input type="text" placeholder="Tòa nhà XYZ, Q.1, TP.HCM" bind:value={location} oninput={persistLocation} />
    </div>
    <div class="field">
      <label>Công ty (mặc định dòng mới)</label>
      <CompanySelect bind:value={defaultCompany} hideLabel={true} required={true} id="office-default-company" />
    </div>
  </div>
</div>

<div class="card">
  <div class="card-head">
    <div class="card-head-left">
      <div class="card-title">Danh sách thiết bị / nguồn phát thải</div>
      <CompanyFilterBadge />
      <span class="card-scope scope-s1" style="background:#fdecea;color:#c0392b">SCOPE 1 & 2</span>
    </div>
    <button type="button" class="btn btn-add" onclick={onAddRow}>+ Thêm dòng thiết bị</button>
  </div>
  <div class="card-body eq-equipment-body">
    <div class="eq-grid eq-grid-header">
      <span>#</span>
      <span>Thiết bị</span>
      <span>Công ty</span>
      <span>Nguồn phát thải</span>
      <span>Đơn vị</span>
      <span>EF (kgCO₂e)</span>
      <span>EF Reference</span>
      <span>Khối lượng</span>
      <span class="eq-header-confirm">Xác nhận</span>
      <span class="eq-header-del">Xóa</span>
    </div>
    {#if draftEquipRows.length === 0}
      <div class="empty">
        <div class="empty-icon">⚙️</div>
        {#if $equipRows.length === 0}
          Chưa có thiết bị nào. Nhấn "+ Thêm dòng thiết bị" để bắt đầu.
        {:else}
          Không có dòng đang nhập — các dòng đã xác nhận nằm ở bảng tổng hợp bên dưới. Nhấn "+ Thêm dòng thiết bị" hoặc
          <strong>Sửa</strong> một dòng ở bảng dưới để chỉnh lại.
        {/if}
      </div>
    {:else}
      {#each draftEquipRows as row, i (row.id)}
        {@const total = row.volume && row.ef ? (row.volume * row.ef) / 1000 : 0}
        <div class="eq-row">
          <div class="eq-grid">
            <span
              style="font-family:var(--mono);font-size:11px;background:var(--text);color:#fff;border-radius:4px;padding:2px 7px;text-align:center"
              >{i + 1}</span
            >
            <input
              class="eq-span"
              type="text"
              placeholder="Máy lạnh, máy phát..."
              value={row.equipment}
              onchange={(e) => updateEquip(row.id, 'equipment', e.currentTarget.value)}
            />
            <select
              class="eq-span company-select"
              value={row.company || defaultCompany}
              onchange={(e) => updateEquip(row.id, 'company', e.currentTarget.value)}
              required
              aria-label="Công ty"
            >
              {#each COMPANIES as co}
                <option value={co}>{co}</option>
              {/each}
            </select>
            <select
              class="eq-span"
              value={row.source}
              onchange={(e) => selectSource(row.id, e.currentTarget.value)}
            >
              <option value="">-- Chọn nguồn --</option>
              {#each EMISSION_SOURCES as s}
                <option value={s.label}>{s.label}</option>
              {/each}
            </select>
            <select
              value={row.unit}
              onchange={(e) => updateEquip(row.id, 'unit', e.currentTarget.value)}
            >
              {#each UNIT_OPTIONS as u}
                <option>{u}</option>
              {/each}
            </select>
            <input
              type="number"
              placeholder="EF"
              value={row.ef || ''}
              step="any"
              onchange={(e) => updateEquip(row.id, 'ef', +e.currentTarget.value)}
            />
            <input
              class="eq-span"
              type="text"
              placeholder="DEFRA 2023 / MONRE VN..."
              value={row.efRef}
              onchange={(e) => updateEquip(row.id, 'efRef', e.currentTarget.value)}
            />
            <input
              type="number"
              placeholder="Khối lượng"
              value={row.volume || ''}
              min="0"
              step="any"
              onchange={(e) => updateEquip(row.id, 'volume', +e.currentTarget.value)}
            />
            <div class="eq-confirm-cell">
              <button
                type="button"
                class="btn-tick"
                title="Xác nhận và thêm vào bảng tổng hợp bên dưới"
                aria-label="Xác nhận dòng thiết bị"
                onclick={() => onConfirmRow(row)}
              >
                ✓
              </button>
            </div>
            <RowActionIcons onDelete={() => onDeleteRow(row.id)} deleteTitle="Xóa dòng nháp" />
          </div>
          <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="badge {row.scope === 1 ? 'scope-s1' : 'scope-s2'}">Scope {row.scope}</span>
            <span class="eq-draft-pill">Chưa xác nhận</span>
            {#if total > 0}
              <span style="font-size:11px;color:var(--text3);font-family:var(--mono)">
                {row.volume} {row.unit} × {row.ef} kg/unit ÷ 1000 = {total.toFixed(4)} tấn CO₂e
              </span>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<div class="card">
  <div class="card-head">
    <div class="card-head-left">
      <div class="card-title">Tổng hợp phát thải văn phòng</div>
      <CompanyFilterBadge />
    </div>
  </div>
  <div class="card-body">
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Thiết bị</th>
            <th>Công ty</th>
            <th>Nguồn phát thải</th>
            <th>Scope</th>
            <th>Đơn vị</th>
            <th>Khối lượng</th>
            <th>EF</th>
            <th>Tổng GHG (tấn CO₂e)</th>
            <th class="eq-summary-actions-th">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {#if confirmedEquipRows.length === 0}
            <tr>
              <td colspan="9" style="text-align:center;color:var(--text3);padding:1.5rem">
                {#if $equipRows.length === 0}
                  Chưa có dữ liệu
                {:else if draftEquipRows.length > 0}
                  Chưa có dòng trong tổng hợp. Nhấn ✓ ở các dòng phía trên để đưa vào đây.
                {:else}
                  Chưa có dòng đã xác nhận.
                {/if}
              </td>
            </tr>
          {:else}
            {#each confirmedEquipRows as r}
              {@const tot = r.volume && r.ef ? (r.volume * r.ef) / 1000 : 0}
              <tr>
                <td>{r.equipment || '—'}</td>
                <td>{r.company || '—'}</td>
                <td>{r.source || '—'}</td>
                <td>
                  <span class="badge {r.scope === 1 ? 'scope-s1' : 'scope-s2'}">Scope {r.scope}</span>
                </td>
                <td>{r.unit || '—'}</td>
                <td class="num">{r.volume || 0}</td>
                <td class="num">{r.ef || 0}</td>
                <td class="num" style="font-weight:600;color:var(--accent)">{tot.toFixed(4)}</td>
                <td class="eq-summary-actions">
                  <RowActionIcons
                    onEdit={() => onEditFromSummary(r.id)}
                    onDelete={() => onDeleteFromSummary(r.id)}
                    editTitle="Sửa — đưa lên phần nhập phía trên"
                    deleteTitle="Xóa khỏi tổng hợp"
                  />
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
    <div style="margin-top:1rem;display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <span style="font-size:13px;color:var(--text2)">Tổng Scope 1:</span>
      <span class="badge badge-r">{officeTotals.s1.toFixed(4)} tấn CO₂e</span>
      <span style="font-size:13px;color:var(--text2)">Tổng Scope 2:</span>
      <span class="badge badge-a">{officeTotals.s2.toFixed(4)} tấn CO₂e</span>
    </div>
  </div>
</div>
