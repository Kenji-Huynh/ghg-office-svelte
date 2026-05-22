<script>
  import {
    DEPT_OPTIONS,
    PURPOSE_OPTIONS,
    HOTEL_OPTIONS,
    CABIN_OPTIONS,
    TRIP_TRANSPORT_TYPES,
  } from '../lib/constants.js'
  import { COMPANIES, isValidCompany, matchesCompany } from '../lib/companies.js'
  import CompanySelect from './CompanySelect.svelte'
  import CompanyFilterBadge from './CompanyFilterBadge.svelte'
  import RowActionIcons from './RowActionIcons.svelte'
  import {
    calcEmployeeTrip,
    newTransportSegment,
    newHotelStay,
    migrateTripTransports,
    migrateTripHotels,
  } from '../lib/calculations.js'
  import { empTrips, addEmpTrip, updateEmpTripById, deleteEmpTripById, selectedCompany } from '../lib/ghg.js'
  import { confirmDanger, confirmAction, toastOk, toastErr } from '../lib/notify.js'

  function newLeg() {
    return {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      from: '',
      to: '',
      km: 0,
      legs: 1,
      cabin: 0.133,
      cabinLabel: 'Economy',
    }
  }

  let flightLegs = $state([newLeg()])
  let eName = $state('')
  let eEmpid = $state('')
  let eDept = $state('')
  let eTrip = $state('')
  let ePurpose = $state(PURPOSE_OPTIONS[0])
  let eFrom = $state('')
  let eTo = $state('')
  let eDate = $state('')
  let eDateTo = $state('')
  let eProj = $state('')
  let eNote = $state('')
  let eCompany = $state(COMPANIES[0])
  let otherTransports = $state([newTransportSegment()])
  let hotelStays = $state([newHotelStay()])
  let empSearch = $state('')
  let empDeptFilter = $state('')
  /** @type {string | null} */
  let editingTripId = $state(null)
  let tripFormCard = $state(/** @type {HTMLDivElement | undefined} */ (undefined))

  $effect(() => {
    if ($selectedCompany) eCompany = $selectedCompany
  })

  const empDeptOptions = $derived.by(() => {
    const depts = [...new Set($empTrips.map((t) => t.dept).filter(Boolean))].sort()
    return depts
  })

  const filteredTrips = $derived.by(() => {
    const q = empSearch.toLowerCase()
    let list = [...$empTrips]
    if ($selectedCompany) list = list.filter((t) => matchesCompany(t.company, $selectedCompany))
    if (q) {
      list = list.filter((t) =>
        `${t.name}${t.trip}${t.from}${t.to}${t.empId}`.toLowerCase().includes(q),
      )
    }
    if (empDeptFilter) list = list.filter((t) => t.dept === empDeptFilter)
    return list
  })

  const live = $derived.by(() => calcEmployeeTrip(flightLegs, otherTransports, hotelStays))

  function addTransport() {
    otherTransports = [...otherTransports, newTransportSegment()]
  }

  function addHotel() {
    hotelStays = [...hotelStays, newHotelStay()]
  }

  async function removeHotel(id) {
    if (hotelStays.length <= 1) {
      toastErr('Cần ít nhất một dòng lưu trú (có thể để trống)')
      return
    }
    const ok = await confirmDanger('Xóa dòng lưu trú?', '', 'Xóa')
    if (!ok) return
    hotelStays = hotelStays.filter((h) => h.id !== id)
  }

  async function removeTransport(id) {
    if (otherTransports.length <= 1) {
      toastErr('Cần ít nhất một dòng phương tiện (có thể để trống)')
      return
    }
    const ok = await confirmDanger('Xóa dòng phương tiện?', '', 'Xóa')
    if (!ok) return
    otherTransports = otherTransports.filter((t) => t.id !== id)
  }

  function addLeg() {
    flightLegs = [...flightLegs, newLeg()]
  }

  async function removeLeg(id) {
    if (flightLegs.length <= 1) {
      toastErr('Cần ít nhất một chặng bay (có thể để trống)')
      return
    }
    const ok = await confirmDanger('Xóa chặng bay?', '', 'Xóa chặng')
    if (!ok) return
    flightLegs = flightLegs.filter((l) => l.id !== id)
  }

  /** @param {Record<string, unknown>} t */
  function loadTripIntoForm(t) {
    editingTripId = String(t.id)
    eName = String(t.name ?? '')
    eEmpid = String(t.empId ?? '')
    eDept = String(t.dept ?? '')
    eCompany = isValidCompany(t.company) ? String(t.company) : COMPANIES[0]
    eTrip = String(t.trip ?? '')
    ePurpose = String(t.purpose ?? PURPOSE_OPTIONS[0])
    eFrom = String(t.from ?? '')
    eTo = String(t.to ?? '')
    eDate = String(t.dateFrom ?? '')
    eDateTo = String(t.dateTo ?? '')
    eProj = String(t.proj ?? '')
    eNote = String(t.note ?? '')

    const legs = t.flightLegs?.length ? JSON.parse(JSON.stringify(t.flightLegs)) : [newLeg()]
    flightLegs = legs.map((/** @type {{id?:string}} */ l, i) => ({
      ...l,
      id: l.id || `leg-edit-${i}-${Date.now()}`,
    }))

    const transports = migrateTripTransports(t)
    otherTransports =
      transports.length > 0
        ? transports.map((/** @type {{id?:string}} */ s, i) => ({
            ...s,
            id: s.id || `pt-edit-${i}-${Date.now()}`,
          }))
        : [newTransportSegment()]

    const hotels = migrateTripHotels(t)
    hotelStays =
      hotels.length > 0
        ? hotels.map((/** @type {{id?:string}} */ h, i) => ({
            ...h,
            id: h.id || `hotel-edit-${i}-${Date.now()}`,
          }))
        : [newHotelStay()]

    tripFormCard?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    toastOk('Đã tải chuyến lên form — chỉnh sửa rồi bấm Cập nhật')
  }

  function cancelEdit() {
    editingTripId = null
    resetForm(false)
  }

  async function saveTrip() {
    const name = eName.trim()
    const empId = eEmpid.trim()
    const dept = eDept
    const trip = eTrip.trim()
    const dateFrom = eDate
    if (!name || !empId || !dept || !trip || !dateFrom) {
      toastErr('Vui lòng điền đủ các trường bắt buộc (*)')
      return
    }
    if (!isValidCompany(eCompany)) {
      toastErr('Vui lòng chọn công ty')
      return
    }
    const isEdit = !!editingTripId
    const ok = await confirmAction(
      isEdit ? 'Cập nhật chuyến công tác?' : 'Xác nhận lưu chuyến công tác?',
      `Tổng ước tính: ${live.total} kg CO₂e`,
    )
    if (!ok) return

    const stays = JSON.parse(JSON.stringify(hotelStays))
    const firstHotel = HOTEL_OPTIONS.find(
      (h) => h.value === Number(stays[0]?.hotelType) || h.value == stays[0]?.hotelType,
    )

    const payload = {
      id: editingTripId ?? Date.now().toString(),
      name,
      empId,
      dept,
      company: eCompany,
      trip,
      from: eFrom,
      to: eTo,
      dateFrom,
      dateTo: eDateTo,
      purpose: ePurpose,
      proj: eProj,
      note: eNote,
      flightLegs: JSON.parse(JSON.stringify(flightLegs)),
      otherTransports: JSON.parse(JSON.stringify(otherTransports)),
      hotelStays: stays,
      hotelLabel: firstHotel?.label.split(' (')[0] ?? '',
      nights: stays.reduce((s, /** @type {{nights?:number}} */ h) => s + Number(h.nights || 0), 0),
      rooms: stays[0]?.rooms ?? 1,
      co2Air: live.airCO2,
      co2Ground: live.groundCO2,
      co2Hotel: live.hotelCO2,
      co2Total: live.total,
      savedAt: new Date().toISOString(),
    }

    if (isEdit) {
      const updated = updateEmpTripById(editingTripId, payload)
      if (!updated) {
        toastErr('Chuyến trùng dữ liệu chuyến khác — đổi mã NV / tên chuyến / ngày / hành trình.')
        return
      }
      toastOk(`Đã cập nhật "${trip}" — ${live.total} kg CO₂e`)
    } else {
      const added = addEmpTrip(payload)
      if (!added) {
        toastErr('Chuyến công tác trùng dữ liệu đã có, không thêm mới.')
        return
      }
      toastOk(`Đã lưu "${trip}" — ${live.total} kg CO₂e`)
    }
    editingTripId = null
    await resetForm(false)
  }

  /** @param {boolean} [ask] */
  async function resetForm(ask = true) {
    if (ask) {
      const ok = await confirmAction('Xóa nội dung form?', 'Toàn bộ thông tin đang nhập sẽ bị xóa.')
      if (!ok) return
    }
    eName = ''
    eEmpid = ''
    eDept = ''
    eTrip = ''
    ePurpose = PURPOSE_OPTIONS[0]
    eFrom = ''
    eTo = ''
    eDate = ''
    eDateTo = ''
    eProj = ''
    eNote = ''
    eCompany = COMPANIES[0]
    otherTransports = [newTransportSegment()]
    hotelStays = [newHotelStay()]
    flightLegs = [newLeg()]
    editingTripId = null
    if (ask) toastOk('Đã xóa form')
  }

  async function deleteTrip(id) {
    const ok = await confirmDanger('Xóa chuyến công tác?', 'Dữ liệu sẽ bị gỡ khỏi kỳ báo cáo hiện tại.', 'Xóa')
    if (!ok) return
    deleteEmpTripById(id)
    if (editingTripId === id) editingTripId = null
    toastOk('Đã xóa chuyến công tác')
  }
