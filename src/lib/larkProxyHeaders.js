/**
 * Node/Edge fetch tự giải nén gzip/br — không được chuyển tiếp Content-Encoding
 * (trình duyệt sẽ báo ERR_CONTENT_DECODING_FAILED / Failed to fetch).
 */

/** Header không chuyển tiếp từ upstream Lark → client */
export const LARK_PROXY_STRIP_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
])

/** @param {Headers} headers */
export function stripLarkProxyResponseHeaders(headers) {
  for (const name of LARK_PROXY_STRIP_RESPONSE_HEADERS) {
    headers.delete(name)
  }
}
