/**
 * Vercel Edge — proxy Lark Open API (/api/lark/*).
 */
export const config = { runtime: 'edge' }

const LARK_ORIGIN = 'https://open.larksuite.com'
const UPSTREAM_MS = 55_000

/** @param {string} targetUrl @param {RequestInit} init */
async function fetchLark(targetUrl, init) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), UPSTREAM_MS)
  try {
    return await fetch(targetUrl, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

/** @param {Request} request */
export default async function handler(request) {
  try {
    const url = new URL(request.url)
    const sub = url.pathname.replace(/^\/api\/lark\/?/, '')
    const targetUrl = `${LARK_ORIGIN}/${sub}${url.search}`

    const headers = new Headers(request.headers)
    headers.set('host', 'open.larksuite.com')
    headers.delete('connection')

    const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
    const upstream = await fetchLark(targetUrl, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
    })

    const outHeaders = new Headers(upstream.headers)
    outHeaders.delete('content-encoding')
    outHeaders.delete('content-length')
    outHeaders.delete('transfer-encoding')

    return new Response(upstream.body, {
      status: upstream.status,
      headers: outHeaders,
    })
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return new Response(
      JSON.stringify({
        code: -1,
        msg: aborted ? 'Lark API timeout (proxy)' : 'Lark proxy error',
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    )
  }
}
