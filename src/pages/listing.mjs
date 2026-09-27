// listing.mjs — the self-listing pages: the join form (also the edit form),
// the page after sending, and the operator's moderation list. Plain forms that
// work with JS off; every input has a visible label; errors come first, as a
// list, and mark their fields aria-invalid.
import { html, raw } from '../lib/html.mjs'
import { operatorCategories, operatorZones } from '../lib/taxonomy.mjs'
import { LANGS, ENGAGEMENTS, UNITS, formatPhone } from '../lib/listing.mjs'

const FIELD_OF = {
  'err.name': 'f-name', 'err.categories': 'f-categories', 'err.zones': 'f-zones',
  'err.contact': 'f-contact', 'err.line': 'f-line', 'err.phone': 'f-phone',
  'err.consent': 'f-consent', 'err.rate': 'f-rate', 'err.years': 'f-years',
}

function checks(name, options, chosen) {
  const set = new Set(chosen || [])
  return html`<div class="checks">${options.map(({ value, label }) => html`
    <label class="check"><input type="checkbox" name="${name}" value="${value}"${set.has(value) ? raw(' checked') : ''}> ${label}</label>`)}</div>`
}

/** The form. `mode` is 'join' or 'edit'; `action` the POST target. */
export function listingForm(ctx, { values = {}, errors = [], mode = 'join', action }) {
  const { config, t } = ctx
  const bad = new Set(errors)
  const inv = (...keys) => (keys.some((k) => bad.has(k)) ? raw(' aria-invalid="true"') : '')
  const cats = operatorCategories(config).map((c) => ({ value: c.key, label: t(c.label_key) }))
  const zones = operatorZones(config).map((z) => ({ value: z.key, label: t(z.label_key) }))
  const langs = LANGS.map((l) => ({ value: l, label: t('lang.' + l) }))
  const engs = ENGAGEMENTS.map((e) => ({ value: e, label: t('engagement.' + e) }))
  return html`
${errors.length ? html`
<div class="errors" role="alert" tabindex="-1" id="errors">
  <strong>${t('join.errors')}</strong>
  <ul>${errors.map((e) => html`<li><a href="#${FIELD_OF[e] || 'main'}">${t(e)}</a></li>`)}</ul>
</div>` : ''}
<form class="listing" method="post" action="${action}" accept-charset="utf-8">
  <div class="field">
    <label for="f-name">${t('join.name')}</label>
    <p class="hint" id="h-name">${t('join.name.hint')}</p>
    <input type="text" id="f-name" name="display_name" maxlength="40" autocomplete="nickname" required
      aria-describedby="h-name" value="${values.display_name ?? ''}"${inv('err.name')}>
  </div>

  <fieldset id="f-categories"${inv('err.categories')}>
    <legend>${t('join.services')}</legend>
    ${checks('categories', cats, values.categories)}
  </fieldset>

  <fieldset id="f-zones"${inv('err.zones')}>
    <legend>${t('join.areas')}</legend>
    ${checks('zones', zones, values.zones)}
  </fieldset>

  <fieldset id="f-contact"${inv('err.contact')}>
    <legend>${t('join.contact')}</legend>
    <p class="hint">${t('join.contact.hint')}</p>
    <div class="field">
      <label for="f-line">${t('join.line')}</label>
      <input type="text" id="f-line" name="contact_line" maxlength="60" autocapitalize="off" autocomplete="off"
        spellcheck="false" value="${values.raw_line ?? ''}"${inv('err.line', 'err.contact')}>
    </div>
    <div class="field">
      <label for="f-phone">${t('join.phone')}</label>
      <input type="tel" id="f-phone" name="contact_phone" maxlength="20" autocomplete="tel"
        value="${values.raw_phone ?? ''}"${inv('err.phone', 'err.contact')}>
    </div>
  </fieldset>

  <fieldset>
    <legend>${t('join.rate')} <span class="muted">(${t('common.optional')})</span></legend>
    <div class="inline">
      <div class="field">
        <label for="f-rate">${t('join.rate.amount')}</label>
        <input type="text" inputmode="numeric" id="f-rate" name="rate_amount" maxlength="9" style="max-width:9rem"
          value="${values.rate_amount ?? ''}"${inv('err.rate')}>
      </div>
      <div class="field">
        <label for="f-unit">${t('join.rate.unit')}</label>
        <select id="f-unit" name="rate_unit" style="max-width:10rem">
          ${UNITS.map((u) => html`<option value="${u}"${(values.rate_unit || 'day') === u ? raw(' selected') : ''}>${t('unit.' + u)}</option>`)}
        </select>
      </div>
    </div>
  </fieldset>

  <fieldset>
    <legend>${t('join.languages')}</legend>
    ${checks('languages', langs, values.languages)}
  </fieldset>

  <fieldset>
    <legend>${t('join.engagement')}</legend>
    ${checks('engagements', engs, values.engagements)}
    <label class="check" style="margin-top:.35rem"><input type="checkbox" name="live_in"${values.live_in_possible ? raw(' checked') : ''}> ${t('join.liveIn')}</label>
  </fieldset>

  <div class="field">
    <label for="f-years">${t('join.years')} <span class="muted">(${t('common.optional')})</span></label>
    <input type="text" inputmode="numeric" id="f-years" name="years_experience" maxlength="2" style="max-width:6rem"
      value="${values.years_experience ?? ''}"${inv('err.years')}>
  </div>

  <div class="field">
    <label for="f-about-th">${t('join.aboutTh')} <span class="muted">(${t('common.optional')})</span></label>
    <textarea id="f-about-th" name="about_th" maxlength="600" lang="th">${values.about_th ?? ''}</textarea>
  </div>
  <div class="field">
    <label for="f-about-en">${t('join.aboutEn')} <span class="muted">(${t('common.optional')})</span></label>
    <textarea id="f-about-en" name="about_en" maxlength="600" lang="en">${values.about_en ?? ''}</textarea>
  </div>

  <fieldset>
    <legend>${t('join.indexable')}</legend>
    <p class="hint" id="h-index">${t('join.indexable.hint')}</p>
    <label class="check"><input type="checkbox" name="indexable" aria-describedby="h-index"${values.indexable ? raw(' checked') : ''}> ${t('join.indexable')}</label>
  </fieldset>

  <div class="field" id="f-consent">
    <label class="check"><input type="checkbox" name="consent" required${values.consent ? raw(' checked') : ''}${inv('err.consent')}> ${t('join.consent')}</label>
  </div>

  <div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>

  <button class="btn primary" type="submit">${mode === 'edit' ? t('edit.save') : t('join.submit')}</button>
</form>`
}

