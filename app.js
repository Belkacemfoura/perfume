'use strict';
/* Perfume business app – v0.1
   Single-user, offline-first web app. Data lives in IndexedDB on the phone.
   Libraries are loaded on demand from a CDN and cached by the service worker:
   - jsQR for reading QR codes from the camera
   - SheetJS for writing the NIIMBOT label file (.xlsx)                       */

const APP_VERSION = '0.1.0';
const SIZES = [10, 30, 50, 100];
const CATEGORIES = ['Oils', 'Alcohol', 'Bottles', 'Boxes', 'Stickers', 'Delivery', 'Bazaar fee', 'Other'];
const CURRENCY = 'SAR';
const LIBS = {
  jsqr: 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
};

/* ---------------- storage ---------------- */
const DB_NAME = 'perfume-app';
const STORES = ['scents', 'batches', 'sales', 'expenses', 'meta'];
let db;
const S = { scents: [], batches: [], sales: [], expenses: [], meta: [] };

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); });
    };
    req.onsuccess = () => { db = req.result; resolve(); };
    req.onerror = () => reject(req.error);
  });
}
function idbAll(store) {
  return new Promise((resolve, reject) => {
    const r = db.transaction(store, 'readonly').objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}
function idbPut(store, obj) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).put(obj);
    t.oncomplete = () => resolve(obj);
    t.onerror = () => reject(t.error);
  });
}
function idbDel(store, id) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
function idbClear(store) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
async function loadAll() { for (const s of STORES) S[s] = await idbAll(s); }
async function save(store, obj) {
  await idbPut(store, obj);
  const i = S[store].findIndex(x => x.id === obj.id);
  if (i >= 0) S[store][i] = obj; else S[store].push(obj);
  return obj;
}
async function remove(store, id) { await idbDel(store, id); S[store] = S[store].filter(x => x.id !== id); }
function meta(key, fallback) { const m = S.meta.find(x => x.id === key); return m ? m.value : fallback; }
function setMeta(key, value) { return save('meta', { id: key, value }); }

/* ---------------- helpers ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
const money = n => (n < 0 ? '− ' : '') + CURRENCY + ' ' + (Math.round(Math.abs(n) * 100) / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 });
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fmtDate = iso => new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = iso => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const sameDay = (iso, day) => iso.slice(0, 10) === day;
const monthKey = iso => iso.slice(0, 7);
const pad2 = n => String(n).padStart(2, '0');
const localISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 19); };

function toast(msg, err) {
  $$('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
const loaded = {};
function loadScript(key) {
  if (loaded[key]) return loaded[key];
  loaded[key] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = LIBS[key]; s.onload = resolve;
    s.onerror = () => { delete loaded[key]; reject(new Error('Could not load ' + key)); };
    document.head.appendChild(s);
  });
  return loaded[key];
}
const ICON = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  bottle: '<path d="M10 3h4v3l2 2v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8l2-2z"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
  money: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'
};
const icon = (name, size = 22, color = 'currentColor', w = 1.8) =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;

/* ---------------- domain logic ---------------- */
const scentById = id => S.scents.find(s => s.id === id);
const batchByCode = code => S.batches.find(b => b.code === code);
const scentName = id => (scentById(id) || { name: 'Unknown scent' }).name;
const sortedScents = () => S.scents.slice().sort((a, b) => a.name.localeCompare(b.name));

function nextScentCode() {
  const n = S.scents.reduce((m, s) => Math.max(m, parseInt((s.code || 'S0').slice(1), 10) || 0), 0) + 1;
  return 'S' + pad2(n);
}
function nextBatchCode() {
  const n = S.batches.reduce((m, b) => Math.max(m, parseInt((b.code || 'B-0').slice(2), 10) || 0), 0) + 1;
  return 'B-' + pad2(n);
}
// QR text printed on every label: PF|<batch>|<scent code>|<size>
const labelCode = (batchCode, scent, size) => `PF|${batchCode}|${scent.code}|${size}`;
function parseLabel(text) {
  const p = String(text || '').trim().split('|');
  if (p.length !== 4 || p[0] !== 'PF') return null;
  const scent = S.scents.find(s => s.code === p[2]);
  const size = parseInt(p[3], 10);
  const batch = batchByCode(p[1]);
  if (!scent || !batch || !SIZES.includes(size)) return null;
  return { scent, size, batch };
}

// how many of scent/size/batch were made, sold, and are left
function soldCount(batchCode, scentId, size) {
  let n = 0;
  for (const sale of S.sales) for (const l of sale.lines) if (l.batchCode === batchCode && l.scentId === scentId && l.size === size) n++;
  return n;
}
function madeCount(batch, scentId, size) {
  const it = batch.items.find(i => i.scentId === scentId && i.size === size);
  return it ? it.qty : 0;
}
const leftIn = (batch, scentId, size, cart = []) =>
  madeCount(batch, scentId, size) - soldCount(batch.code, scentId, size) -
  cart.filter(l => l.batchCode === batch.code && l.scentId === scentId && l.size === size).length;

