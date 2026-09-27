// directory.mjs — the Phase 0 product (§7.1). Browsable, filterable worker
// directory. Filters are LINKS (work with JS disabled); the result count is an
// aria-live region so it announces on navigation. Colour never sole signal.
import { html, raw } from '../lib/html.mjs'
import { tierStyles, workerCard } from './components.mjs'
import { operatorCategories, operatorZones } from '../lib/taxonomy.mjs'

const LANGS = ['th', 'en', 'my', 'shan']
const TIERS = ['T0', 'T1', 'T2', 'T3']
const ENGAGEMENTS = ['task', 'short', 'long']

/** Build an href that sets/clears one filter, preserving the rest. */
function filterHref(base, query, key, value) {
  const q = new URLSearchParams(query || {})
  if (value == null || q.get(key) === value) q.delete(key)
  else q.set(key, value)
  const s = q.toString()
  return base + '/' + (s ? '?' + s : '')
}

function chipRow(base, t, label, query, key, options) {
  const active = query[key]
  const anyOn = !active
  const chips = [
    html`<a class="btn ${anyOn ? 'on' : ''}" href="${filterHref(base, query, key, null)}"${anyOn ? raw(' aria-current="true"') : ''}>${t('dir.filter.any')}</a>`,
    ...options.map(({ value, label: lbl }) => {
      const on = active === value
      return html`<a class="btn ${on ? 'on' : ''}" href="${filterHref(base, query, key, value)}"${on ? raw(' aria-current="true"') : ''}>${lbl}</a>`
    }),
  ]
  return html`<div class="row"><span class="lbl" id="f-${key}">${label}</span><span role="group" aria-labelledby="f-${key}" class="chips">${chips}</span></div>`
}

export function directoryBody(ctx, workers, { shops = [], shopCounts = {} } = {}) {
  const { config, t, query } = ctx
  const base = ctx.base || ''
  const catOpts = operatorCategories(config).map((c) => ({ value: c.key, label: t(c.label_key) }))
  const zoneOpts = operatorZones(config).map((z) => ({ value: z.key, label: t(z.label_key) }))
  const langOpts = LANGS.map((l) => ({ value: l, label: t('lang.' + l) }))
  const tierOpts = TIERS.map((x) => ({ value: x, label: t('tier.' + x) }))
  const engOpts = ENGAGEMENTS.map((e) => ({ value: e, label: t('engagement.' + e) }))
  const labels = { cat: (k) => t('cat.' + k), zone: (k) => t('zone.' + k) }
  const count = workers.length === 1 ? t('dir.count.one') : t('dir.count', { n: workers.length })
  const joinUrl = config.hostname ? `https://${config.hostname}${base}/join` : ''
  const cta = config.selfListing ? html`
<div class="cta">
  <a class="btn primary" href="${base}/join">${t('dir.joinCta')}</a>
  ${joinUrl ? html`<a class="btn" href="https://line.me/R/share?text=${encodeURIComponent(t('join.title') + ' ' + joinUrl)}">${t('dir.shareJoin')}</a>` : ''}
</div>` : ''
  const shelves = (config.shelfLinks || []).length ? html`
<p class="muted">${t('nav.shelf')}: ${(config.shelfLinks).map((s, i) => html`${i ? raw(' · ') : ''}<a href="${s.href}">${s[ctx.locale] || s.en}</a>`)}</p>` : ''

  return html`
${tierStyles()}
<h1>${t('dir.title', { city: cityName(config, ctx.locale) })}</h1>
${config.selfListing ? html`<p class="lede">${t('dir.lede')}</p>` : ''}
${cta}
${ctx.config.roadGraph || shops.length ? html`<p class="near"><button class="btn" type="button" id="nearme">${t('near.button')}</button> <span id="nearnote" class="muted" aria-live="polite"></span></p>` : ''}
<section class="filters" aria-label="${t('action.search')}">
  ${chipRow(base, t, t('dir.filter.category'), query, 'category', catOpts)}
  ${chipRow(base, t, t('dir.filter.zone'), query, 'zone', zoneOpts)}
  ${chipRow(base, t, t('dir.filter.language'), query, 'language', langOpts)}
  ${chipRow(base, t, t('dir.filter.engagement'), query, 'engagement', engOpts)}
  ${config.showTiers !== false ? chipRow(base, t, t('dir.filter.tier'), query, 'tier', tierOpts) : ''}
</section>
<p aria-live="polite" class="muted"><strong>${count}</strong></p>
${workers.length === 0
  ? html`<div class="wcard"><p>${t('dir.empty')}</p><p class="muted">${t('dir.emptyHint')}</p></div>`
  : html`<ul class="card-list" id="people">${workers.map((w) => workerCard(ctx, w, labels))}</ul>`}
${shopSection(ctx, shops, shopCounts)}
${shelves}
${raw(NEAR_JS(ctx))}
`
}

export function cityName(config, locale) {
  const z = config.cityName
  if (z) return z[locale] || z.en || ''
  // fall back to brand tail
  return config.brandName.replace(/^HomeMatch\s*/, '')
}

