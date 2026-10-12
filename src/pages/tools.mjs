// tools.mjs — two free pages for the person hiring and the person hired:
// /wage, the minimum-pay arithmetic for a household worker, and /agreement,
// the bilingual agreement with those numbers filled in, ready to print. Both
// are GET-only and work with JavaScript off; nothing is written to the db.
import { html, raw } from '../lib/html.mjs'
import { RATES, MR15, fmt } from '../lib/wage.mjs'
import { clauses, SIGNATURES, SOURCES } from '../lib/agreement.mjs'

const TOOL_CSS = `
form.wage{display:grid;gap:.9rem;max-width:34rem;margin:0 0 1.25rem}
form.wage label{font-weight:700;display:block;margin-bottom:.25rem}
form.wage select,form.wage input[type=number]{width:100%;min-height:44px;padding:.5rem .6rem;border:1px solid var(--border);
  border-radius:.5rem;background:var(--card);color:var(--text);font:inherit}
form.wage .radios{display:flex;flex-wrap:wrap;gap:.35rem}
form.wage .radios label{display:inline-flex;align-items:center;gap:.45rem;min-height:44px;padding:.3rem .8rem;font-weight:400;
  border:1px solid var(--border);border-radius:.6rem;background:var(--card);cursor:pointer;margin:0}
.result{border:2px solid var(--accent);border-radius:.75rem;padding:.8rem 1rem;margin:0 0 1rem;background:var(--card)}
.result .big{font-size:1.6rem;font-weight:700;margin:.1rem 0}
.result dl{display:grid;grid-template-columns:auto 1fr;gap:.25rem .9rem;margin:.5rem 0 0}
.result dt{color:var(--muted)}.result dd{margin:0;font-weight:700}
.floors{padding-left:1.2rem}.floors li{margin:.2rem 0}
.src{font-size:.85rem;color:var(--muted)}
.agr{border-collapse:collapse;width:100%;font-size:.95rem}
.agr td{vertical-align:top;padding:.5rem .6rem;border-bottom:1px solid var(--border);width:50%}
.agr .n{width:auto;white-space:nowrap;color:var(--muted)}
.agr h3{font-size:1rem;margin:0 0 .2rem}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:2.2rem 2rem;margin:2rem 0 1rem}
.sig div{border-top:1px solid var(--text);padding-top:.3rem}
@media (max-width:640px){.agr td{display:block;width:auto;border-bottom:0;padding:.25rem 0}.agr tr{display:block;border-bottom:1px solid var(--border);padding:.4rem 0}}
@media print{header.site,footer.site,.noprint,.skip{display:none!important}body{background:#fff;color:#000;font-size:11pt}
  .wrap{max-width:none;padding:0}.agr td{border-color:#999}a{color:#000;text-decoration:none}.agr tr{break-inside:avoid}}
`

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '')).toString()