function stockFor(scentId) {
  const bySize = {}; SIZES.forEach(z => bySize[z] = 0);
  const batches = [];
  for (const b of S.batches) {
    let left = 0, made = 0;
    for (const z of SIZES) { const l = leftIn(b, scentId, z); bySize[z] += l; left += l; made += madeCount(b, scentId, z); }
    if (made > 0) batches.push({ batch: b, left });
  }
  batches.sort((a, b) => b.batch.date.localeCompare(a.batch.date));
  return { bySize, total: Object.values(bySize).reduce((a, b) => a + b, 0), batches };
}
const lowLevel = s => (s.lowAt ?? 3);
function lowStockList() {
  const out = [];
  for (const s of S.scents) {
    const st = stockFor(s.id);
    for (const z of SIZES) {
      const everMade = S.batches.some(b => madeCount(b, s.id, z) > 0);
      if (everMade && st.bySize[z] <= lowLevel(s)) out.push({ scent: s, size: z, left: st.bySize[z] });
    }
  }
  return out.sort((a, b) => a.left - b.left);
}
// oldest batch that still has stock – used when adding a bottle without scanning
function oldestBatchWithStock(scentId, size, cart) {
  return S.batches.slice().sort((a, b) => a.date.localeCompare(b.date)).find(b => leftIn(b, scentId, size, cart) > 0);
}
function batchMl(batch) { return batch.items.reduce((a, i) => a + i.qty * i.size, 0); }
function batchExpenses(batch) { return S.expenses.filter(e => e.batchCode === batch.code).reduce((a, e) => a + e.amount, 0); }
function costPerMl(batch) { const ml = batchMl(batch); return ml ? batchExpenses(batch) / ml : 0; }
function lineCost(l) { const b = batchByCode(l.batchCode); return b ? costPerMl(b) * l.size : 0; }

function monthTotals(key) {
  const sales = S.sales.filter(s => monthKey(s.at) === key);
  const revenue = sales.reduce((a, s) => a + s.total, 0);
  const expenses = S.expenses.filter(e => monthKey(e.date) === key).reduce((a, e) => a + e.amount, 0);
  return { revenue, expenses, profit: revenue - expenses, bottles: sales.reduce((a, s) => a + s.lines.length, 0) };
}

/* ---------------- shell & routing ---------------- */
const app = $('#app');
let cleanup = null;
function tabs(active) {
  const t = (href, name, label) => `<a class="tab ${active === name ? 'on' : ''}" href="${href}">${icon(name)}${label}</a>`;
  return `<nav class="tabs" aria-label="Main">
    ${t('#/home', 'home', 'Home')}${t('#/stock', 'bottle', 'Stock')}
    <a class="tab scan" href="#/sell" aria-label="Scan a sale">${icon('scan', 26, '#fff', 2)}</a>
    ${t('#/money', 'money', 'Money')}${t('#/settings', 'gear', 'Settings')}
  </nav>`;
}
const backBtn = href => `<a class="iconbtn" href="${href}" aria-label="Back">${icon('back', 20, '#1C1917', 2)}</a>`;