/** Shops and firms from the Mot Dang directory. With a work type chosen: the
 *  top rows, each linking to its motdang page, and a link to the whole shelf.
 *  Without one: a count per work type. */
function shopSection(ctx, shops, counts) {
  const { t, config, query } = ctx
  const base = ctx.base || ''
  const cat = query.category
  const shelf = (k) => (config.shelves?.[k]?.[query.zone === 'chiang-rai' ? 'cr' : 'cm'])
  if (!cat) {
    const cats = Object.keys(counts).filter((k) => counts[k])
    if (!cats.length) return ''
    return html`<section class="shops" aria-labelledby="shops-h"><h2 id="shops-h">${t('shops.title')}</h2>
<p>${cats.map((k, i) => html`${i ? raw(' · ') : ''}<a href="${base}/?category=${k}">${t('cat.' + k)}</a> <span class="muted">(${counts[k]})</span>`)}</p></section>`
  }
  const n = counts[cat] || 0
  return html`<section class="shops" aria-labelledby="shops-h">
<h2 id="shops-h">${t('shops.title')} <span class="muted">(${n})</span></h2>
<p class="muted">${t('shops.note')}</p>
${shops.length ? html`<ul class="shoplist" id="shoplist" data-cat="${cat}">${shops.map((s) => shopRow(ctx, s))}</ul>` : ''}
${shelf(cat) ? html`<p><a href="${shelf(cat)}">${cat === 'laundry' ? t('shops.laundryOthers') : t('shops.all', { n })} →</a></p>` : ''}
</section>`
}

export function shopRow(ctx, s) {
  const { t } = ctx
  const name = ctx.locale === 'en' && s.name_en ? s.name_en : s.name_th || s.name_en
  return html`<li data-lat="${s.lat ?? ''}" data-lon="${s.lon ?? ''}"><a href="${s.url}">${name}</a>
  ${s.zone ? html`<span class="muted">· ${t('zone.' + s.zone)}</span>` : ''}
  ${s.pickup ? html`<span class="chip">${t('shops.pickup')}</span>` : ''}
  <span class="dist muted"></span>
  ${s.phone ? html`<a class="call" href="tel:${firstPhone(s.phone)}" rel="nofollow">${String(s.phone).split(/[,/]/)[0].trim()}</a>` : ''}</li>`
}

/** The first number of a field that may hold several ("053-210-642,053-217-168"). */
export function firstPhone(p) {
  return String(p).split(/[,/;]|\s{2,}/)[0].replace(/[^0-9+]/g, '')
}