export function joinBody(ctx, opts) {
  const { t } = ctx
  return html`<h1>${t('join.title')}</h1><p>${t('join.intro')}</p>${listingForm(ctx, opts)}`
}

/** After a first send: the private link, shown once. */
export function doneBody(ctx, editUrl) {
  const { t } = ctx
  const share = `https://line.me/R/share?text=${encodeURIComponent(t('done.link') + ' ' + editUrl)}`
  return html`
<h1>${t('done.title')}</h1>
<p>${t('done.body')}</p>
<section class="notice" aria-labelledby="link-h">
  <h2 id="link-h" style="margin-top:0">${t('done.link')}</h2>
  <p>${t('done.link.hint')}</p>
  <a class="secret" href="${editUrl}">${editUrl}</a>
  <p><a class="btn primary" href="${share}">${t('done.saveLine')}</a></p>
</section>`
}

/** The private edit page: status, the form, and remove. */
export function editBody(ctx, w, { values, errors = [], saved, token }) {
  const { t } = ctx
  const base = ctx.base || ''
  return html`
<h1>${t('edit.title')}</h1>
${saved ? html`<div class="notice" role="status">${saved === 'review' ? t('edit.saved.review') : t('edit.saved')}</div>` : ''}
<p><strong>${t('edit.status')}:</strong> ${t('edit.status.' + (w.status || 'pending'))}
${w.status === 'live' ? html` · <a href="${base}/w/${w.id}">${t('edit.view')}</a>` : ''}</p>
${listingForm(ctx, { values, errors, mode: 'edit', action: `${base}/edit/${token}` })}
<form method="post" action="${base}/edit/${token}/remove" style="margin-top:2rem">
  <p class="muted">${t('edit.remove.hint')}</p>
  <button class="btn" type="submit">${t('edit.remove')}</button>
</form>`
}

export function removedBody(ctx) {
  const { t } = ctx
  const base = ctx.base || ''
  return html`<h1>${t('edit.removed')}</h1><p><a href="${base}/">← ${t('nav.directory')}</a></p>`
}

/** Operator moderation list. Buttons POST to /admin/<id>/<action>. */
export function adminBody(ctx, { pending, live, hidden }) {
  const { t } = ctx
  const base = ctx.base || ''
  const row = (w, actions) => html`
<tr>
  <td><strong>${w.display_name}</strong><br><span class="muted">${w.categories.map((c) => t('cat.' + c)).join(', ')}</span><br>
    <span class="muted">${w.zones.map((z) => t('zone.' + z)).join(', ')}</span></td>
  <td>${w.contact_line ? html`LINE ${w.contact_line}<br>` : ''}${w.contact_phone ? formatPhone(w.contact_phone) : ''}</td>
  <td>${w.about_th || ''}${w.about_th && w.about_en ? html`<br>` : ''}${w.about_en || ''}</td>
  <td>${w.updated_at || w.created_at}${w.indexable ? html`<br><span class="muted">index</span>` : ''}</td>
  <td>${actions.map(([a, label]) => html`<form method="post" action="${base}/admin/${w.id}/${a}"><button class="btn" type="submit">${label}</button></form> `)}
    ${w.status === 'live' ? html`<a href="${base}/w/${w.id}">→</a>` : ''}</td>
</tr>`
  const table = (rows, actions) => rows.length
    ? html`<table class="adm"><tbody>${rows.map((w) => row(w, actions))}</tbody></table>`
    : html`<p class="muted">${t('admin.none')}</p>`
  return html`
<h1>${t('admin.title')}</h1>
<h2>${t('admin.pending')} (${pending.length})</h2>
${table(pending, [['approve', t('admin.approve')], ['delete', t('admin.delete')]])}
<h2>${t('admin.live')} (${live.length})</h2>
${table(live, [['hide', t('admin.hide')]])}
<h2>${t('admin.hidden')} (${hidden.length})</h2>
${table(hidden, [['approve', t('admin.approve')], ['delete', t('admin.delete')]])}`
}
