<script>
  import {
    currentMonth,
    currentYear,
    periodKey,
    periodLabel,
  } from '../lib/ghg.js'
  import {
    loadSnapshots,
    createSnapshot,
    hasSnapshot,
    deleteSnapshot,
    runScheduledSnapshots,
    snapshotTotalsForCompany,
  } from '../lib/snapshots.js'
  import { loadLarkSettings } from '../lib/larkSettings.js'
  import { syncSnapshotToLark } from '../lib/larkBitable.js'
  import { COMPANIES } from '../lib/companies.js'
  import { toastOk, toastErr, showErrorDetail } from '../lib/notify.js'

  let snapshots = $state(loadSnapshots())
  let busy = $state(false)
  let selectedId = $state('')

  const selected = $derived(snapshots.find((s) => s.id === selectedId) ?? snapshots[0] ?? null)

  $effect(() => {
    if (selected && selectedId !== selected.id) selectedId = selected.id
  })

  function refresh() {
    const auto = runScheduledSnapshots()
    snapshots = loadSnapshots()
    if (auto.length) toastOk(`Đã tự đóng kỳ: ${auto.map((a) => a.label).join(', ')}`)
  }

  function closeCurrentMonth() {
    const pk = periodKey($currentMonth, $currentYear)
    if (hasSnapshot(pk, 'month')) {
      toastErr(`Kỳ ${periodLabel($currentMonth, $currentYear)} đã được đóng trước đó`)
      return
    }
    const s = createSnapshot('month', pk, periodLabel($currentMonth, $currentYear))
    if (!s) {
      toastErr('Không tạo được bản chốt tháng')
      return
    }
    snapshots = loadSnapshots()
    selectedId = s.id
    toastOk(`Đã chốt kỳ ${s.label}`)
  }

  function closeCurrentYear() {
    const y = String($currentYear)
    if (hasSnapshot(y, 'year')) {
      toastErr(`Năm ${y} đã được đóng trước đó`)
      return
    }
    const s = createSnapshot('year', y, `Năm ${y}`)
    if (!s) {
      toastErr('Không tạo được bản chốt năm')
      return
    }
    snapshots = loadSnapshots()
    selectedId = s.id
    toastOk(`Đã chốt năm ${y}`)
  }

  async function syncLark() {
    if (!selected) {
      toastErr('Chọn một bản chốt kỳ để đồng bộ')
      return
    }
    const s = loadLarkSettings()
    if (!s.appId || !s.appSecret || !s.baseAppToken) {
      toastErr('Chưa cấu hình Lark — liên hệ quản trị')
      return
    }
    busy = true
    try {
      const r = await syncSnapshotToLark(selected, s)
      toastOk(
        `Lark Base — VP: ${r.office}, CT: ${r.trips}, Đi làm: ${r.commute}${r.closeRows ? `, Tổng hợp: ${r.closeRows}` : ''}`,
      )
    } catch (e) {
      await showErrorDetail(e, 'Gửi Lark Base (chốt kỳ) thất bại')
    } finally {
      busy = false
    }
  }

  function onDelete(id) {
    deleteSnapshot(id)
    snapshots = loadSnapshots()
    if (selectedId === id) selectedId = snapshots[0]?.id ?? ''
    toastOk('Đã xóa bản chốt')
  }

  refresh()
</script>

<div class="page-title">Đóng kỳ &amp; tổng hợp</div>
<div class="page-sub">
  Tự động chốt số liệu vào ngày <strong>30</strong> hàng tháng và <strong>30/12</strong> cho cả năm. Dữ liệu được lưu bản
  snapshot (bảng riêng) — có thể đồng bộ lên Lark Base.
</div>

