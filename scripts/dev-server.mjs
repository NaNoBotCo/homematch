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

const PORT = Number(process.env.PORT) || 4310

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
    const url = `http://${req.headers.host || 'localhost'}${req.url}`
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req)
    const request = new Request(url, { method: req.method, headers: req.headers, body })
    const response = await app.fetch(request, {})
    res.statusCode = response.status
    response.headers.forEach((v, k) => res.setHeader(k, v))
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