const routes = {
  home: renderHome, stock: renderStock, scents: renderScents, scent: renderScentForm,
  batch: renderBatch, 'batch-new': renderBatchNew, sell: renderSell, money: renderMoney,
  expense: renderExpenseForm, settings: renderSettings
};
function route() {
  if (cleanup) { try { cleanup(); } catch (e) { } cleanup = null; }
  const [name, arg] = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  const fn = routes[name] || renderHome;
  if (!S.scents.length && !['scent', 'scents', 'settings'].includes(name)) return renderWelcome();
  fn(arg ? decodeURIComponent(arg) : undefined);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ---------------- screens ---------------- */
function renderWelcome() {
  app.innerHTML = `<main class="page full" style="padding-top:40px">
    <h1>Welcome</h1>
    <p class="muted">Start by adding your scents. You only do this once: a name, an optional "inspired by" note and a price for each bottle size.</p>
    <a class="btn" href="#/scent/new">${icon('plus', 20, '#fff', 2)}Add your first scent</a>
    <p class="small muted">Moving from another phone? Restore a backup in <a href="#/settings">Settings</a>.</p>
  </main>`;
}

function renderHome() {
  const day = todayISO();
  const today = S.sales.filter(s => sameDay(s.at, day));
  const total = today.reduce((a, s) => a + s.total, 0);
  const cash = today.filter(s => s.method === 'cash').reduce((a, s) => a + s.total, 0);
  const bottles = today.reduce((a, s) => a + s.lines.length, 0);
  const m = monthTotals(day.slice(0, 7));
  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' });
  const low = lowStockList().slice(0, 4);
  const lastBackup = meta('lastBackup', null);
  const backupDue = (S.sales.length + S.expenses.length + S.batches.length) > 0 &&
    (!lastBackup || (Date.now() - new Date(lastBackup).getTime()) > 7 * 864e5);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  app.innerHTML = `<main class="page">
    <div><p class="small muted">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>${greet}</h1></div>
    ${backupDue ? `<a class="card pad between" href="#/settings" style="background:var(--amber-bg);border-color:#F1D9B0;color:var(--amber)"><span><b>Time for a backup.</b> Save a copy to iCloud Drive.</span><span>›</span></a>` : ''}
    <section class="hero">
      <div class="between"><span class="small" style="opacity:.85">Sold today</span><span class="small" style="opacity:.85">${bottles} bottle${bottles === 1 ? '' : 's'}</span></div>
      <div class="big">${money(total)}</div>
      <div class="row"><div class="sub"><p class="tiny" style="opacity:.85">Cash</p><p><b>${money(cash)}</b></p></div><div class="sub"><p class="tiny" style="opacity:.85">STC Pay</p><p><b>${money(total - cash)}</b></p></div></div>
    </section>
    <div class="grid3">
      <a class="card quick" href="#/sell">${icon('scan', 24, '#6D2E5B')}Scan a sale</a>
      <a class="card quick" href="#/expense/new">${icon('receipt', 24, '#6D2E5B')}Add expense</a>
      <a class="card quick" href="#/batch-new">${icon('bottle', 24, '#6D2E5B')}New batch</a>
    </div>
    <section class="card pad between">
      <div><p class="tiny muted">${monthName} revenue</p><p><b>${money(m.revenue)}</b></p></div>
      <div><p class="tiny muted">Expenses</p><p><b>${money(m.expenses)}</b></p></div>
      <div><p class="tiny muted">Profit</p><p><b style="color:${m.profit >= 0 ? 'var(--green)' : 'var(--red)'}">${money(m.profit)}</b></p></div>
    </section>
    <section style="display:flex;flex-direction:column;gap:8px">
      <div class="between"><h2>Running low</h2><a class="small" href="#/stock">All stock</a></div>
      ${low.length ? `<div class="card list">${low.map(x => `<a class="between" href="#/stock" style="color:inherit"><div><p style="font-weight:500">${esc(x.scent.name)} · ${x.size} ml</p></div><span class="pill ${x.left <= 0 ? 'out' : 'low'}">${x.left <= 0 ? 'Sold out' : x.left + ' left'}</span></a>`).join('')}</div>`
      : `<div class="card empty small">Nothing running low.</div>`}
    </section>
  </main>${tabs('home')}`;
}

function renderStock() {
  const filter = sessionStorage.getItem('stockFilter') || 'all';
  const q = (sessionStorage.getItem('stockQ') || '').toLowerCase();
  let list = sortedScents().map(s => ({ s, st: stockFor(s.id) }));
  if (q) list = list.filter(x => x.s.name.toLowerCase().includes(q) || (x.s.inspiredBy || '').toLowerCase().includes(q));
  if (filter === 'low') list = list.filter(x => SIZES.some(z => S.batches.some(b => madeCount(b, x.s.id, z) > 0) && x.st.bySize[z] <= lowLevel(x.s)));
  const totalBottles = S.scents.reduce((a, s) => a + stockFor(s.id).total, 0);

  app.innerHTML = `<main class="page">
    <div class="between"><div><h1>Stock</h1><p class="small muted">${totalBottles} bottles across ${S.scents.length} scents</p></div><a class="btn small" href="#/batch-new">+ New batch</a></div>
    <input class="in" id="q" type="search" placeholder="Search scents" value="${esc(sessionStorage.getItem('stockQ') || '')}" aria-label="Search scents">
    <div class="chips">
      <button class="chip ${filter === 'all' ? 'on' : ''}" data-f="all">All</button>
      <button class="chip ${filter === 'low' ? 'on' : ''}" data-f="low">Running low</button>
      <a class="chip" href="#/scents" style="display:inline-flex;align-items:center;color:var(--ink)">Edit scents</a>
    </div>
    ${list.length ? list.map(({ s, st }) => `
      <section class="card pad" style="display:flex;flex-direction:column;gap:10px">
        <div class="between"><div><p style="font-weight:600;font-size:16px">${esc(s.name)}</p>${s.inspiredBy ? `<p class="tiny muted">Inspired by ${esc(s.inspiredBy)}</p>` : ''}</div><p class="small muted">${st.total} bottles</p></div>
        <div class="grid4">${SIZES.map(z => { const v = st.bySize[z]; const made = S.batches.some(b => madeCount(b, s.id, z) > 0); if (!made) return `<div class="sz"><b class="muted">–</b><span>${z} ml</span></div>`; const cls = v <= 0 ? 'out' : v <= lowLevel(s) ? 'low' : ''; return `<div class="sz ${cls}"><b>${v}</b><span>${z} ml</span></div>`; }).join('')}</div>
        ${st.batches.length ? `<div style="border-top:1px solid var(--line2);padding-top:8px;display:flex;flex-direction:column;gap:5px">${st.batches.slice(0, 4).map(x => `<a class="between small" href="#/batch/${encodeURIComponent(x.batch.code)}" style="color:inherit"><span class="muted">${esc(x.batch.code)} · ${fmtDate(x.batch.date)}</span><span>${x.left} left${costPerMl(x.batch) ? ' · ' + money(costPerMl(x.batch)) + '/ml' : ''}</span></a>`).join('')}</div>` : ''}
      </section>`).join('') : `<div class="card empty">No scents match.</div>`}
    ${S.batches.length ? `<h2 style="margin-top:6px">Batches</h2><div class="card list">${S.batches.slice().sort((a, b) => b.date.localeCompare(a.date)).map(b => `<a class="between" href="#/batch/${encodeURIComponent(b.code)}" style="color:inherit"><div><p style="font-weight:500">${esc(b.code)}</p><p class="tiny muted">${fmtDate(b.date)} · ${b.items.reduce((a, i) => a + i.qty, 0)} bottles</p></div><span class="muted">›</span></a>`).join('')}</div>` : ''}
  </main>${tabs('bottle')}`;

  $('#q').addEventListener('input', e => {
    sessionStorage.setItem('stockQ', e.target.value);
    const pos = e.target.selectionStart; renderStock(); const i = $('#q'); i.focus(); i.setSelectionRange(pos, pos);
  });
  $$('[data-f]').forEach(b => b.onclick = () => { sessionStorage.setItem('stockFilter', b.dataset.f); renderStock(); });
}

function renderScents() {
  app.innerHTML = `<main class="page">
    <div class="row">${backBtn('#/stock')}<h1 style="flex:1">Scents</h1><a class="btn small" href="#/scent/new">+ Add</a></div>
    ${S.scents.length ? `<div class="card list">${sortedScents().map(s => `<a class="between" href="#/scent/${s.id}" style="color:inherit"><div><p style="font-weight:500">${esc(s.name)} <span class="tiny muted">${esc(s.code)}</span></p><p class="tiny muted">${SIZES.map(z => s.prices[z] ? z + ' ml ' + s.prices[z] : '').filter(Boolean).join(' · ') || 'No prices yet'}</p></div><span class="muted">›</span></a>`).join('')}</div>` : `<div class="card empty">No scents yet.</div>`}
  </main>${tabs('bottle')}`;
}

function renderScentForm(id) {
  const isNew = !id || id === 'new';
  const s = isNew ? { id: uid(), code: nextScentCode(), name: '', inspiredBy: '', prices: {}, lowAt: 3 } : scentById(id);
  if (!s) { location.hash = '#/scents'; return; }
  const used = !isNew && (S.batches.some(b => b.items.some(i => i.scentId === s.id)));
  app.innerHTML = `<main class="page full">
    <div class="row">${backBtn(S.scents.length ? '#/scents' : '#/home')}<h1>${isNew ? 'New scent' : 'Edit scent'}</h1></div>
    <form id="f" style="display:flex;flex-direction:column;gap:14px">
      <label class="f">Your name for it<input class="in" name="name" required value="${esc(s.name)}" placeholder="e.g. Oud Noir"></label>
      <label class="f">Inspired by (only you see this)<input class="in" name="inspiredBy" value="${esc(s.inspiredBy)}"></label>
      <div class="f" style="display:flex;flex-direction:column;gap:6px"><span class="tiny muted" style="font-weight:500">Price per size (${CURRENCY})</span>
        <div class="grid4">${SIZES.map(z => `<label class="f" style="align-items:center">${z} ml<input class="qty" inputmode="decimal" name="p${z}" value="${s.prices[z] ?? ''}"></label>`).join('')}</div>
      </div>
      <label class="f">Warn me when a size is down to<input class="in" name="lowAt" inputmode="numeric" value="${s.lowAt ?? 3}"></label>
      <p class="tiny muted">Label code: ${esc(s.code)}</p>
      <button class="btn" type="submit">Save scent</button>
      ${isNew ? '' : `<button class="btn danger" type="button" id="del" ${used ? 'disabled' : ''}>Delete scent</button>${used ? '<p class="tiny muted" style="text-align:center">This scent is in a batch, so it can\'t be deleted.</p>' : ''}`}
    </form>
  </main>`;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = fd.get('name').trim();
    if (!name) return toast('Give the scent a name', true);
    if (S.scents.some(x => x.id !== s.id && x.name.toLowerCase() === name.toLowerCase())) return toast('You already have a scent with that name', true);
    s.name = name; s.inspiredBy = fd.get('inspiredBy').trim(); s.lowAt = parseInt(fd.get('lowAt'), 10) || 0;
    s.prices = {}; SIZES.forEach(z => { const v = num(fd.get('p' + z)); if (v > 0) s.prices[z] = v; });
    await save('scents', s);
    toast('Saved ' + name);
    location.hash = '#/scents';
  };
  const del = $('#del');
  if (del && !used) del.onclick = async () => {
    if (!confirm('Delete ' + s.name + '?')) return;
    await remove('scents', s.id); toast('Deleted'); location.hash = '#/scents';
  };
}