<div class="card">
  <div class="card-head">
    <div class="card-head-left"><div class="card-title">Thao tác thủ công</div></div>
  </div>
  <div class="card-body actions-bar">
    <button type="button" class="btn btn-primary" onclick={closeCurrentMonth}>Chốt tháng đang xem</button>
    <button type="button" class="btn" onclick={closeCurrentYear}>Chốt năm {$currentYear}</button>
    <button type="button" class="btn" onclick={refresh}>Kiểm tra tự động (ngày 30)</button>
  </div>
</div>

<div class="close-layout">
  <div class="card">
    <div class="card-head">
      <div class="card-head-left"><div class="card-title">Bản chốt đã lưu</div></div>
    </div>
    <div class="card-body modal-body--scroll" style="max-height: 420px">
      {#if snapshots.length === 0}
        <p class="lark-preview-empty">Chưa có bản chốt. Hệ thống sẽ tự tạo vào ngày 30 hoặc bấm chốt thủ công.</p>
      {:else}
        <ul class="close-snap-list">
          {#each snapshots as snap}
            <li>
              <button
                type="button"
                class="close-snap-item"
                class:active={selected?.id === snap.id}
                onclick={() => (selectedId = snap.id)}
              >
                <strong>{snap.label}</strong>
                <span class="close-snap-meta">{snap.type === 'year' ? 'Năm' : 'Tháng'} · {snap.closedAt.slice(0, 10)}</span>
              </button>
              <button type="button" class="btn btn-danger btn-sm" onclick={() => onDelete(snap.id)}>✕</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div class="card-head-left"><div class="card-title">Chi tiết bản chốt</div></div>
      {#if selected}
        <button type="button" class="btn btn-primary" disabled={busy} onclick={syncLark}>
          {busy ? 'Đang gửi…' : 'Gửi lên Lark Base'}
        </button>
      {/if}
    </div>
    <div class="card-body">
      {#if !selected}
        <div class="empty"><div class="empty-icon">📦</div>Chọn hoặc tạo bản chốt kỳ</div>
      {:else}
        <p class="close-detail-intro">
          <strong>{selected.label}</strong> — đóng lúc {new Date(selected.closedAt).toLocaleString('vi-VN')}
        </p>
        <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 1rem">
          <div class="stat stat-danger">
            <div class="stat-label">Scope 1</div>
            <div class="stat-val">{selected.totals.s1.toFixed(3)}</div>
            <div class="stat-unit">tấn</div>
          </div>
          <div class="stat stat-warn">
            <div class="stat-label">Scope 2</div>
            <div class="stat-val">{selected.totals.s2.toFixed(3)}</div>
            <div class="stat-unit">tấn</div>
          </div>
          <div class="stat stat-info">
            <div class="stat-label">Scope 3</div>
            <div class="stat-val">{selected.totals.s3.toFixed(3)}</div>
            <div class="stat-unit">tấn</div>
          </div>
          <div class="stat stat-accent">
            <div class="stat-label">Tổng</div>
            <div class="stat-val">{selected.totals.total.toFixed(3)}</div>
            <div class="stat-unit">tấn</div>
          </div>
        </div>
        <p class="lark-preview-cols-hint">
          Dòng dữ liệu: Văn phòng {selected.equip.filter((r) => r.confirmed !== false).length} · Chuyến CT
          {selected.emptrips.length} · Đi làm {selected.commute.length}
        </p>
        <table class="close-co-table">
          <thead>
            <tr>
              <th>Công ty</th>
              <th class="num">Tổng (tấn)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Tất cả</td>
              <td class="num">{snapshotTotalsForCompany(selected, '').total.toFixed(3)}</td>
            </tr>
            {#each COMPANIES as co}
              {@const t = snapshotTotalsForCompany(selected, co)}
              <tr>
                <td>{co}</td>
                <td class="num">{t.total.toFixed(3)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="lark-preview-cols-hint" style="margin-top: 12px">
          Lark: gửi đủ 3 bảng chi tiết + bảng tổng hợp (nếu có <code>VITE_LARK_TABLE_CLOSE</code> trong env).
        </p>
      {/if}
    </div>
  </div>
</div>
