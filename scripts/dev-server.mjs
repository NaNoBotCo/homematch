// dev-server.mjs — local runtime. Bridges Node's http server to the Hono app's
// standard fetch handler using node:sqlite as the DB, so the exact same app.mjs
// that deploys to Cloudflare/D1 runs locally with zero extra deps. Not the
// production server — that's Cloudflare Pages/Workers (see wrangler.toml).
import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { createApp } from '../src/app.mjs'
import { nodeDb } from '../src/db.mjs'
import { migrateNode } from '../src/migrate.mjs'
import { DB_PATH, seed } from './seed.mjs'
import { stripBase } from '../src/worker.mjs'

const PORT = Number(process.env.PORT) || 4310
// Same variables the Worker reads. BASE_PATH=/home-help serves the app under
// that path, as motdang.net does; ADMIN_KEY turns on /admin.
const ENV = {
  BASE_PATH: process.env.BASE_PATH || '',
  ADMIN_KEY: process.env.ADMIN_KEY || '',
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev',
}

if (!existsSync(DB_PATH)) {
  console.log('no dev DB — seeding…')
  await seed()
}
const raw = new DatabaseSync(DB_PATH)
migrateNode(raw) // ensure up to date
const db = nodeDb(raw)
const app = createApp(() => db)

const server = createServer(async (req, res) => {
  try {
    const url = new URL(`http://${req.headers.host || 'localhost'}${req.url}`)
    const inner = stripBase(url.pathname, ENV.BASE_PATH)
    if (inner === null) { res.statusCode = 404; return res.end('outside BASE_PATH') }
    url.pathname = inner
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req)
    const request = new Request(url, { method: req.method, headers: req.headers, body })
    const response = await app.fetch(request, ENV)
    res.statusCode = response.status
    for (const [k, v] of response.headers) if (k !== 'set-cookie') res.setHeader(k, v)
    const cookies = response.headers.getSetCookie?.() ?? []
    if (cookies.length) res.setHeader('set-cookie', cookies)
    const buf = Buffer.from(await response.arrayBuffer())
    res.end(buf)
  } catch (e) {
    res.statusCode = 500
    res.end('server error: ' + (e?.stack || e))
  }
})

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`homematch dev server → http://localhost:${PORT}  (tenant: localhost)`)
})