function renderBatchNew() {
  const code = nextBatchCode();
  const draft = JSON.parse(sessionStorage.getItem('batchDraft') || '{}');
  app.innerHTML = `<main class="page full">
    <div class="row">${backBtn('#/stock')}<div><h1>New batch ${esc(code)}</h1><p class="small muted">Enter how many bottles you filled</p></div></div>
    <label class="f">Date made<input class="in" type="date" id="bdate" value="${draft.date || todayISO()}"></label>
    <input class="in" id="bq" type="search" placeholder="Find a scent" aria-label="Find a scent">
    <section class="card pad" style="display:flex;flex-direction:column;gap:8px">
      <div style="display:grid;grid-template-columns:minmax(0,1.4fr) repeat(4,minmax(0,1fr));gap:6px;align-items:center" class="tiny muted"><span>Scent</span>${SIZES.map(z => `<span style="text-align:center">${z} ml</span>`).join('')}</div>
      ${sortedScents().map(s => `<div class="brow" data-name="${esc(s.name.toLowerCase())}" style="display:grid;grid-template-columns:minmax(0,1.4fr) repeat(4,minmax(0,1fr));gap:6px;align-items:center">
        <span style="font-weight:500;font-size:14px;overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</span>
        ${SIZES.map(z => `<input class="qty" inputmode="numeric" aria-label="${esc(s.name)} ${z} ml" data-s="${s.id}" data-z="${z}" value="${(draft.q || {})[s.id + '_' + z] || ''}">`).join('')}
      </div>`).join('')}
      <a class="small" href="#/scent/new">+ Add a new scent</a>
    </section>
    <label class="f">Notes (optional)<textarea class="in" id="bnotes">${esc(draft.notes || '')}</textarea></label>
    <p class="small muted" id="btotal"></p>
    <button class="btn" id="bsave">Save batch</button>
  </main>`;
  const persist = () => {
    const q = {}; $$('.qty[data-s]').forEach(i => { if (i.value) q[i.dataset.s + '_' + i.dataset.z] = i.value; });
    sessionStorage.setItem('batchDraft', JSON.stringify({ date: $('#bdate').value, notes: $('#bnotes').value, q }));
    const t = $$('.qty[data-s]').reduce((a, i) => a + (parseInt(i.value, 10) || 0), 0);
    $('#btotal').textContent = t ? `${t} bottles in this batch` : '';
  };
  app.addEventListener('input', persist); persist();
  cleanup = () => app.removeEventListener('input', persist);
  $('#bq').oninput = e => { const v = e.target.value.toLowerCase(); $$('.brow').forEach(r => r.style.display = r.dataset.name.includes(v) ? '' : 'none'); };
  $('#bsave').onclick = async () => {
    const items = $$('.qty[data-s]').map(i => ({ scentId: i.dataset.s, size: +i.dataset.z, qty: parseInt(i.value, 10) || 0 })).filter(i => i.qty > 0);
    if (!items.length) return toast('Enter at least one bottle', true);
    const b = { id: uid(), code, date: $('#bdate').value || todayISO(), notes: $('#bnotes').value.trim(), items, createdAt: localISO() };
    await save('batches', b);
    sessionStorage.removeItem('batchDraft');
    toast('Batch ' + code + ' saved');
    location.hash = '#/batch/' + encodeURIComponent(code);
  };
}