// NEAR ME. The reader's position is asked for on a tap (or on arrival with
// ?near=1, from the Mot Dang home tile) and used in the page only. Inside the
// old-city road graph, distances are by road (ride mode, one-way streets
// honoured); outside it, straight line, and the label says which. People sort
// by the nearest centre of the areas they listed.
const NEAR_JS = (ctx) => {
  const L = {
    asking: ctx.t('near.asking'), denied: ctx.t('near.denied'), done: ctx.t('near.done'),
    road: ctx.t('near.road'), line: ctx.t('near.line'), area: ctx.t('near.area'), km: ctx.t('near.km'),
    pickup: ctx.t('shops.pickup'),
  }
  const cfg = { base: ctx.base || '', graph: ctx.config.roadGraph || '', L }
  return `<script>(function(){var C=${JSON.stringify(cfg).replace(/</g, '\\u003c')};
var b=document.getElementById('nearme'),note=document.getElementById('nearnote');if(!b||!navigator.geolocation)return;
function km(a,o,c,d){var r=Math.PI/180,x=Math.pow(Math.sin((c-a)*r/2),2)+Math.cos(a*r)*Math.cos(c*r)*Math.pow(Math.sin((d-o)*r/2),2);return 12742*Math.asin(Math.sqrt(x));}
function fmt(k){return (k<10?k.toFixed(1):Math.round(k))+' '+C.L.km;}
var G=null;function graph(){if(G)return Promise.resolve(G);return fetch(C.graph).then(function(r){return r.json()}).then(function(g){
var s=g.scale,n=g.nodes.map(function(p){return[p[0]/s,p[1]/s]}),adj=n.map(function(){return[]});
g.edges.forEach(function(e){if(e[3]&4)adj[e[0]].push([e[1],e[2]]);if(e[3]&8)adj[e[1]].push([e[0],e[2]]);});
var und=n.map(function(){return[]});g.edges.forEach(function(e){if(e[3]&12){und[e[0]].push(e[1]);und[e[1]].push(e[0]);}});
var lab=new Int32Array(n.length).fill(-1),best=-1,bestN=0;for(var i=0;i<n.length;i++){if(lab[i]>=0)continue;var q=[i],c=0;lab[i]=i;
while(q.length){var u=q.pop();c++;for(var k=0;k<und[u].length;k++){var v=und[u][k];if(lab[v]<0){lab[v]=i;q.push(v);}}}if(c>bestN){bestN=c;best=i;}}
var ok=new Uint8Array(n.length);for(var j=0;j<n.length;j++)ok[j]=lab[j]===best?1:0;G={area:g.area,n:n,adj:adj,ok:ok};return G;});}
function inArea(a,la,lo){return la>a.s&&la<a.n&&lo>a.w&&lo<a.e;}
function snap(g,la,lo){var best=-1,bd=1e18,c=Math.cos(la*Math.PI/180);for(var i=0;i<g.n.length;i++){if(g.ok&&!g.ok[i])continue;var y=g.n[i][0]-la,x=(g.n[i][1]-lo)*c,d=y*y+x*x;if(d<bd){bd=d;best=i;}}return[best,Math.sqrt(bd)*111.32];}
function dijkstra(g,src){var n=g.n.length,d=new Float64Array(n).fill(Infinity),H=[];d[src]=0;
function push(w,v){H.push([w,v]);var i=H.length-1;while(i){var p=(i-1)>>1;if(H[p][0]<=H[i][0])break;var t=H[p];H[p]=H[i];H[i]=t;i=p;}}
function pop(){var top=H[0],last=H.pop();if(H.length){H[0]=last;var i=0;for(;;){var l=2*i+1,r=l+1,m=i;if(l<H.length&&H[l][0]<H[m][0])m=l;if(r<H.length&&H[r][0]<H[m][0])m=r;if(m===i)break;var t=H[m];H[m]=H[i];H[i]=t;i=m;}}return top;}
push(0,src);while(H.length){var top=pop(),u=top[1];if(top[0]>d[u])continue;
var a=g.adj[u];for(var k=0;k<a.length;k++){var v=a[k][0],w=d[u]+a[k][1];if(w<d[v]){d[v]=w;push(w,v);}}}return d;}
function rows(){var list=document.getElementById('shoplist');if(!list)return Promise.resolve(null);
return fetch(C.base+'/shops.json?category='+encodeURIComponent(list.dataset.cat)).then(function(r){return r.json()}).then(function(all){return[list,all]}).catch(function(){return null});}
function go(){note.textContent=C.L.asking;navigator.geolocation.getCurrentPosition(function(p){
var la=p.coords.latitude,lo=p.coords.longitude;
rows().then(function(sh){var useRoad=C.graph&&G!==false;
return (useRoad?graph().then(function(g){return inArea(g.area,la,lo)?g:null}).catch(function(){return null}):Promise.resolve(null)).then(function(g){
var D=null,src=null;if(g){src=snap(g,la,lo);if(src[1]<.4)D=dijkstra(g,src[0]);else g=null;}
function dist(tla,tlo){var line=km(la,lo,tla,tlo);if(g&&D&&inArea(g.area,tla,tlo)){var t=snap(g,tla,tlo);if(t[1]<.4&&isFinite(D[t[0]]))return[(D[t[0]]/1000)+src[1]+t[1],1];}return[line,0];}
var people=document.getElementById('people');if(people){var cards=[].slice.call(people.children);cards.forEach(function(c){
var pts=(c.dataset.pts||'').split(';').filter(Boolean).map(function(x){return x.split(',').map(Number)});
var k=pts.length?Math.min.apply(null,pts.map(function(q){return km(la,lo,q[0],q[1])})):1e9;c.dataset.k=k;
var s=c.querySelector('.dist')||c.appendChild(Object.assign(document.createElement('p'),{className:'dist muted'}));s.textContent=k<1e9?C.L.area+' ~'+fmt(k)+' ('+C.L.line+')':'';});
cards.sort(function(a,b){return a.dataset.k-b.dataset.k}).forEach(function(c){people.appendChild(c)});}
if(sh){var list=sh[0],all=sh[1];var ranked=all.map(function(r){var d=dist(r[3],r[4]);return{r:r,k:d[0],road:d[1]}}).sort(function(a,b){return a.k-b.k}).slice(0,30);
list.textContent='';ranked.forEach(function(x){var r=x.r,li=document.createElement('li'),a=document.createElement('a');a.href=r[0];a.textContent=r[1]||r[2];li.appendChild(a);
if(r[7]){var ch=document.createElement('span');ch.className='chip';ch.textContent=C.L.pickup;li.appendChild(document.createTextNode(' '));li.appendChild(ch);}
var ds=document.createElement('span');ds.className='dist muted';ds.textContent=' · '+fmt(x.k)+' '+(x.road?C.L.road:C.L.line);li.appendChild(ds);
if(r[5]){var ph=String(r[5]).split(/[,\/;]/)[0].trim(),t=document.createElement('a');t.className='call';t.href='tel:'+ph.replace(/[^0-9+]/g,'');t.rel='nofollow';t.textContent=ph;li.appendChild(document.createTextNode(' '));li.appendChild(t);}
list.appendChild(li);});}
note.textContent=C.L.done;});});},function(){note.textContent=C.L.denied;},{enableHighAccuracy:false,timeout:15000,maximumAge:300000});}
b.addEventListener('click',go);if(/[?&]near=1/.test(location.search))go();})();</script>`
}
