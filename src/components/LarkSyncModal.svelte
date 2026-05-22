<script>
  import { currentMonth, currentYear, periodLabel, equipRows, empTrips, commuteList } from '../lib/ghg.js'
  import { loadLarkSettings } from '../lib/larkSettings.js'
  import {
    buildLarkPeriodRecords,
    syncCurrentPeriodToLark,
    LARK_COL_OFFICE as Oc,
    LARK_COL_TRIP as Tr,
    LARK_COL_COMMUTE as Co,
  } from '../lib/larkBitable.js'
  import { toastOk, toastErr, showErrorDetail } from '../lib/notify.js'
  import { getLastLarkErrorDetails, LarkApiError } from '../lib/larkError.js'
  import { larkOpenApiPrefix } from '../lib/larkBitable.js'

  let { open = $bindable(false) } = $props()

  let busy = $state(false)

  const MAX_PREVIEW = 8

  const preview = $derived.by(() => {
    void $equipRows
    void $empTrips
    void $commuteList
    return buildLarkPeriodRecords()
  })

  const targets = $derived.by(() => {
    if (!open) return { office: false, trips: false, commute: false }
    const s = loadLarkSettings()
    return {
      office: !!s.tableOffice?.trim(),
      trips: !!s.tableTrips?.trim(),
      commute: !!s.tableCommute?.trim(),
    }
  })

  function showLastLarkError() {
    const d = getLastLarkErrorDetails()
    if (!d) {
      toastErr('Chưa có lỗi Lark trong phiên này — thử Gửi lên Lark Base trước.')
      return
    }
    showErrorDetail(new LarkApiError('Lỗi Lark gần nhất (phiên hiện tại)', d), 'Chi tiết lỗi Lark')
  }

  async function onSync() {
    const s = loadLarkSettings()
    if (!s.appId || !s.appSecret || !s.baseAppToken) {
      toastErr('Chưa cấu hình đồng bộ — vui lòng liên hệ quản trị.')
      return
    }
    if (!s.tableOffice?.trim() && !s.tableTrips?.trim() && !s.tableCommute?.trim()) {
      toastErr('Chưa cấu hình bảng đích — vui lòng liên hệ quản trị.')
      return
    }
    busy = true
    try {
      const r = await syncCurrentPeriodToLark(s)
      const dup = []
      if (r.skippedOffice > 0) dup.push(`bảng Văn phòng (${r.skippedOffice})`)
      if (r.skippedTrips > 0) dup.push(`bảng Nhân viên (${r.skippedTrips})`)
      if (r.skippedCommute > 0) dup.push(`bảng Đi làm (${r.skippedCommute})`)

      if (dup.length > 0) {
        toastErr(
          `Phát hiện dữ liệu trùng: ${dup.join(', ')}. Các dòng trùng đã bị bỏ qua, chỉ thêm dòng mới.`,
        )
      } else {
        toastOk(`Đã gửi lên Lark Base — Văn phòng: ${r.office}, Nhân viên: ${r.trips}, Đi làm: ${r.commute} bản ghi`)
        open = false
      }
    } catch (e) {
      await showErrorDetail(e, 'Gửi Lark Base thất bại')
    } finally {
      busy = false
    }
  }
</script>

