// listing.mjs — the self-listing pages: the join form (also the edit form),
// the page after sending, and the operator's moderation list. Plain forms that
// work with JS off; every input has a visible label; errors come first, as a
// list, and mark their fields aria-invalid.
import { html, raw } from '../lib/html.mjs'
import { operatorCategories, operatorZones } from '../lib/taxonomy.mjs'
import { LANGS, ENGAGEMENTS, UNITS, formatPhone } from '../lib/listing.mjs'
import { MAX_PHOTOS } from '../lib/photos.mjs'

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
export function listingForm(ctx, { values = {}, errors = [], mode = 'join', action, photos = [], token = '' }) {
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
<form class="listing" method="post" action="${action}" accept-charset="utf-8" enctype="multipart/form-data">
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

  ${ctx.config.photos ? html`
  <fieldset id="f-photos">
    <legend>${t('join.photos')} <span class="muted">(${t('common.optional')})</span></legend>
    <p class="hint" id="h-photos">${t('join.photos.hint')}</p>
    ${photos.length ? html`<div class="thumbs">${photos.map((p, i) => html`
      <label class="thumb"><img src="${ctx.base}/edit/${token}/photo/${p.id}" alt="${t('photo.alt', { n: i + 1 })}" loading="lazy">
        ${p.status === 'held' ? html`<span class="muted">${t('photo.pending')}</span>` : ''}
        <span class="check"><input type="checkbox" name="remove_photo" value="${p.id}"> ${t('photo.remove')}</span></label>`)}</div>` : ''}
    ${photos.length < MAX_PHOTOS ? html`<div class="field" style="margin-top:.4rem">
      <label for="f-photo-files">${t('join.photos')}</label>
      <input type="file" id="f-photo-files" name="photos" accept="image/jpeg,image/png,image/*" multiple
        aria-describedby="h-photos" data-max="${MAX_PHOTOS - photos.length}">
    </div>` : ''}
  </fieldset>` : ''}

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
</form>
${ctx.config.photos ? raw(SHRINK_JS) : ''}`
}

export function joinBody(ctx, opts) {
  const { t } = ctx
  return html`<h1>${t('join.title')}</h1><p>${t('join.intro')}</p>${listingForm(ctx, opts)}`
}

/** Photo outcome lines, from a report {added, held, person, other, over}. */
export function photoReport(t, r) {
  if (!r) return ''
  const lines = []
  if (r.added) lines.push(t('photo.added', { n: r.added }))
  if (r.held) lines.push(t('photo.held', { n: r.held }))
  if (r.person) lines.push(t('photo.refused.person', { n: r.person }))
  if (r.other) lines.push(t('photo.refused.other', { n: r.other }))
  if (r.over) lines.push(t('photo.limit', { n: MAX_PHOTOS }))
  return lines.length ? html`<ul>${lines.map((l) => html`<li>${l}</li>`)}</ul>` : ''
}

/** After a first send: where the listing stands, and the private link,
 *  shown once. The bot's reasons for a hold are not shown. */
export function doneBody(ctx, editUrl, { live = false, workerId = null, photos = null } = {}) {
  const { t } = ctx
  const share = `https://line.me/R/share?text=${encodeURIComponent(t('done.link') + ' ' + editUrl)}`
  return html`
<h1>${t('done.title')}</h1>
<p>${live ? t('done.live') : t('done.held')}${live && workerId ? html` <a href="${ctx.base}/w/${workerId}">${t('edit.view')}</a>` : ''}</p>
${photoReport(t, photos)}
<section class="notice" aria-labelledby="link-h">
  <h2 id="link-h" style="margin-top:0">${t('done.link')}</h2>
  <p>${t('done.link.hint')}</p>
  <a class="secret" href="${editUrl}">${editUrl}</a>
  <p><a class="btn primary" href="${share}">${t('done.saveLine')}</a></p>
</section>`
}