export function wageBody(ctx, inp, min) {
  const { t } = ctx
  const base = ctx.base || ''
  const unit = t('wage.unit.' + min.unit)
  const opt = (v, cur, label) => html`<option value="${v}"${v === cur ? raw(' selected') : ''}>${label}</option>`
  const radio = (v) => html`<label><input type="radio" name="basis" value="${v}"${inp.basis === v ? raw(' checked') : ''}> ${t('wage.basis.' + v)}</label>`
  const area = min.area
  const gapLine = min.pay == null ? '' : min.gap >= 0
    ? html`<p>${t('wage.above', { pay: fmt(min.pay), unit, gap: fmt(min.gap) })}</p>`
    : html`<p><strong>${t('wage.below', { pay: fmt(min.pay), unit, gap: fmt(-min.gap) })}</strong></p>`
  return html`
<style>${raw(TOOL_CSS)}</style>
<h1>${t('wage.title')}</h1>
<p class="lede">${t('wage.lede')}</p>
<form class="wage noprint" method="get" action="${base}/wage">
  <div><label for="area">${t('wage.area')}</label>
    <select id="area" name="area">${RATES.areas.map((a) => opt(a.key, inp.area, `${ctx.locale === 'en' ? a.en : a.th} · ${a.thb} ${t('wage.bahtDay')}`))}</select></div>
  <div><span id="basis-l" style="font-weight:700;display:block;margin-bottom:.25rem">${t('wage.basis')}</span>
    <div class="radios" role="radiogroup" aria-labelledby="basis-l">${['day', 'month'].map(radio)}</div></div>
  <div><label for="days">${t('wage.days')}</label><input id="days" name="days" type="number" min="1" max="7" value="${inp.days}"></div>
  <div><label for="hours">${t('wage.hours')}</label><input id="hours" name="hours" type="number" min="1" max="12" value="${inp.hours}"></div>
  <div><label for="pay">${t('wage.pay')}</label><input id="pay" name="pay" type="number" min="0" step="1" inputmode="numeric" value="${inp.pay ?? ''}"></div>
  <div><button class="btn primary" type="submit">${t('wage.go')}</button></div>
</form>
<section class="result" aria-live="polite">
  <p>${t('wage.minFor', { area: ctx.locale === 'en' ? area.en : area.th })}</p>
  <p class="big">${fmt(min.perUnit)} ${t('wage.baht')} / ${unit}</p>
  <dl>
    <dt>${t('wage.rateDay')}</dt><dd>${fmt(min.rate)} ${t('wage.baht')}</dd>
    <dt>${t('wage.rateHour')}</dt><dd>${fmt(min.hourly)} ${t('wage.baht')}</dd>
    ${min.perWeek != null ? html`<dt>${t('wage.perWeek', { days: inp.days })}</dt><dd>${fmt(min.perWeek)} ${t('wage.baht')}</dd>` : ''}
    <dt>${t('wage.perMonth')}</dt><dd>${fmt(min.perMonth)} ${t('wage.baht')}</dd>
  </dl>
  ${gapLine}
  ${min.shortDay ? html`<p>${t('wage.shortDay', { h: inp.hours })}</p>` : ''}
  ${min.otHours ? html`<p>${t('wage.ot', { n: min.otHours })}</p>` : ''}
  ${min.restDayShort ? html`<p>${t('wage.restDay')}</p>` : ''}
  <p class="src">${t('wage.how.' + min.unit)}</p>
</section>
<p class="cta noprint"><a class="btn primary" href="${base}/agreement?${qs(inp)}">${t('wage.toAgreement')}</a></p>
<h2>${t('wage.floors')}</h2>
<ul class="floors">
  <li>${t('wage.f.hours', { h: MR15.hoursPerDay })}</li>
  <li>${t('wage.f.rest')}</li>
  <li>${t('wage.f.holidays', { n: MR15.holidays })}</li>
  <li>${t('wage.f.holidayPay')}</li>
  <li>${t('wage.f.annual', { n: MR15.annualLeaveDays })}</li>
  <li>${t('wage.f.sick', { n: MR15.sickPaidDays })}</li>
  <li>${t('wage.f.business', { n: MR15.businessLeaveDays })}</li>
  <li>${t('wage.f.maternity', { n: MR15.maternityDays, paid: MR15.maternityPaidDays })}</li>
  <li>${t('wage.f.deduct', { each: MR15.deductEachPct, total: MR15.deductTotalPct })}</li>
  <li>${t('wage.f.notStatutory')}</li>
</ul>
<p class="src">${ctx.locale === 'en' ? SOURCES.en : SOURCES.th} · <a href="${RATES.notification.url}">mol.go.th</a> · <a href="${MR15.url}">labour.go.th</a> · <a href="${MR15.maternityLaw.url}">${t('wage.f.maternityLink')}</a></p>
`
}

export function agreementBody(ctx, inp, min) {
  const { t } = ctx
  const base = ctx.base || ''
  const rows = clauses({ ...inp, min })
  return html`
<style>${raw(TOOL_CSS)}</style>
<p class="noprint"><a href="${base}/wage?${qs(inp)}">← ${t('wage.title')}</a> · <button class="btn" type="button" onclick="print()">${t('agr.print')}</button></p>
<h1>หนังสือสัญญาจ้างแรงงานในงานบ้าน<br><span style="font-weight:400">Household Employment Agreement</span></h1>
<p class="noprint muted">${t('agr.lede')}</p>
<table class="agr">
${rows.map((c, i) => html`<tr><td class="n">${i + 1}.</td><td lang="th"><h3>${c.head.th}</h3>${c.th}</td><td lang="en"><h3>${c.head.en}</h3>${c.en}</td></tr>`)}
</table>
<div class="sig">
${SIGNATURES.map((s) => html`<div>${s.th} · ${s.en}<br><span class="muted">(${'_'.repeat(28)})</span><br>วันที่ · Date ________</div>`)}
</div>
<p class="src" lang="th">${SOURCES.th}</p>
<p class="src" lang="en">${SOURCES.en}</p>
`
}
