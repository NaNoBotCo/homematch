// operator-sql.mjs — print the SQL that installs (or refreshes) one tenant's
// operator row and taxonomy in D1, from tenants/<id>.json. The config is
// validated first, so a theme that fails contrast never reaches production.
//   node scripts/operator-sql.mjs motdang > /tmp/op.sql
//   npx wrangler d1 execute homematch --remote --file=/tmp/op.sql
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertConfigValid } from '../src/lib/tenant.mjs'
import { operatorCategories, operatorZones } from '../src/lib/taxonomy.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const id = process.argv[2]
if (!id) { console.error('usage: operator-sql.mjs <tenant-id>'); process.exit(2) }
const config = assertConfigValid(JSON.parse(readFileSync(join(ROOT, 'tenants', `${id}.json`), 'utf8')))
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

const out = [
  `INSERT INTO operator(id, hostname, brand_name, config_json) VALUES (${q(id)}, ${q(config.hostname)}, ${q(config.brandName)}, ${q(JSON.stringify(config))})
   ON CONFLICT(id) DO UPDATE SET hostname=excluded.hostname, brand_name=excluded.brand_name, config_json=excluded.config_json;`,
  `UPDATE service_category SET active=0 WHERE operator_id=${q(id)};`,
  `UPDATE zone SET active=0 WHERE operator_id=${q(id)};`,
]
operatorCategories(config).forEach((c, i) => out.push(
  `INSERT INTO service_category(operator_id, key, label_key, sort, requires_license, wants_certificate, active)
   VALUES (${q(id)}, ${q(c.key)}, ${q(c.label_key)}, ${i}, ${c.requires_license ? 1 : 0}, ${c.wants_certificate ? 1 : 0}, 1)
   ON CONFLICT(operator_id, key) DO UPDATE SET label_key=excluded.label_key, sort=excluded.sort,
     requires_license=excluded.requires_license, wants_certificate=excluded.wants_certificate, active=1;`))
operatorZones(config).forEach((z, i) => out.push(
  `INSERT INTO zone(operator_id, key, label_key, sort, active) VALUES (${q(id)}, ${q(z.key)}, ${q(z.label_key)}, ${i}, 1)
   ON CONFLICT(operator_id, key) DO UPDATE SET label_key=excluded.label_key, sort=excluded.sort, active=1;`))
console.log(out.join('\n'))
