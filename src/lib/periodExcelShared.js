/** Tên sheet & cột — phải khớp export / import / template */

import { COMPANIES } from './companies.js'

export const EXCEL_SHEET = {
  overview: 'Tổng quan',
  office: 'Văn phòng S1-S2',
  trip: 'Chuyến CT S3.6',
  commute: 'Đi làm S3.7',
}

/** Cột Single Option — trùng Lark & dropdown trên web */
export const EXCEL_COL_COMPANY = 'Công ty'

export const EXCEL_OFFICE_HEADERS = [
  'Thiết bị',
  EXCEL_COL_COMPANY,
  'Nguồn phát thải',
  'Scope',
  'Đơn vị',
  'Khối lượng',
  'EF (kg CO₂e/đvị)',
  'EF Reference',
  'Tổng GHG (tấn CO₂e)',
]

export const EXCEL_TRIP_HEADERS = [
  'Họ và tên',
  'Mã NV',
  EXCEL_COL_COMPANY,
  'Phòng ban',
  'Tên chuyến',
  'Mục đích',
  'Điểm xuất phát',
  'Điểm đến',
  'Ngày đi',
  'Ngày về',
  'CO₂ bay (kg)',
  'CO₂ mặt đất (kg)',
  'CO₂ lưu trú (kg)',
  'Tổng (kg CO₂e)',
]

export const EXCEL_COMMUTE_HEADERS = [
  'Họ và tên',
  'Mã NV',
  EXCEL_COL_COMPANY,
  'Phòng ban',
  'Phương tiện',
  'EF (kg/km)',
  'Km một chiều',
  'Ngày đi làm / tháng',
  'WFH (ngày/tháng)',
  'Carpool (người)',
  'CO₂e (kg)',
]

/** Số dòng tối đa có công thức (file mẫu / SUM) */
export const EXCEL_FORMULA_LAST_ROW = 200

/** Nhãn cột A trong sheet Tổng quan — công ty mặc định khi import */
export const EXCEL_OVERVIEW_COMPANY_LABEL = 'Công ty (mặc định kỳ)'
/** @deprecated file cũ */
export const EXCEL_OVERVIEW_COMPANY_LABEL_LEGACY = 'Tên công ty / đơn vị'
export const EXCEL_OVERVIEW_LOCATION_LABEL = 'Địa điểm / cơ sở'

/** Danh sách cho Data Validation dropdown trong Excel */
export const EXCEL_COMPANY_LIST = [...COMPANIES]

/** Formula Excel: "ECS,LEONG LEE,..." */
export const EXCEL_COMPANY_LIST_FORMULA = `"${EXCEL_COMPANY_LIST.join(',')}"`

/** Cột tùy chọn khi import file Excel cũ (chưa có cột Công ty / EF) */
export const EXCEL_OPTIONAL_COLUMNS = [EXCEL_COL_COMPANY, 'EF (kg/km)']

/** File xuất trước khi có cột Công ty */
export const EXCEL_OFFICE_HEADERS_LEGACY = [
  'Thiết bị',
  'Nguồn phát thải',
  'Scope',
  'Đơn vị',
  'Khối lượng',
  'EF (kg CO₂e/đvị)',
  'EF Reference',
  'Tổng GHG (tấn CO₂e)',
]

export const EXCEL_TRIP_HEADERS_LEGACY = [
  'Họ và tên',
  'Mã NV',
  'Phòng ban',
  'Tên chuyến',
  'Mục đích',
  'Điểm xuất phát',
  'Điểm đến',
  'Ngày đi',
  'Ngày về',
  'CO₂ bay (kg)',
  'CO₂ mặt đất (kg)',
  'CO₂ lưu trú (kg)',
  'Tổng (kg CO₂e)',
]

export const EXCEL_COMMUTE_HEADERS_LEGACY = [
  'Họ và tên',
  'Mã NV',
  'Phòng ban',
  'Phương tiện',
  'Km một chiều',
  'Ngày đi làm / tháng',
  'WFH (ngày/tháng)',
  'Carpool (người)',
  'CO₂e (kg)',
]
