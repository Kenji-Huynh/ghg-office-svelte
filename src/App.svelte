<script>
  import { get } from 'svelte/store'
  import {
    currentMonth,
    currentYear,
    activePage,
    setPeriod,
    setActivePage,
    getPeriodKeys,
    shiftPeriod,
    exportBackupJSON,
    downloadText,
    downloadBlob,
    importBackup,
    currentPK,
    periodLabel,
    periodTotalsForKey,
    selectedCompany,
  } from './lib/ghg.js'
  import CompanySelect from './components/CompanySelect.svelte'
  import { exportCurrentPeriodExcel, exportPeriodExcelTemplate } from './lib/exportPeriodExcel.js'
  import {
    previewPeriodExcelImport,
    importPeriodExcelAndApply,
  } from './lib/importPeriodExcel.js'
  import { toastOk, confirmAction, confirmImportExcelMode, toastErr } from './lib/notify.js'
  import Dashboard from './components/Dashboard.svelte'
  import OfficePage from './components/OfficePage.svelte'
  import EmployeePage from './components/EmployeePage.svelte'
  import CommutePage from './components/CommutePage.svelte'
  import LarkSyncModal from './components/LarkSyncModal.svelte'
  import ClosePeriodPage from './components/ClosePeriodPage.svelte'

  let showPeriodsModal = $state(false)
  let showLarkModal = $state(false)
  /** @type {HTMLInputElement | undefined} */
  let importInput = $state()
  /** @type {HTMLInputElement | undefined} */
  let importExcelInput = $state()

  const yearOptions = $derived.by(() => {
    const y = new Date().getFullYear()
    const arr = []
    for (let i = y - 3; i <= y + 2; i++) arr.push(i)
    return arr
  })

  /** @param {Event} e */
  function onMonthChange(e) {
    const m = +/** @type {HTMLSelectElement} */ (e.currentTarget).value
    setPeriod(m, get(currentYear))
    toastOk(`Đã chuyển sang ${periodLabel(m, get(currentYear))}`)
  }

  /** @param {Event} e */
  function onYearChange(e) {
    const y = +/** @type {HTMLSelectElement} */ (e.currentTarget).value
    setPeriod(get(currentMonth), y)
    toastOk(`Đã chuyển sang ${periodLabel(get(currentMonth), y)}`)
  }

  async function shift(delta) {
    shiftPeriod(delta)
    toastOk(`Đã chuyển sang ${periodLabel(get(currentMonth), get(currentYear))}`)
  }

  async function exportExcel() {
    try {
      const { buffer, filename } = await exportCurrentPeriodExcel()
      downloadBlob(
        buffer,
        filename,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      toastOk(`Đã xuất Excel — ${periodLabel(get(currentMonth), get(currentYear))}`)
    } catch (err) {
      console.error(err)
      toastErr('Không tạo được file Excel. Vui lòng thử lại.')
    }
  }

  async function downloadExcelTemplate() {
    try {
      const { buffer, filename } = await exportPeriodExcelTemplate()
      downloadBlob(
        buffer,
        filename,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      toastOk('Đã tải mẫu Excel — điền dữ liệu rồi dùng Import Excel')
    } catch (err) {
      console.error(err)
      toastErr('Không tạo được file mẫu.')
    }
  }

  function triggerExcelImport() {
    importExcelInput?.click()
  }

  /** @param {Event} e */
  async function onImportExcelFile(e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget)
    const file = input.files?.[0]
    if (!file) return
    try {
      const buf = await file.arrayBuffer()
      const { html } = await previewPeriodExcelImport(buf)
      const mode = await confirmImportExcelMode(html)
      if (!mode) {
        input.value = ''
        return
      }
      const r = await importPeriodExcelAndApply(buf, { mode })
      const added = []
      if (r.addedEquip > 0) added.push(`+${r.addedEquip} văn phòng`)
      if (r.addedTrips > 0) added.push(`+${r.addedTrips} chuyến CT`)
      if (r.addedCommutes > 0) added.push(`+${r.addedCommutes} đi làm`)
      const skipped = []
      if (r.skippedEquip > 0) skipped.push(`VP trùng: ${r.skippedEquip}`)
      if (r.skippedTrips > 0) skipped.push(`CT trùng: ${r.skippedTrips}`)
      if (r.skippedCommutes > 0) skipped.push(`Đi làm trùng: ${r.skippedCommutes}`)
      const modeLabel = mode === 'replace' ? 'Thay thế' : 'Gộp thêm'
      let msg = `${modeLabel}: ${added.length ? added.join(' · ') : 'không có dòng mới'}`
      if (skipped.length) msg += ` (${skipped.join(' · ')})`
      if (r.warnings.length) {
        toastOk(msg)
        toastErr(`Cảnh báo: ${r.warnings.slice(0, 2).join(' · ')}${r.warnings.length > 2 ? '…' : ''}`)
      } else {
        toastOk(msg)
      }
    } catch (err) {
      console.error(err)
      toastErr(/** @type {Error} */ (err).message || 'Import Excel thất bại')
    }
    input.value = ''
  }

  function exportJson() {
    const { json, filename } = exportBackupJSON()
    downloadText(json, filename, 'application/json')
    toastOk(`Đã backup toàn bộ ${getPeriodKeys().length} kỳ ra JSON`)
  }

  function triggerImport() {
    importInput?.click()
  }

  /** @param {Event} e */
  async function onImportFile(e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget)
    const file = input.files?.[0]
    if (!file) return
    const ok = await confirmAction(
      'Khôi phục dữ liệu từ file?',
      'Dữ liệu trong file sẽ ghi đè lên localStorage theo từng kỳ. Nên backup JSON trước khi import.',
    )
    if (!ok) {
      input.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(/** @type {string} */ (reader.result))
        importBackup(data)
        toastOk('Import thành công — đã khôi phục dữ liệu')
      } catch {
        toastErr('File không hợp lệ')
      }
      input.value = ''
    }
    reader.readAsText(file)
  }

  function jumpToPeriod(/** @type {number} */ m, /** @type {number} */ y) {
    showPeriodsModal = false
    setPeriod(m, y)
    toastOk(`Đã chuyển sang ${periodLabel(m, y)}`)
  }
