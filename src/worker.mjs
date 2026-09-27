// worker.mjs — the Cloudflare production entry. Same Hono app as local dev,
// bound to D1 instead of node:sqlite. Deploy target: Cloudflare Workers with a
// D1 database bound as `DB` (see wrangler.toml). Requires nodejs_compat for
// node:crypto (session signing / OTP hashing / edit-link hashes).
//
// BASE_PATH mounts the app under a path on someone else's hostname — on
// motdang.net the Worker answers motdang.net/home-help* by route, and the site
// Worker keeps everything else. The prefix is stripped here so the routes in
// app.mjs stay root-relative.
import { createApp } from './app.mjs'
import { d1Db } from './db.mjs'

const app = createApp((env) => d1Db(env.DB))

/** Strip `base` from a request path. Returns the inner path ('/' for the base
 *  itself), or null when the path is outside the base. */
export function stripBase(pathname, base) {
  if (!base) return pathname
  if (pathname === base) return '/'
  if (pathname.startsWith(base + '/')) return pathname.slice(base.length)
  return null
}

export default {
  fetch(request, env, ctx) {
    const base = env.BASE_PATH || ''
    if (base) {
      const url = new URL(request.url)
      const inner = stripBase(url.pathname, base)
      if (inner === null) return new Response('Not found', { status: 404 })
      url.pathname = inner
      request = new Request(url, request)
    }
    return app.fetch(request, env, ctx)
  },
}
