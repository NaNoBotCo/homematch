// worker.mjs — the Cloudflare production entry. Same Hono app as local dev,
// bound to D1 instead of node:sqlite. Deploy target: Cloudflare Pages/Workers
// with a D1 database bound as `DB` (see wrangler.toml). Requires nodejs_compat
// for node:crypto (session signing / OTP hashing).
import { createApp } from './app.mjs'
import { d1Db } from './db.mjs'

const app = createApp((env) => d1Db(env.DB))

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx)
  },
}