{#if open}
  <div
    class="modal-overlay"
    role="presentation"
    onclick={(e) => e.target === e.currentTarget && (open = false)}
    onkeydown={(e) => e.key === 'Escape' && (open = false)}
  >
    <div class="modal lark-modal lark-modal--preview" style="width: min(880px, 100%)">
      <div class="modal-head">
        <span class="modal-title">Lark Base — đồng bộ kỳ {periodLabel($currentMonth, $currentYear)}</span>
        <button type="button" class="modal-close" onclick={() => (open = false)} aria-label="Đóng">×</button>
      </div>
      <div class="modal-body modal-body--scroll">
        <p class="lark-preview-intro">
          Mỗi lần bấm gửi, app <strong>thêm bản ghi mới</strong> vào Lark Base (không gửi cột ID). Chỉ gửi cột
          <strong>đã có trên Base</strong>; «Kỳ báo cáo» là tùy chọn (không có cột kỳ trên Base thì bỏ qua). Trùng dữ liệu
          sẽ bị bỏ qua khi đồng bộ.
        </p>
        <div class="lark-target-chips" aria-label="Bảng đích đã cấu hình">
          <span class="lark-target-chip" class:inactive={!targets.office}>
            Văn phòng (Scope 1 &amp; 2){#if targets.office}<span class="lark-target-ok"> · sẽ gửi</span>{:else}<span class="lark-target-skip"> · chưa gán bảng</span>{/if}
          </span>
          <span class="lark-target-chip" class:inactive={!targets.trips}>
            Nhân viên (Scope 3){#if targets.trips}<span class="lark-target-ok"> · sẽ gửi</span>{:else}<span class="lark-target-skip"> · chưa gán bảng</span>{/if}
          </span>
          <span class="lark-target-chip" class:inactive={!targets.commute}>
            Đi làm hằng ngày{#if targets.commute}<span class="lark-target-ok"> · sẽ gửi</span>{:else}<span class="lark-target-skip"> · chưa gán bảng</span>{/if}
          </span>
        </div>

        <section class="lark-preview-block">
          <h3 class="lark-preview-heading">
            Văn phòng — {preview.officeFields.length} dòng
          </h3>
          {#if preview.officeFields.length === 0}
            <p class="lark-preview-empty">Không có thiết bị nào được đưa vào báo cáo kỳ này.</p>
          {:else}
            <div class="lark-preview-table-wrap">
              <table class="lark-preview-table">
                <thead>
                  <tr>
                    <th>{Oc.ThietBi}</th>
                    <th>{Oc.Scope}</th>
                    <th class="num">{Oc.TongGhg}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each preview.officeFields.slice(0, MAX_PREVIEW) as row}
                    <tr>
                      <td>{row[Oc.ThietBi] || '—'}</td>
                      <td>{row[Oc.Scope] || '—'}</td>
                      <td class="num">{row[Oc.TongGhg] || '—'}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            {#if preview.officeFields.length > MAX_PREVIEW}
              <p class="lark-preview-more">… và {preview.officeFields.length - MAX_PREVIEW} dòng nữa (cùng các cột đầy đủ khi gửi).</p>
            {/if}
            <p class="lark-preview-cols-hint">
              Các cột gửi kèm: {Oc.NguonPhatThai}, {Oc.DonVi}, {Oc.KhoiLuong}, {Oc.Ef}, {Oc.EfRef}.
            </p>
          {/if}
        </section>

        <section class="lark-preview-block">
          <h3 class="lark-preview-heading">
            Nhân viên (chuyến công tác) — {preview.tripRows.length} dòng
          </h3>
          {#if preview.tripRows.length === 0}
            <p class="lark-preview-empty">Không có chuyến công tác trong kỳ này.</p>
          {:else}
            <div class="lark-preview-table-wrap">
              <table class="lark-preview-table">
                <thead>
                  <tr>
                    <th>{Tr.HoTen}</th>
                    <th>{Tr.TenChuyen}</th>
                    <th class="num">{Tr.Tong}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each preview.tripRows.slice(0, MAX_PREVIEW) as row}
                    <tr>
                      <td>{row[Tr.HoTen] || '—'}</td>
                      <td>{row[Tr.TenChuyen] || '—'}</td>
                      <td class="num">{row[Tr.Tong] || '—'}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            {#if preview.tripRows.length > MAX_PREVIEW}
              <p class="lark-preview-more">… và {preview.tripRows.length - MAX_PREVIEW} dòng nữa.</p>
            {/if}
            <p class="lark-preview-cols-hint">
              Các cột gửi kèm: {Tr.MaNv}, {Tr.PhongBan}, {Tr.MucDich}, {Tr.XuatPhat}, {Tr.Den}, {Tr.NgayDi}, {Tr.NgayVe},
              {Tr.Co2Bay}, {Tr.Co2MatDat}, {Tr.Co2LuuTru}.
            </p>
          {/if}
        </section>

        <section class="lark-preview-block">
          <h3 class="lark-preview-heading">
            Đi làm hằng ngày — {preview.commuteRows.length} dòng
          </h3>
          {#if preview.commuteRows.length === 0}
            <p class="lark-preview-empty">Không có dòng đi làm trong kỳ này.</p>
          {:else}
            <div class="lark-preview-table-wrap">
              <table class="lark-preview-table">
                <thead>
                  <tr>
                    <th>{Co.HoTen}</th>
                    <th>{Co.PhuongTien}</th>
                    <th class="num">{Co.Co2e}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each preview.commuteRows.slice(0, MAX_PREVIEW) as row}
                    <tr>
                      <td>{row[Co.HoTen] || '—'}</td>
                      <td>{row[Co.PhuongTien] || '—'}</td>
                      <td class="num">{row[Co.Co2e] || '—'}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            {#if preview.commuteRows.length > MAX_PREVIEW}
              <p class="lark-preview-more">… và {preview.commuteRows.length - MAX_PREVIEW} dòng nữa.</p>
            {/if}
            <p class="lark-preview-cols-hint">
              Các cột gửi kèm: {Co.MaNv}, {Co.PhongBan}, {Co.KmMotChieu}, {Co.NgayDiLamThang}, {Co.Wfh}, {Co.Carpool}.
            </p>
          {/if}
        </section>
      </div>
      <div class="modal-foot lark-modal-foot">
        <p class="lark-debug-hint">
          Đường API: <code>{larkOpenApiPrefix()}</code> · Khi lỗi: bấm <strong>Chi tiết lỗi</strong> hoặc mở <strong>F12 → Console</strong>.
        </p>
        <div class="lark-modal-foot-actions">
          <button type="button" class="btn btn-primary" onclick={onSync} disabled={busy}>
            {busy ? 'Đang gửi lên Lark Base…' : 'Gửi lên Lark Base'}
          </button>
          <button type="button" class="btn" onclick={showLastLarkError} disabled={busy}>
            Chi tiết lỗi
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