</script>

<input
  bind:this={importInput}
  type="file"
  accept=".json"
  style="display:none"
  onchange={onImportFile}
/>

<input
  bind:this={importExcelInput}
  type="file"
  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  style="display:none"
  onchange={onImportExcelFile}
/>

<div class="top-bar">
  <div class="logo">GHG<span>.</span>INVENTORY</div>
  <div class="period-controls">
    <button type="button" class="btn-period" onclick={() => shift(-1)} aria-label="Kỳ trước">‹</button>
    <select value={$currentMonth} onchange={onMonthChange}>
      {#each Array(12) as _, i}
        <option value={i + 1}>Tháng {i + 1}</option>
      {/each}
    </select>
    <select value={$currentYear} onchange={onYearChange}>
      {#each yearOptions as y}
        <option value={y}>{y}</option>
      {/each}
    </select>
    <button type="button" class="btn-period" onclick={() => shift(1)} aria-label="Kỳ sau">›</button>
    <span class="period-active" title="Mọi dữ liệu nhập / lưu / Lark đều thuộc kỳ này">
      Kỳ đang làm: <strong>{periodLabel($currentMonth, $currentYear)}</strong>
    </span>
    <span class="period-badge" title="Số kỳ đã có dữ liệu">{getPeriodKeys().length} kỳ</span>
    <CompanySelect
      bind:value={$selectedCompany}
      showAll={true}
      hideLabel={true}
      compact={true}
      id="global-company"
      title="Lọc theo công ty — Tất cả công ty = xem hết"
    />
  </div>
  <aside class="top-bar-right data-toolbar" aria-label="Xuất báo cáo và sao lưu dữ liệu">
    <p class="data-toolbar-hint">
      Excel: xuất / mẫu / import kỳ này · JSON: backup toàn bộ kỳ
    </p>
    <div class="data-toolbar-row">
      <button
        type="button"
        class="btn-data btn-data--excel"
        title="Workbook Excel: Tổng quan, Văn phòng S1–S2, Chuyến công tác, Đi làm"
        onclick={exportExcel}
      >
        Xuất Excel (.xlsx)
      </button>
      <button
        type="button"
        class="btn-data"
        title="File trống cùng sheet và tiêu đề cột với bản xuất — dùng để nhập tay"
        onclick={downloadExcelTemplate}
      >
        Mẫu Excel
      </button>
      <button
        type="button"
        class="btn-data"
        title="Upload file .xlsx (mẫu / xuất) — xem trước, gộp thêm hoặc thay thế theo sheet"
        onclick={triggerExcelImport}
      >
        Import Excel
      </button>
      <button
        type="button"
        class="btn-data"
        title="Gồm mọi kỳ đã có dữ liệu và thông tin công ty / cơ sở"
        onclick={exportJson}
      >
        Backup JSON
      </button>
      <button
        type="button"
        class="btn-data"
        title="Chọn file backup — sẽ ghi đè dữ liệu local theo từng kỳ trong file"
        onclick={triggerImport}
      >
        Khôi phục JSON
      </button>
      <span class="data-toolbar-sep" aria-hidden="true"></span>
      <button type="button" class="btn-data btn-data--ghost" onclick={() => (showPeriodsModal = true)}>
        Các kỳ báo cáo
        <span class="btn-data-badge">{getPeriodKeys().length}</span>
      </button>
      <span class="data-toolbar-sep" aria-hidden="true"></span>
      <button
        type="button"
        class="btn-data btn-data--ghost"
        title="Gửi dữ liệu kỳ hiện tại lên Lark Base (Bitable)"
        onclick={() => (showLarkModal = true)}
      >
        Lark Base
      </button>
    </div>
  </aside>
</div>

<LarkSyncModal bind:open={showLarkModal} />

<div class="nav">
  <button type="button" class="nav-tab" class:active={$activePage === 'dashboard'} onclick={() => setActivePage('dashboard')}>
    Dashboard
  </button>
  <button type="button" class="nav-tab" class:active={$activePage === 'office'} onclick={() => setActivePage('office')}>
    Văn phòng (Scope 1 & 2)
  </button>
  <button type="button" class="nav-tab" class:active={$activePage === 'employee'} onclick={() => setActivePage('employee')}>
    Nhân viên (Scope 3)
  </button>
  <button type="button" class="nav-tab" class:active={$activePage === 'commute'} onclick={() => setActivePage('commute')}>
    Đi làm hàng ngày
  </button>
  <button type="button" class="nav-tab" class:active={$activePage === 'close'} onclick={() => setActivePage('close')}>
    Đóng kỳ
  </button>
</div>

{#if showPeriodsModal}
  <div
    class="modal-overlay"
    role="presentation"
    onclick={(e) => e.target === e.currentTarget && (showPeriodsModal = false)}
    onkeydown={(e) => e.key === 'Escape' && (showPeriodsModal = false)}
  >
    <div class="modal" style="width: min(680px, 100%)">
      <div class="modal-head">
        <span class="modal-title">Tổng hợp tất cả kỳ báo cáo</span>
        <button type="button" class="modal-close" onclick={() => (showPeriodsModal = false)} aria-label="Đóng">×</button>
      </div>
      <div class="modal-body modal-body--scroll">
        <table class="periods-modal-table">
          <thead>
            <tr>
              <th>Kỳ báo cáo</th>
              <th class="num">Scope 1+2 (tấn)</th>
              <th class="num">Scope 3 (tấn)</th>
              <th class="num">Tổng (tấn)</th>
              <th class="periods-modal-th-actions"></th>
            </tr>
          </thead>
          <tbody>
            {#each getPeriodKeys() as pk}
              {@const [py, pm] = pk.split('-').map(Number)}
              {@const t = periodTotalsForKey(pk)}
              {@const isCur = pk === currentPK()}
              <tr class:periods-modal-row--current={isCur}>
                <td class="periods-modal-period">
                  {periodLabel(pm, py)}{#if isCur}<span class="periods-modal-current-tag">Đang xem</span>{/if}
                </td>
                <td class="num">{t.s12.toFixed(3)}</td>
                <td class="num">{t.s3.toFixed(3)}</td>
                <td class="num periods-modal-total">{t.total.toFixed(3)}</td>
                <td class="periods-modal-actions">
                  <button type="button" class="btn btn-sm btn-primary" onclick={() => jumpToPeriod(pm, py)}>Mở kỳ</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn" onclick={() => (showPeriodsModal = false)}>Đóng</button>
      </div>
    </div>
  </div>
{/if}

<div class="page">
  {#if $activePage === 'dashboard'}
    <Dashboard />
  {:else if $activePage === 'office'}
    <OfficePage />
  {:else if $activePage === 'employee'}
    <EmployeePage />
  {:else if $activePage === 'commute'}
    <CommutePage />
  {:else}
    <ClosePeriodPage />
  {/if}
</div>