</script>

<div class="page-title">Phát thải chuyến công tác — Nhân viên</div>
<div class="page-sub">
  Scope 3.6 · Business travel · Ghi nhận từng chuyến công tác của từng nhân viên
</div>

<div class="card" class:trip-form-editing={!!editingTripId} bind:this={tripFormCard}>
  <div class="card-head">
    <div class="card-head-left">
      <div class="card-title">{editingTripId ? 'Chỉnh sửa chuyến công tác' : 'Thêm chuyến công tác mới'}</div>
      <span class="card-scope scope-s3">SCOPE 3</span>
      {#if editingTripId}
        <span class="eq-draft-pill">Đang sửa</span>
      {/if}
    </div>
  </div>
  <div class="card-body">
    <div class="sec-divider">Thông tin nhân viên</div>
    <div class="g3">
      <div class="field">
        <label>Họ và tên <span class="required">*</span></label>
        <input type="text" placeholder="Nguyễn Văn A" bind:value={eName} />
      </div>
      <div class="field">
        <label>Mã nhân viên <span class="required">*</span></label>
        <input type="text" placeholder="NV-00123" bind:value={eEmpid} />
      </div>
      <div class="field">
        <label>Công ty <span class="required">*</span></label>
        <CompanySelect bind:value={eCompany} hideLabel={true} required={true} id="trip-company" />
      </div>
      <div class="field">
        <label>Phòng ban <span class="required">*</span></label>
        <select bind:value={eDept}>
          <option value="">-- Chọn --</option>
          {#each DEPT_OPTIONS as d}
            <option value={d}>{d}</option>
          {/each}
        </select>
      </div>
    </div>

    <div class="sec-divider">Thông tin chuyến đi</div>
    <div class="g3">
      <div class="field span2">
        <label>Tên chuyến công tác <span class="required">*</span></label>
        <input type="text" placeholder="Hội nghị khách hàng Q2/2026" bind:value={eTrip} />
      </div>
      <div class="field">
        <label>Mục đích</label>
        <select bind:value={ePurpose}>
          {#each PURPOSE_OPTIONS as p}
            <option value={p}>{p}</option>
          {/each}
        </select>
      </div>
      <div class="field">
        <label>Điểm xuất phát</label>
        <input type="text" placeholder="TP. Hồ Chí Minh" bind:value={eFrom} />
      </div>
      <div class="field">
        <label>Điểm đến</label>
        <input type="text" placeholder="Hà Nội" bind:value={eTo} />
      </div>
      <div class="field">
        <label>Ngày đi</label>
        <input type="date" bind:value={eDate} />
      </div>
      <div class="field">
        <label>Ngày về</label>
        <input type="date" bind:value={eDateTo} />
      </div>
      <div class="field">
        <label>Mã dự án</label>
        <input type="text" placeholder="PRJ-2026-04" bind:value={eProj} />
      </div>
    </div>

    <div class="sec-divider">Máy bay — bao gồm nối chuyến</div>
    <p class="flight-legs-intro">
      Mỗi khối là một chặng bay (ví dụ SGN → HAN). Nối chuyến thì nhấn <strong>+ Thêm chặng bay</strong>. Ước tính phát thải
      dùng công thức: khoảng cách × số lượt × hệ số theo hạng ghế.
    </p>
    <div class="flight-legs-list">
      {#each flightLegs as leg, idx (leg.id)}
        <div class="flight-leg-card">
          <div class="flight-leg-card-toolbar">
            <span class="flight-leg-badge">Chặng {idx + 1}</span>
            <button
              type="button"
              class="btn btn-danger btn-sm flight-leg-remove"
              aria-label="Xóa chặng bay này"
              onclick={() => removeLeg(leg.id)}
            >
              Xóa chặng
            </button>
          </div>
          <div class="g3 flight-leg-card-grid">
            <div class="field">
              <label>Điểm khởi hành</label>
              <input type="text" placeholder="VD: SGN, Tân Sơn Nhất" bind:value={leg.from} />
            </div>
            <div class="field">
              <label>Điểm đến</label>
              <input type="text" placeholder="VD: HAN, Nội Bài" bind:value={leg.to} />
            </div>
            <div class="field">
              <label>Hạng ghế</label>
              <select bind:value={leg.cabin}>
                {#each CABIN_OPTIONS as c}
                  <option value={c.value}>{c.label}</option>
                {/each}
              </select>
            </div>
            <div class="g2 flight-leg-dist-row">
              <div class="field field-unit">
                <label>Khoảng cách ước tính</label>
                <input type="number" placeholder="0" min="0" step="any" bind:value={leg.km} />
                <span class="unit">km</span>
              </div>
              <div class="field field-unit">
                <label>Số lượt bay</label>
                <input type="number" placeholder="1" min="1" step="1" bind:value={leg.legs} />
                <span class="unit">lượt</span>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
    <button type="button" class="btn btn-add flight-legs-add" onclick={addLeg}>+ Thêm chặng bay</button>

    <div class="sec-divider">Phương tiện khác (ô tô, xăng, Grab, tàu…)</div>
    <p class="flight-legs-intro">
      Một chuyến có thể có nhiều loại: ví dụ 7 lần đổ xăng, 1 Grab, 2 chuyến bay (ở phần trên). Mỗi dòng = một loại / một nhóm hóa đơn.
    </p>
    <div class="flight-legs-list">
      {#each otherTransports as seg, idx (seg.id)}
        <div class="flight-leg-card">
          <div class="flight-leg-card-toolbar">
            <span class="flight-leg-badge">PT {idx + 1}</span>
            <button type="button" class="btn btn-danger btn-sm" onclick={() => removeTransport(seg.id)}>Xóa</button>
          </div>
          <div class="g3 flight-leg-card-grid">
            <div class="field">
              <label>Loại</label>
              <select bind:value={seg.type}>
                {#each TRIP_TRANSPORT_TYPES as tt}
                  <option value={tt.value}>{tt.label}</option>
                {/each}
              </select>
            </div>
            <div class="field">
              <label>Ghi chú (VD: HĐ xăng lần 3)</label>
              <input type="text" placeholder="Mô tả ngắn" bind:value={seg.note} />
            </div>
            <div class="field field-unit">
              <label>Số lần / số hóa đơn</label>
              <input type="number" min="1" bind:value={seg.count} />
            </div>
            {#if seg.type === 'fuel'}
              <div class="field field-unit">
                <label>Tổng lít xăng (mỗi lần)</label>
                <input type="number" min="0" step="any" bind:value={seg.liters} />
                <span class="unit">lít</span>
              </div>
            {:else}
              <div class="field field-unit">
                <label>Quãng đường (mỗi lần)</label>
                <input type="number" min="0" step="any" bind:value={seg.km} />
                <span class="unit">km</span>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
    <button type="button" class="btn btn-add flight-legs-add" onclick={addTransport}>+ Thêm phương tiện / hóa đơn</button>

    <div class="sec-divider">Lưu trú — nhiều khách sạn / chỗ nghỉ</div>
    <p class="flight-legs-intro">
      Mỗi dòng = một chỗ nghỉ (khách sạn khác nhau, homestay, nhà nghỉ…). Ví dụ: 3 đêm KS A + 2 đêm KS B.
    </p>
    <div class="flight-legs-list">
      {#each hotelStays as stay, idx (stay.id)}
        <div class="flight-leg-card">
          <div class="flight-leg-card-toolbar">
            <span class="flight-leg-badge">Chỗ nghỉ {idx + 1}</span>
            <button type="button" class="btn btn-danger btn-sm" onclick={() => removeHotel(stay.id)}>Xóa</button>
          </div>
          <div class="g3 flight-leg-card-grid">
            <div class="field span2">
              <label>Tên / địa điểm (tùy chọn)</label>
              <input type="text" placeholder="VD: Mường Thanh Đà Nẵng, homestay Hội An" bind:value={stay.note} />
            </div>
            <div class="field">
              <label>Loại chỗ nghỉ</label>
              <select bind:value={stay.hotelType}>
                {#each HOTEL_OPTIONS as h}
                  <option value={h.value}>{h.label}</option>
                {/each}
              </select>
            </div>
            <div class="field">
              <label>Số đêm</label>
              <input type="number" placeholder="0" min="0" bind:value={stay.nights} />
            </div>
            <div class="field">
              <label>Số phòng</label>
              <input type="number" min="1" bind:value={stay.rooms} />
            </div>
          </div>
        </div>
      {/each}
    </div>
    <button type="button" class="btn btn-add flight-legs-add" onclick={addHotel}>+ Thêm chỗ nghỉ / khách sạn</button>

    <div class="field">
      <label>Ghi chú</label>
      <textarea placeholder="Xe ôm, xe buýt sân bay, v.v..." bind:value={eNote}></textarea>
    </div>

    <div class="live-box">
      <span style="font-size:12px;color:var(--text2)">CO₂ ước tính:</span>
      <span class="live-mono">{live.total > 0 ? live.total : '—'}</span>
      <span style="font-size:12px;color:var(--text2)">kg CO₂e</span>
      <span style="font-size:11px;color:var(--text3);margin-left:auto;font-family:var(--mono)">
        {live.total > 0
          ? `Bay: ${live.airCO2} · Xe/tàu: ${live.groundCO2} · KS: ${live.hotelCO2} kg`
          : ''}
      </span>
    </div>

    <div class="actions-bar">
      <button type="button" class="btn btn-primary" onclick={saveTrip}>
        {editingTripId ? 'Cập nhật chuyến' : 'Lưu chuyến công tác'}
      </button>
      {#if editingTripId}
        <button type="button" class="btn" onclick={cancelEdit}>Hủy sửa</button>
      {:else}
        <button type="button" class="btn" onclick={() => resetForm(true)}>Xóa form</button>
      {/if}
    </div>
  </div>
</div>

<div class="card">
  <div class="card-head">
    <div class="card-head-left">
      <div class="card-title">Lịch sử chuyến công tác</div>
      <CompanyFilterBadge />
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <input
        type="text"
        placeholder="Tìm tên, chuyến đi..."
        style="padding:6px 10px;font-size:12px;border:1px solid var(--border);border-radius:var(--radius);width:min(220px,100%)"
        bind:value={empSearch}
      />
      <select
        style="padding:6px 10px;font-size:12px;border:1px solid var(--border);border-radius:var(--radius)"
        bind:value={empDeptFilter}
      >
        <option value="">Tất cả phòng ban</option>
        {#each empDeptOptions as d}
          <option value={d}>{d}</option>
        {/each}
      </select>
    </div>
  </div>
  <div class="card-body">
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Họ và tên</th>
            <th>Mã NV</th>
            <th>Công ty</th>
            <th>Phòng ban</th>
            <th>Chuyến đi</th>
            <th>Hành trình</th>
            <th>Ngày</th>
            <th>Bay</th>
            <th>Xe/Tàu</th>
            <th>KS</th>
            <th>Tổng (kg)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#if filteredTrips.length === 0}
            <tr>
              <td colspan="12" style="text-align:center;color:var(--text3);padding:2rem">
                {#if $selectedCompany && $empTrips.length > 0}
                  Không có chuyến của {$selectedCompany} trong kỳ này (thử chọn «Tất cả công ty» trên thanh trên)
                {:else}
                  Chưa có dữ liệu
                {/if}
              </td>
            </tr>
          {:else}
            {#each filteredTrips as t}
              {@const legSummary =
                t.flightLegs && t.flightLegs.length
                  ? t.flightLegs.map((/** @type {{from?:string,to?:string}} */ l) => `${l.from}→${l.to}`).join(' / ')
                  : '—'}
              {@const ptSummary =
                t.otherTransports?.length
                  ? t.otherTransports
                      .map(
                        (/** @type {{type?:string,count?:number,note?:string}} */ s) =>
                          `${s.note || s.type}${s.count > 1 ? `×${s.count}` : ''}`,
                      )
                      .join(' · ')
                  : t.fuel || t.groundKm
                    ? 'Xe/xăng (cũ)'
                    : ''}
              {@const hotelSummary =
                t.hotelStays?.length
                  ? t.hotelStays
                      .map(
                        (/** @type {{note?:string,nights?:number,rooms?:number}} */ h) =>
                          `${h.note || 'KS'} ${h.nights}đ×${h.rooms || 1}p`,
                      )
                      .join(' · ')
                  : t.nights
                    ? `${t.hotelLabel || 'KS'} ${t.nights}đ`
                    : '—'}
              <tr class:trip-row-editing={t.id === editingTripId}>
                <td><strong>{t.name}</strong></td>
                <td class="num" style="font-family:var(--mono);font-size:12px">{t.empId}</td>
                <td>{t.company || '—'}</td>
                <td>{t.dept}</td>
                <td>
                  {t.trip}<br />
                  <span style="font-size:11px;color:var(--text3)">{t.purpose || ''}</span>
                </td>
                <td style="font-size:11px">{t.from || '—'} → {t.to || '—'}</td>
                <td style="font-size:11px">{t.dateFrom || '—'}</td>
                <td style="font-size:11px;font-family:var(--mono)">{legSummary}{#if ptSummary}<br /><span style="color:var(--text3)">{ptSummary}</span>{/if}</td>
                <td class="num">{t.co2Air || 0}</td>
                <td class="num">{t.co2Ground || 0}</td>
                <td class="num" style="font-size:11px">
                  {t.co2Hotel || 0}
                  {#if hotelSummary !== '—'}<br /><span style="color:var(--text3);font-weight:400">{hotelSummary}</span>{/if}
                </td>
                <td>
                  <span
                    class="badge {t.co2Total > 500 ? 'badge-r' : t.co2Total > 100 ? 'badge-a' : 'badge-g'}"
                    >{t.co2Total} kg</span
                  >
                </td>
                <td>
                  <RowActionIcons
                    onEdit={() => loadTripIntoForm(t)}
                    onDelete={() => deleteTrip(t.id)}
                    editTitle="Sửa chuyến — tải lên form phía trên"
                    deleteTitle="Xóa chuyến công tác"
                  />
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>