function renderBatch(code) {
  const b = batchByCode(code);
  if (!b) { location.hash = '#/stock'; return; }
  const total = b.items.reduce((a, i) => a + i.qty, 0);
  const exp = S.expenses.filter(e => e.batchCode === b.code);
  const cpm = costPerMl(b);
  const byScent = {};
  b.items.forEach(i => { (byScent[i.scentId] = byScent[i.scentId] || {})[i.size] = i.qty; });
  const anySold = S.sales.some(s => s.lines.some(l => l.batchCode === b.code));
  app.innerHTML = `<main class="page full">
    <div class="row">${backBtn('#/stock')}<div><h1>Batch ${esc(b.code)}</h1><p class="small muted">${fmtDate(b.date)} · ${total} bottles</p></div></div>
    <section class="card pad" style="display:flex;flex-direction:column;gap:8px">
      <div style="display:grid;grid-template-columns:minmax(0,1.4fr) repeat(4,minmax(0,1fr));gap:6px" class="tiny muted"><span>Left / made</span>${SIZES.map(z => `<span style="text-align:center">${z} ml</span>`).join('')}</div>
      ${Object.keys(byScent).map(sid => `<div style="display:grid;grid-template-columns:minmax(0,1.4fr) repeat(4,minmax(0,1fr));gap:6px;align-items:center"><span style="font-weight:500;font-size:14px">${esc(scentName(sid))}</span>${SIZES.map(z => byScent[sid][z] ? `<span style="text-align:center;font-size:14px">${leftIn(b, sid, z)}<span class="muted">/${byScent[sid][z]}</span></span>` : '<span style="text-align:center" class="muted">–</span>').join('')}</div>`).join('')}
    </section>
    <section class="card pad" style="display:flex;flex-direction:column;gap:8px">
      <div class="between"><span class="muted small">Expenses linked (${exp.length})</span><b>${money(batchExpenses(b))}</b></div>
      <div class="between"><span class="muted small">Total liquid</span><b>${batchMl(b).toLocaleString('en-GB')} ml</b></div>
      <div class="between" style="border-top:1px solid var(--line2);padding-top:8px"><span class="small">Cost per ml</span><b style="color:var(--plum)">${cpm ? money(cpm) : '–'}</b></div>
      ${cpm ? `<p class="tiny muted">So a 10 ml bottle costs about ${money(cpm * 10)}, 50 ml about ${money(cpm * 50)}.</p>` : `<p class="tiny muted">Link receipts to ${esc(b.code)} when you add expenses and the cost per bottle appears here.</p>`}
    </section>
    <button class="btn" id="exp">${icon('download', 20, '#fff', 2)}Export labels for NIIMBOT</button>
    <p class="tiny muted" style="text-align:center;margin-top:-6px">An Excel file with one row per bottle. Import it in the NIIMBOT app and link the QR code to the "QR" column.</p>
    ${b.notes ? `<section class="card pad"><p class="tiny muted">Notes</p><p>${esc(b.notes)}</p></section>` : ''}
    <button class="btn danger" id="bdel" ${anySold ? 'disabled' : ''}>Delete batch</button>
    ${anySold ? `<p class="tiny muted" style="text-align:center;margin-top:-6px">Bottles from this batch have been sold, so it can't be deleted.</p>` : ''}
  </main>`;
  $('#exp').onclick = () => exportLabels(b);
  if (!anySold) $('#bdel').onclick = async () => { if (!confirm('Delete batch ' + b.code + '?')) return; await remove('batches', b.id); toast('Batch deleted'); location.hash = '#/stock'; };
}

async function exportLabels(b) {
  const rows = [];
  const mm = b.date.slice(5, 7) + '/' + b.date.slice(2, 4);
  for (const it of b.items) {
    const s = scentById(it.scentId); if (!s) continue;
    for (let n = 0; n < it.qty; n++) rows.push({ QR: labelCode(b.code, s, it.size), Scent: s.name, Size: it.size + ' ml', Batch: b.code, Date: mm });
  }
  const name = `labels-${b.code}.xlsx`;
  let file;
  try {
    await loadScript('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows, { header: ['QR', 'Scent', 'Size', 'Batch', 'Date'] });
    ws['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 7 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Labels');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    file = new File([out], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  } catch (e) {
    const csv = 'QR,Scent,Size,Batch,Date\n' + rows.map(r => [r.QR, r.Scent, r.Size, r.Batch, r.Date].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    file = new File([csv], name.replace('.xlsx', '.csv'), { type: 'text/csv' });
    toast('No internet for Excel, so this is a CSV file instead', true);
  }
  shareOrDownload(file);
}
async function shareOrDownload(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* ---------- selling ---------- */
let cart = [];       // [{scentId, size, batchCode, price}]
let discount = { type: null, value: 0 };
function cartTotals() {
  const sub = cart.reduce((a, l) => a + l.price, 0);
  let off = 0;
  if (discount.type === 'amount') off = discount.value;
  if (discount.type === 'percent') off = sub * discount.value / 100;
  if (discount.type === 'total') off = sub - discount.value;
  off = Math.max(0, Math.min(sub, Math.round(off * 100) / 100));
  return { sub, off, total: sub - off };
}
function addToCart(scent, size, batch) {
  if (leftIn(batch, scent.id, size, cart) <= 0) { toast(`No ${scent.name} ${size} ml left in ${batch.code}`, true); return false; }
  cart.push({ scentId: scent.id, size, batchCode: batch.code, price: scent.prices[size] || 0 });
  if (navigator.vibrate) navigator.vibrate(60);
  return true;
}

function renderSell() {
  app.innerHTML = `<main class="page full">
    <div class="between">${backBtn('#/home')}<h1 style="flex:1">Sell</h1><button class="btn plain small" id="manual">Add by hand</button></div>
    <div class="cam" id="cam"><video id="vid" playsinline muted></video><div class="frame"></div><div class="msg" id="cammsg">Starting camera…</div></div>
    <div id="cart"></div>
  </main>`;
  drawCart();
  $('#manual').onclick = openManualAdd;
  startScanner();
}
function drawCart() {
  const box = $('#cart'); if (!box) return;
  const t = cartTotals();
  box.innerHTML = cart.length ? `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="between"><h2>This sale</h2><span class="small muted">${cart.length} bottle${cart.length === 1 ? '' : 's'}</span></div>
      <div class="card list">${cart.map((l, i) => { const b = batchByCode(l.batchCode); return `<div class="between"><div><p style="font-weight:500">${esc(scentName(l.scentId))} · ${l.size} ml</p><p class="tiny muted">${esc(l.batchCode)} · ${leftIn(b, l.scentId, l.size, cart)} left after this</p></div><div class="row"><b>${money(l.price)}</b><button class="iconbtn" style="width:36px;height:36px" data-rm="${i}" aria-label="Remove">${icon('x', 16, '#6B635A', 2)}</button></div></div>`; }).join('')}</div>
      <div class="grid3">
        <button class="btn plain" data-d="amount">− ${CURRENCY} 10</button>
        <button class="btn plain" data-d="percent">− 10%</button>
        <button class="btn plain" data-d="total">Set total</button>
      </div>
      ${t.off ? `<div class="between small"><span class="muted">Discount</span><span>− ${money(t.off)} <button class="btn plain small" style="min-height:30px;display:inline-flex" id="nodisc">Undo</button></span></div>` : ''}
      <div class="between"><span class="muted">Total</span><span style="font-size:30px;font-weight:650">${money(t.total)}</span></div>
      <div class="row"><button class="btn" data-pay="cash">Paid cash</button><button class="btn ghost" data-pay="stc">Paid STC Pay</button></div>
    </div>` : `<div class="card empty small">Scan a bottle's label to start a sale.</div>`;
  $$('[data-rm]', box).forEach(b => b.onclick = () => { cart.splice(+b.dataset.rm, 1); if (!cart.length) discount = { type: null, value: 0 }; drawCart(); });
  $$('[data-d]', box).forEach(b => b.onclick = () => {
    const k = b.dataset.d;
    if (k === 'amount') discount = { type: 'amount', value: (discount.type === 'amount' ? discount.value : 0) + 10 };
    if (k === 'percent') discount = { type: 'percent', value: 10 };
    if (k === 'total') { const v = prompt('Total the customer pays (' + CURRENCY + ')', cartTotals().total); if (v === null) return; discount = { type: 'total', value: num(v) }; }
    drawCart();
  });
  const nd = $('#nodisc', box); if (nd) nd.onclick = () => { discount = { type: null, value: 0 }; drawCart(); };
  $$('[data-pay]', box).forEach(b => b.onclick = () => completeSale(b.dataset.pay));
}
async function completeSale(method) {
  if (!cart.length) return;
  const t = cartTotals();
  const sale = { id: uid(), at: localISO(), lines: cart.map(l => ({ ...l })), subtotal: t.sub, discount: t.off, total: t.total, method };
  await save('sales', sale);
  cart = []; discount = { type: null, value: 0 };
  toast(`Sale saved: ${money(t.total)} ${method === 'cash' ? 'cash' : 'STC Pay'}`);
  drawCart();
}
function openManualAdd() {
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-label="Add a bottle by hand">
    <div class="between"><h2>Add a bottle by hand</h2><button class="iconbtn" id="mx" aria-label="Close">${icon('x', 18, '#1C1917', 2)}</button></div>
    <input class="in" id="mq" type="search" placeholder="Find a scent">
    <div class="card list" id="ml">${sortedScents().map(s => { const st = stockFor(s.id); return `<div data-n="${esc(s.name.toLowerCase())}" style="display:flex;flex-direction:column;gap:8px"><p style="font-weight:500">${esc(s.name)}</p><div class="grid4">${SIZES.map(z => `<button class="btn plain small" style="width:100%;flex-direction:column;gap:0;min-height:46px" data-s="${s.id}" data-z="${z}" ${st.bySize[z] - cart.filter(l => l.scentId === s.id && l.size === z).length <= 0 ? 'disabled' : ''}><span>${z} ml</span><span class="tiny muted">${st.bySize[z] - cart.filter(l => l.scentId === s.id && l.size === z).length} left</span></button>`).join('')}</div></div>`; }).join('')}</div>
  </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.onclick = e => { if (e.target === bg) close(); };
  $('#mx', bg).onclick = close;
  $('#mq', bg).oninput = e => { const v = e.target.value.toLowerCase(); $$('#ml > div', bg).forEach(r => r.style.display = r.dataset.n.includes(v) ? '' : 'none'); };
  $$('[data-s]', bg).forEach(b => b.onclick = () => {
    const s = scentById(b.dataset.s), z = +b.dataset.z, batch = oldestBatchWithStock(s.id, z, cart);
    if (!batch) return toast('None left', true);
    if (addToCart(s, z, batch)) { close(); drawCart(); }
  });
}
async function startScanner() {
  const msg = $('#cammsg'), video = $('#vid');
  let stream, stopped = false, timer;
  cleanup = () => { stopped = true; clearTimeout(timer); if (stream) stream.getTracks().forEach(t => t.stop()); };
  try {
    await loadScript('jsqr');
  } catch (e) { msg.textContent = 'Scanner needs internet the first time. Use "Add by hand".'; return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
  } catch (e) { msg.textContent = 'Camera blocked. Allow camera access, or use "Add by hand".'; return; }
  if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
  video.srcObject = stream; await video.play().catch(() => { });
  msg.textContent = 'Point at the bottle\'s label';
  const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let last = '', lastAt = 0;
  const tick = () => {
    if (stopped) return;
    if (video.readyState >= 2) {
      const w = video.videoWidth, h = video.videoHeight, side = Math.min(w, h) * 0.75;
      canvas.width = canvas.height = 480;
      ctx.drawImage(video, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 480, 480);
      const img = ctx.getImageData(0, 0, 480, 480);
      const res = window.jsQR(img.data, 480, 480, { inversionAttempts: 'dontInvert' });
      if (res && res.data) {
        const now = Date.now();
        if (res.data !== last || now - lastAt > 2500) {   // same label twice needs a short pause
          last = res.data; lastAt = now;
          const p = parseLabel(res.data);
          if (!p) toast('That label isn\'t one of yours', true);
          else if (addToCart(p.scent, p.size, p.batch)) { drawCart(); msg.textContent = `Added ${p.scent.name} ${p.size} ml`; }
        }
      }
    }
    timer = setTimeout(tick, 180);
  };
  tick();
}