/** The private edit page: status, the form, and remove. */
export function editBody(ctx, w, { values, errors = [], saved, token, photos = [], report = null }) {
  const { t } = ctx
  const base = ctx.base || ''
  return html`
<h1>${t('edit.title')}</h1>
${saved ? html`<div class="notice" role="status">${saved === 'review' ? t('edit.saved.review') : t('edit.saved')}${photoReport(t, report)}</div>` : ''}
<p><strong>${t('edit.status')}:</strong> ${t('edit.status.' + (w.status || 'pending'))}
${w.status === 'live' ? html` · <a href="${base}/w/${w.id}">${t('edit.view')}</a>` : ''}</p>
${listingForm(ctx, { values, errors, mode: 'edit', action: `${base}/edit/${token}`, photos, token })}
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
/** One line per photo for the operator: when, what camera, where, what it
 *  says, and what that suggests. Strangers' text, escaped by html``. */
function photoMeta(ctx, p) {
  const bits = []
  if (p.taken_at) bits.push(p.taken_at.slice(0, 16))
  if (p.device) bits.push(p.device)
  if (p.lat != null) bits.push(html`<a href="https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=17/${p.lat}/${p.lon}" rel="noreferrer">${p.near_zone ? ctx.t('zone.' + p.near_zone) + ' ' + p.near_km + ' km' : p.lat + ',' + p.lon}</a>`)
  else bits.push('no location')
  let seen = null
  try { seen = p.seen_text ? JSON.parse(p.seen_text) : null } catch {}
  const words = seen ? [...seen.shop_names, ...seen.places, ...seen.phones, ...seen.line_ids, ...seen.urls, ...seen.text].slice(0, 12) : []
  return html`<div class="muted" style="font-size:.82rem">${p.what ? p.what + ' · ' : ''}${bits.map((b, i) => html`${i ? ' · ' : ''}${b}`)}${words.length ? html`<br>text: ${words.join(' | ')}` : ''}</div>`
}

export function adminBody(ctx, { pending, live, hidden, photos = [] }) {
  const { t } = ctx
  const base = ctx.base || ''
  const row = (w, actions) => html`
<tr>
  <td><strong>${w.display_name}</strong><br><span class="muted">${w.categories.map((c) => t('cat.' + c)).join(', ')}</span><br>
    <span class="muted">${w.zones.map((z) => t('zone.' + z)).join(', ')}</span></td>
  <td>${w.contact_line ? html`LINE ${w.contact_line}<br>` : ''}${w.contact_phone ? formatPhone(w.contact_phone) : ''}</td>
  <td>${w.about_th || ''}${w.about_th && w.about_en ? html`<br>` : ''}${w.about_en || ''}
    ${(w.photos || []).map((p) => html`<div style="display:flex;gap:.4rem;margin-top:.3rem"><img src="${base}/admin/photo/${p.id}" alt="" loading="lazy" style="width:4rem;height:auto;border-radius:.3rem">${photoMeta(ctx, p)}</div>`)}</td>
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
<h2>${t('admin.photos')} (${photos.length})</h2>
${photos.length ? html`<div class="thumbs">${photos.map((p) => html`
  <div class="thumb"><img src="${base}/admin/photo/${p.id}" alt="${p.what || ''}" loading="lazy">
    <span>${p.display_name}</span>${photoMeta(ctx, p)}
    <form method="post" action="${base}/admin/photo/${p.id}/approve"><button class="btn" type="submit">${t('admin.approve')}</button></form>
    <form method="post" action="${base}/admin/photo/${p.id}/delete"><button class="btn" type="submit">${t('admin.delete')}</button></form></div>`)}</div>`
  : html`<p class="muted">${t('admin.none')}</p>`}
<h2>${t('admin.hidden')} (${hidden.length})</h2>
${table(hidden, [['approve', t('admin.approve')], ['delete', t('admin.delete')]])}`
}

// Before a form with photos is sent, redraw each photo at most 1600 px wide as
// a JPEG: a phone's 4 MB original becomes a few hundred KB over a rural
// connection. The redraw drops the photo's EXIF, so the page first copies the
// EXIF block out of each original JPEG and sends it beside the photo, in a
// photo_exif field in the same order; the server keeps it privately and the
// public copy carries none. Without JavaScript the originals go up whole.
const SHRINK_JS = `<script>
(function(){var f=document.querySelector('form.listing');if(!f||!window.DataTransfer||!HTMLCanvasElement.prototype.toBlob)return;
function exif(file){return file.slice(0,262144).arrayBuffer().then(function(ab){var b=new Uint8Array(ab),i=2;
if(b[0]!==255||b[1]!==216)return'';while(i+4<=b.length&&b[i]===255){var m=b[i+1],n=(b[i+2]<<8)|b[i+3];if(m===218||n<2)break;
if(m===225&&b[i+4]===69&&b[i+5]===120&&b[i+6]===105&&b[i+7]===102){var s='',e=b.subarray(i+10,Math.min(b.length,i+2+n,i+10+65536));
for(var k=0;k<e.length;k+=32768)s+=String.fromCharCode.apply(null,e.subarray(k,k+32768));return btoa(s);}i+=2+n;}return'';}).catch(function(){return''});}
var busy=false;f.addEventListener('submit',function(e){var inp=f.querySelector('input[type=file]');
if(busy||!inp||!inp.files.length)return;e.preventDefault();busy=true;var max=+inp.dataset.max||4;
var files=[].slice.call(inp.files,0,max),out=new Array(files.length),metas=new Array(files.length),left=files.length;
function done(){if(--left)return;var dt=new DataTransfer();out.forEach(function(x){if(x)dt.items.add(x)});inp.files=dt.files;
metas.forEach(function(m,i){if(!out[i])return;var h=document.createElement('input');h.type='hidden';h.name='photo_exif';h.value=m||'';f.appendChild(h)});f.submit();}
files.forEach(function(file,i){exif(file).then(function(m){metas[i]=m;var url=URL.createObjectURL(file),im=new Image();
im.onload=function(){var s=Math.min(1,1600/Math.max(im.width,im.height)),c=document.createElement('canvas');
c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);c.getContext('2d').drawImage(im,0,0,c.width,c.height);
c.toBlob(function(b){URL.revokeObjectURL(url);out[i]=b?new File([b],'photo'+(i+1)+'.jpg',{type:'image/jpeg'}):file;done();},'image/jpeg',0.82);};
im.onerror=function(){URL.revokeObjectURL(url);out[i]=file;done();};im.src=url;});});});})();
</script>`
