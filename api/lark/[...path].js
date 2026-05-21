/**
 * Vercel Edge — proxy Lark Open API (/api/lark/*).
 */
export const config = { runtime: 'edge' }

const LARK_ORIGIN = 'https://open.larksuite.com'

/** @param {Request} request */
export default async function handler(request) {
  const url = new URL(request.url)
  const sub = url.pathname.replace(/^\/api\/lark\/?/, '')
  const targetUrl = `${LARK_ORIGIN}/${sub}${url.search}`

  const headers = new Headers(request.headers)
  headers.set('host', 'open.larksuite.com')
  headers.delete('connection')

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  })
}