/* ---------- money ---------- */
function renderMoney() {
  const view = sessionStorage.getItem('moneyView') || 'sales';
  const key = sessionStorage.getItem('moneyMonth') || todayISO().slice(0, 7);
  const months = Array.from(new Set([todayISO().slice(0, 7), ...S.sales.map(s => monthKey(s.at)), ...S.expenses.map(e => monthKey(e.date))])).sort().reverse();
  const m = monthTotals(key);
  const sales = S.sales.filter(s => monthKey(s.at) === key).sort((a, b) => b.at.localeCompare(a.at));
  const exps = S.expenses.filter(e => monthKey(e.date) === key).sort((a, b) => b.date.localeCompare(a.date));
  const cogs = sales.reduce((a, s) => a + s.lines.reduce((x, l) => x + lineCost(l), 0), 0);
  // best sellers
  const counts = {};
  sales.forEach(s => s.lines.forEach(l => counts[l.scentId] = (counts[l.scentId] || 0) + 1));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const label = k => new Date(k + '-15').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  app.innerHTML = `<main class="page">
    <div class="between"><h1>Money</h1><a class="btn small" href="#/expense/new">+ Expense</a></div>
    <select class="in" id="mon" aria-label="Month">${months.map(k => `<option value="${k}" ${k === key ? 'selected' : ''}>${label(k)}</option>`).join('')}</select>
    <section class="card pad" style="display:flex;flex-direction:column;gap:8px">
      <div class="between"><span class="muted small">Revenue (${m.bottles} bottles)</span><b>${money(m.revenue)}</b></div>
      <div class="between"><span class="muted small">Expenses</span><b>− ${money(m.expenses)}</b></div>
      <div class="between" style="border-top:1px solid var(--line2);padding-top:8px"><span>Profit</span><b style="font-size:20px;color:${m.profit >= 0 ? 'var(--green)' : 'var(--red)'}">${money(m.profit)}</b></div>
      ${cogs ? `<p class="tiny muted">The bottles sold this month cost about ${money(cogs)} to make.</p>` : ''}
    </section>
    ${top.length ? `<section class="card pad" style="display:flex;flex-direction:column;gap:6px"><p class="tiny muted">Best sellers</p>${top.map(([id, n], i) => `<div class="between small"><span>${i + 1}. ${esc(scentName(id))}</span><span class="muted">${n} sold</span></div>`).join('')}</section>` : ''}
    <div class="seg" role="tablist"><button role="tab" class="${view === 'sales' ? 'on' : ''}" data-v="sales">Sales (${sales.length})</button><button role="tab" class="${view === 'exp' ? 'on' : ''}" data-v="exp">Expenses (${exps.length})</button></div>
    ${view === 'sales'
      ? (sales.length ? `<div class="card list">${sales.map(s => `<div><div class="between"><span style="font-weight:500">${money(s.total)} · ${s.method === 'cash' ? 'Cash' : 'STC Pay'}</span><span class="tiny muted">${fmtDate(s.at.slice(0, 10))} ${fmtTime(s.at)}</span></div><p class="tiny muted">${s.lines.map(l => esc(scentName(l.scentId)) + ' ' + l.size + ' ml').join(', ')}${s.discount ? ' · discount ' + money(s.discount) : ''}</p><button class="tiny" data-undo="${s.id}" style="border:0;background:none;color:var(--red);padding:6px 0 0">Undo sale</button></div>`).join('')}</div>` : `<div class="card empty small">No sales this month yet.</div>`)
      : (exps.length ? `<div class="card list">${exps.map(e => `<a href="#/expense/${e.id}" class="row" style="color:inherit">${e.photo ? `<img class="thumb" style="width:44px;height:56px" src="${e.photo}" alt="">` : ''}<div style="flex:1"><div class="between"><span style="font-weight:500">${esc(e.shop || e.category)}</span><b>${money(e.amount)}</b></div><p class="tiny muted">${fmtDate(e.date)} · ${esc(e.category)}${e.batchCode ? ' · ' + esc(e.batchCode) : ''}</p></div></a>`).join('')}</div>` : `<div class="card empty small">No expenses this month yet.</div>`)}
  </main>${tabs('money')}`;
  $('#mon').onchange = e => { sessionStorage.setItem('moneyMonth', e.target.value); renderMoney(); };
  $$('[data-v]').forEach(b => b.onclick = () => { sessionStorage.setItem('moneyView', b.dataset.v); renderMoney(); });
  $$('[data-undo]').forEach(b => b.onclick = async () => { if (!confirm('Undo this sale? The bottles go back into stock.')) return; await remove('sales', b.dataset.undo); toast('Sale removed'); renderMoney(); });
}

