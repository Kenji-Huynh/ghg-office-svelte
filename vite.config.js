import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { LARK_PROXY_STRIP_RESPONSE_HEADERS } from './src/lib/larkProxyHeaders.js'

const LARK_TARGET = 'https://open.larksuite.com'

/** @param {import('http').IncomingMessage} req @param {import('http').ServerResponse} res @param {(err?: unknown) => void} next @param {string} mountPrefix */
function larkProxyMiddleware(req, res, next, mountPrefix) {
  ;(async () => {
    try {
      const incoming = new URL(req.url || '/', 'http://localhost')
      const target = new URL(
        incoming.pathname.replace(new RegExp(`^${mountPrefix}`), '') + incoming.search,
        LARK_TARGET,
      )
      const headers = { ...req.headers, host: 'open.larksuite.com' }
      delete headers['content-length']

      const hasBody = req.method && !['GET', 'HEAD'].includes(req.method)
      const body = hasBody
        ? await new Promise((resolve, reject) => {
            const chunks = []
            req.on('data', (c) => chunks.push(c))
            req.on('end', () => resolve(Buffer.concat(chunks)))
            req.on('error', reject)
          })
        : undefined

      const upstream = await fetch(target, { method: req.method, headers, body })
      const buf = Buffer.from(await upstream.arrayBuffer())
      res.statusCode = upstream.status
      upstream.headers.forEach((value, key) => {
        if (LARK_PROXY_STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) return
        res.setHeader(key, value)
      })
      res.setHeader('Content-Length', String(buf.length))
      res.end(buf)
    } catch (err) {
      next(err)
    }
  })()
}

/** Proxy Lark Open API — tránh CORS khi gọi từ trình duyệt (localhost / trycloudflare). */
function larkOpenApiProxyPlugin() {
  /** @param {{ middlewares: { use: (path: string, fn: typeof larkProxyMiddleware) => void } }} server */
  function attach(server) {
    server.middlewares.use('/lark-open-api', (req, res, next) =>
      larkProxyMiddleware(req, res, next, '/lark-open-api'),
    )
    // Build preview / tunnel: production bundle gọi /api/lark — map về cùng proxy
    server.middlewares.use('/api/lark', (req, res, next) =>
      larkProxyMiddleware(req, res, next, '/api/lark'),
    )
  }

  return {
    name: 'lark-open-api-proxy',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte({
      onwarn(warning, defaultHandler) {
        if (warning.code?.startsWith('a11y_')) return
        defaultHandler(warning)
      },
    }),
    larkOpenApiProxyPlugin(),
  ],
  server: {
    /** Quick Tunnel (*.trycloudflare.com) — Host header không phải localhost */
    allowedHosts: ['.trycloudflare.com'],
  },
  preview: {
    allowedHosts: ['.trycloudflare.com'],
  },
})