function shrinkImage(file, max = 1400, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read photo')); };
    img.src = url;
  });
}

function renderExpenseForm(id) {
  const isNew = !id || id === 'new';
  const e = isNew ? { id: uid(), date: todayISO(), shop: '', amount: 0, category: 'Oils', batchCode: '', photo: '', note: '' } : S.expenses.find(x => x.id === id);
  if (!e) { location.hash = '#/money'; return; }
  let photo = e.photo, cat = e.category;
  const batches = S.batches.slice().sort((a, b) => b.date.localeCompare(a.date));
  app.innerHTML = `<main class="page full">
    <div class="row">${backBtn('#/money')}<h1>${isNew ? 'Add expense' : 'Expense'}</h1></div>
    <label class="card pad row" style="cursor:pointer">
      <span id="ph">${photo ? `<img class="thumb" src="${photo}" alt="Receipt photo">` : `<span class="thumb" style="display:flex;align-items:center;justify-content:center;background:var(--bg)">${icon('receipt', 26, '#6B635A')}</span>`}</span>
      <span style="display:flex;flex-direction:column;gap:4px"><b>${photo ? 'Change photo' : 'Take a photo of the receipt'}</b><span class="tiny muted">Kept with the expense so you can check it later</span></span>
      <input type="file" accept="image/*" capture="environment" id="file" style="display:none">
    </label>
    <label class="f">Shop<input class="in" id="shop" value="${esc(e.shop)}"></label>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
      <label class="f">Date<input class="in" type="date" id="date" value="${e.date}"></label>
      <label class="f">Total (${CURRENCY})<input class="in" id="amt" inputmode="decimal" value="${e.amount || ''}"></label>
    </div>
    <div class="f" style="display:flex;flex-direction:column;gap:8px"><span class="tiny muted" style="font-weight:500">Category</span><div class="chips">${CATEGORIES.map(c => `<button type="button" class="chip ${c === cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div></div>
    <label class="f">Count towards batch (for cost per bottle)<select class="in" id="batch"><option value="">Not for a batch</option>${batches.map(b => `<option value="${esc(b.code)}" ${b.code === e.batchCode ? 'selected' : ''}>${esc(b.code)} · ${fmtDate(b.date)}</option>`).join('')}</select></label>
    <label class="f">Note (optional)<input class="in" id="note" value="${esc(e.note)}"></label>
    <button class="btn" id="save">Save expense</button>
    ${isNew ? '' : '<button class="btn danger" id="del">Delete expense</button>'}
  </main>`;
  $('#file').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    try { photo = await shrinkImage(f); $('#ph').innerHTML = `<img class="thumb" src="${photo}" alt="Receipt photo">`; }
    catch (err) { toast(err.message, true); }
  };
  $$('[data-c]').forEach(b => b.onclick = () => { cat = b.dataset.c; $$('[data-c]').forEach(x => x.classList.toggle('on', x === b)); });
  $('#save').onclick = async () => {
    const amount = num($('#amt').value);
    if (amount <= 0) return toast('Enter the total', true);
    Object.assign(e, { shop: $('#shop').value.trim(), date: $('#date').value || todayISO(), amount, category: cat, batchCode: $('#batch').value, photo, note: $('#note').value.trim() });
    await save('expenses', e); toast('Expense saved'); location.hash = '#/money';
  };
  const del = $('#del'); if (del) del.onclick = async () => { if (!confirm('Delete this expense?')) return; await remove('expenses', e.id); toast('Deleted'); location.hash = '#/money'; };
}

/* ---------- settings & backup ---------- */
async function renderSettings() {
  const last = meta('lastBackup', null);
  let persisted = null;
  try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) { }
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  app.innerHTML = `<main class="page">
    <h1>Settings</h1>
    <section class="card pad" style="display:flex;flex-direction:column;gap:10px">
      <h2>Backup</h2>
      <p class="small muted">Your records live only on this phone. Save a backup to iCloud Drive every week, so nothing is lost if the phone is replaced or the app is removed.</p>
      <p class="small">Last backup: <b>${last ? fmtDate(last.slice(0, 10)) : 'never'}</b></p>
      <button class="btn" id="bk">${icon('download', 20, '#fff', 2)}Save backup</button>
      <label class="btn plain" style="cursor:pointer">Restore from a backup<input type="file" id="rs" accept=".json,application/json" style="display:none"></label>
    </section>
    <section class="card pad" style="display:flex;flex-direction:column;gap:6px">
      <h2>This phone</h2>
      <p class="small">${standalone ? 'Running from the home screen ✓' : 'Tip: in Safari tap Share, then "Add to Home Screen", so the app opens full screen and keeps its data safely.'}</p>
      <p class="small muted">Storage protected from clean-up: ${persisted === null ? 'unknown' : persisted ? 'yes' : 'not yet'}</p>
      <p class="small muted">${S.scents.length} scents · ${S.batches.length} batches · ${S.sales.length} sales · ${S.expenses.length} expenses</p>
      <p class="tiny muted">Version ${APP_VERSION}</p>
    </section>
    <a class="card pad between" href="#/scents" style="color:inherit"><span>Edit scents and prices</span><span class="muted">›</span></a>
  </main>${tabs('gear')}`;
  $('#bk').onclick = async () => {
    const data = { app: 'perfume-app', version: APP_VERSION, savedAt: localISO() };
    STORES.filter(s => s !== 'meta').forEach(s => data[s] = S[s]);
    const file = new File([JSON.stringify(data)], `perfume-backup-${todayISO()}.json`, { type: 'application/json' });
    await shareOrDownload(file);
    await setMeta('lastBackup', localISO());
    renderSettings();
  };
  $('#rs').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== 'perfume-app') throw new Error('That isn\'t a backup from this app');
      const counts = `${(data.scents || []).length} scents, ${(data.batches || []).length} batches, ${(data.sales || []).length} sales, ${(data.expenses || []).length} expenses`;
      if (!confirm(`Replace everything on this phone with the backup from ${fmtDate(String(data.savedAt).slice(0, 10))}?\n\n${counts}`)) return;
      for (const s of ['scents', 'batches', 'sales', 'expenses']) { await idbClear(s); for (const o of (data[s] || [])) await idbPut(s, o); }
      await loadAll(); toast('Backup restored'); location.hash = '#/home';
    } catch (err) { toast(err.message || 'Could not read that file', true); }
  };
}

/* ---------------- start ---------------- */
(async function start() {
  try {
    await openDB(); await loadAll();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  } catch (e) {
    app.innerHTML = `<main class="page"><h1>Storage problem</h1><p>${esc(e.message || e)}</p><p class="small muted">If you're in a private browsing tab, open the app in a normal tab or from the home screen.</p></main>`;
    return;
  }
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
