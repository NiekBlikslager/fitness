'use strict';
/* Fitness-tracker. Alle data staat lokaal in localStorage. */

const KEY = 'fitness-v1';
const MUSCLES = ['Borst', 'Lats', 'Bovenrug', 'Onderrug', 'Schouders', 'Biceps', 'Triceps', 'Onderarmen',
  'Buik', 'Billen', 'Quadriceps', 'Hamstrings', 'Adductoren', 'Kuiten'];
const EXAMPLES = [
  ['Squat', 'weight', ['Quadriceps', 'Billen', 'Onderrug']],
  ['Bench press', 'weight', ['Borst', 'Triceps', 'Schouders']],
  ['Deadlift', 'weight', ['Hamstrings', 'Billen', 'Onderrug', 'Bovenrug']],
  ['Shoulder press', 'weight', ['Schouders', 'Triceps']],
  ['Barbell row', 'weight', ['Lats', 'Bovenrug', 'Biceps']],
  ['Pull-up', 'weight', ['Lats', 'Bovenrug', 'Biceps']],
  ['Plank', 'time', ['Buik']],
];

/* ---------- hulpfuncties ---------- */
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = n => (Math.round(n * 100) / 100).toLocaleString('nl-NL');
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) && n >= 0 ? n : 0; };
const pad = n => String(n).padStart(2, '0');
const dkey = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addDays = (d, n) => { d = new Date(d); d.setDate(d.getDate() + n); return d; };
const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const monday = d => { d = new Date(d); d.setHours(12, 0, 0, 0); return addDays(d, -((d.getDay() + 6) % 7)); };
const fdate = (d, o = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(d).toLocaleDateString('nl-NL', o);
const ftime = s => `${Math.floor(s / 60)}:${pad(Math.round(s % 60))}`;
const plural = (n, one, many) => `${nf(n)} ${n === 1 ? one : many}`;
const sum = a => a.reduce((x, y) => x + y, 0);
const icon = p => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const I = {
  train: icon('<path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12"/>'),
  list: icon('<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'),
  home: icon('<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>'),
  stats: icon('<path d="M5 20v-8M12 20V4M19 20v-5"/>'),
  ok: icon('<path d="M5 13l4 4L19 7"/>'),
  x: icon('<path d="M6 6l12 12M18 6L6 18"/>'),
  back: icon('<path d="M15 5l-7 7 7 7"/>'),
};

/* ---------- opslag ---------- */
const fresh = () => ({ exercises: [], workouts: [], active: null, habits: [{ id: 'pullups', name: 'Pull-ups', goal: 0 }], logs: [] });
function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return fresh();
  try { return { ...fresh(), ...JSON.parse(raw) }; }
  catch { localStorage.setItem(KEY + '-kapot', raw); return fresh(); }
}
let db = load();
let persistAsked = false;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch { alert('Opslaan is mislukt: de opslag van je telefoon is vol of geblokkeerd.'); }
  if (!persistAsked) { persistAsked = true; navigator.storage?.persist?.().catch(() => {}); }
}

/* ---------- logica ---------- */
const ex = id => db.exercises.find(e => e.id === id) || { id, name: 'Verwijderde oefening', type: 'weight', muscles: [] };
const isTime = id => ex(id).type === 'time';
const sorted = () => [...db.workouts].sort((a, b) => a.start - b.start);
const setVol = s => s.w * s.r;
const emptySet = () => ({ w: '', r: '', m: '', s: '', done: false });

/** Maakt van een invoerrij een schone set; null = telt niet mee. `ph` = waarden van vorige keer. */
function cleanSet(s, time, ph) {
  const useAll = s.done;
  if (time) {
    let t = num(s.m) * 60 + num(s.s);
    if (!t && useAll && ph) t = ph.t || 0;
    return t > 0 ? { t } : null;
  }
  const r = Math.round(s.r !== '' ? num(s.r) : useAll && ph ? ph.r || 0 : 0);
  const w = s.w !== '' ? num(s.w) : ph ? ph.w || 0 : 0;
  return r > 0 ? { w, r } : null;
}
function best(exId, until = Infinity, skipId = null) {
  const b = { n: 0, w: 0, vol: 0, sess: 0, reps: 0, t: 0, tsess: 0 };
  for (const wo of db.workouts) {
    if (wo.id === skipId || wo.start >= until) continue;
    const sets = wo.entries.filter(e => e.exId === exId).flatMap(e => e.sets);
    if (sets.length) b.n++;
    mergeBest(b, sets);
  }
  return b;
}
function mergeBest(b, sets) {
  for (const s of sets) {
    b.w = Math.max(b.w, s.w || 0); b.vol = Math.max(b.vol, setVol(s) || 0);
    b.reps = Math.max(b.reps, s.r || 0); b.t = Math.max(b.t, s.t || 0);
  }
  b.sess = Math.max(b.sess, sum(sets.map(s => setVol(s) || 0)));
  b.tsess = Math.max(b.tsess, sum(sets.map(s => s.t || 0)));
  return b;
}
function prLines(b, time) {
  if (time) return [['Langste tijd', ftime(b.t)], ['Meeste tijd in één workout', ftime(b.tsess)]];
  if (!b.w) return [['Meeste herhalingen in één set', nf(b.reps)]];
  return [['Hoogste gewicht', nf(b.w) + ' kg'], ['Hoogste totaal in één set', nf(b.vol) + ' kg'], ['Hoogste totaal in één workout', nf(b.sess) + ' kg']];
}
/** Nieuwe PR's van een workout t.o.v. alles ervoor. Eerste keer telt niet als PR. */
function newPRs(wo) {
  const out = [];
  for (const id of new Set(wo.entries.map(e => e.exId))) {
    const old = best(id, wo.start, wo.id);
    if (!old.n) continue;
    const now = mergeBest({ n: 1, w: 0, vol: 0, sess: 0, reps: 0, t: 0, tsess: 0 }, wo.entries.filter(e => e.exId === id).flatMap(e => e.sets));
    const add = (l, a, b) => out.push({ name: ex(id).name, label: l, old: a, now: b });
    if (isTime(id)) {
      if (now.t > old.t) add('Langste tijd', ftime(old.t), ftime(now.t));
      if (now.tsess > old.tsess) add('Meeste tijd in één workout', ftime(old.tsess), ftime(now.tsess));
    } else if (!now.w && !old.w) {
      if (now.reps > old.reps) add('Meeste herhalingen', nf(old.reps), nf(now.reps));
    } else {
      if (now.w > old.w) add('Hoogste gewicht', nf(old.w) + ' kg', nf(now.w) + ' kg');
      if (now.vol > old.vol) add('Hoogste totaal in één set', nf(old.vol) + ' kg', nf(now.vol) + ' kg');
      if (now.sess > old.sess) add('Hoogste totaal in één workout', nf(old.sess) + ' kg', nf(now.sess) + ' kg');
    }
  }
  return out;
}
/** Laatste sets van een oefening vóór de huidige workout. */
function lastSets(exId) {
  const a = db.active;
  const prev = sorted().reverse().find(w => w.id !== a?.editId && w.start < (a?.start ?? Infinity) && w.entries.some(e => e.exId === exId));
  return prev ? prev.entries.find(e => e.exId === exId).sets : [];
}
function muscleSets(list) {
  const m = {};
  for (const w of list) for (const e of w.entries) for (const g of ex(e.exId).muscles) m[g] = (m[g] || 0) + e.sets.length;
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}
const volume = w => sum(w.entries.flatMap(e => e.sets.map(s => setVol(s) || 0)));
const duration = w => w.end ? Math.round((w.end - w.start) / 60000) : 0;
const fset = s => s.t ? ftime(s.t) : s.w ? `${nf(s.w)} kg × ${s.r}` : `${s.r} herh.`;

const dayTotals = hid => { const m = {}; for (const l of db.logs) if (l.hid === hid) m[l.day] = (m[l.day] || 0) + l.n; return m; };
function dayStreak(tot) {
  let d = new Date(); d.setHours(12, 0, 0, 0);
  if (!tot[dkey(d)]) d = addDays(d, -1);
  let n = 0; while (tot[dkey(d)]) { n++; d = addDays(d, -1); }
  return n;
}
function weekStreak() {
  const weeks = new Set(db.workouts.map(w => dkey(monday(w.start))));
  let d = monday(Date.now());
  if (!weeks.has(dkey(d))) d = addDays(d, -7);
  let n = 0; while (weeks.has(dkey(d))) { n++; d = addDays(d, -7); }
  return n;
}

/* ---------- schermen ---------- */
let ui = { tab: 'train', view: null, id: null, day: null, habit: null, period: 30, metric: 'w', q: '' };
const TABS = [['train', 'Trainen', I.train], ['ex', 'Oefeningen', I.list], ['home', 'Thuis', I.home], ['stats', 'Statistieken', I.stats]];
let lastScreen = '';

function render() {
  const views = { editor: vEditor, done: vDone, exd: vExercise };
  const tabs = { train: vTrain, ex: vExercises, home: vHome, stats: vStats };
  if (ui.view === 'editor' && !db.active) ui.view = null;
  $('#app').innerHTML = (views[ui.view] || tabs[ui.tab])();
  $('#tabs').innerHTML = TABS.map(([k, l, i]) => `<button data-a="tab" data-v="${k}" ${k === ui.tab ? 'aria-current="page"' : ''}>${i}${l}</button>`).join('');
  const scr = `${ui.tab}/${ui.view}/${ui.id}`;
  if (scr !== lastScreen) { window.scrollTo(0, 0); lastScreen = scr; }
  hideTip();
}
const go = (view, id = null) => { ui.view = view; ui.id = id; render(); };
const backBtn = l => `<button class="link row" style="gap:2px;margin:-6px 0 4px -8px" data-a="back">${I.back}${l}</button>`;

function vTrain() {
  const a = db.active, list = sorted().reverse();
  let h = '<h1>Trainen</h1>';
  h += a ? `<button class="btn pri" data-a="resume">${a.editId ? 'Verder met bewerken' : 'Verder met je workout'}</button>` : '<button class="btn pri" data-a="start">Start workout</button>';
  h += '<h2>Je workouts</h2>';
  if (!list.length) return h + '<div class="card empty">Hier komen je afgeronde workouts. Start je eerste workout hierboven.</div>';
  return h + `<div class="list">${list.slice(0, ui.all ? undefined : 30).map(w => `<button class="item" data-a="open" data-v="${w.id}"><span><b>${esc(w.name)}</b><span class="mut">${esc([...new Set(w.entries.map(e => ex(e.exId).name))].join(', '))}</span></span><span class="end mut">${fdate(w.start)}</span></button>`).join('')}</div>`
    + (list.length > 30 && !ui.all ? '<button class="btn" data-a="showall">Toon alle workouts</button>' : '');
}

function vEditor() {
  const a = db.active;
  let h = `<div class="top row"><button class="link" data-a="back">Sluiten</button><button class="link" data-a="finish">${a.editId ? 'Opslaan' : 'Afronden'}</button></div>
  <input class="namein" data-i="wname" value="${esc(a.name)}" aria-label="Naam van de workout" autocomplete="off">
  <input type="date" data-i="wdate" value="${dkey(a.start)}" max="${dkey(Date.now())}" aria-label="Datum" style="margin:8px 0 16px">`;
  a.entries.forEach((en, i) => {
    const e = ex(en.exId), time = e.type === 'time', b = best(en.exId, a.start, a.editId), prev = lastSets(en.exId);
    h += `<section class="card"><div class="row"><div><h3>${esc(e.name)}</h3><div class="mut">${b.n ? 'PR: ' + (time ? ftime(b.t) : b.w ? `${nf(b.w)} kg, totaal ${nf(b.vol)} kg` : `${nf(b.reps)} herhalingen`) : 'Nog geen PR'}</div></div>
      <button class="iconb" data-a="exmenu" data-v="${i}" aria-label="Opties voor ${esc(e.name)}">${icon('<path d="M5 12h.01M12 12h.01M19 12h.01"/>')}</button></div>
      <div class="sets"><div class="set head"><span>Set</span><span>${time ? 'min' : 'kg'}</span><span>${time ? 'sec' : 'herh.'}</span><span></span><span></span></div>`;
    en.sets.forEach((s, j) => {
      const p = prev[j] || prev[prev.length - 1];
      const inp = (k, ph, l, mode) => `<input data-i="set" data-e="${i}" data-s="${j}" data-k="${k}" inputmode="${mode}" value="${esc(s[k])}" placeholder="${ph}" aria-label="${l}, set ${j + 1}" autocomplete="off">`;
      const c = cleanSet(s, time, p);
      h += `<div class="set ${s.done ? 'done' : ''} ${isPR(c, b, time) ? 'pr' : ''}"><span class="n">${isPR(c, b, time) ? '<b>PR</b>' : j + 1}</span>`
        + (time ? inp('m', p ? Math.floor(p.t / 60) : '0', 'Minuten', 'numeric') + inp('s', p ? Math.round(p.t % 60) : '0', 'Seconden', 'numeric')
          : inp('w', p ? nf(p.w) : '0', 'Gewicht in kg', 'decimal') + inp('r', p ? p.r : '0', 'Herhalingen', 'numeric'))
        + `<button class="ok" data-a="tick" data-e="${i}" data-s="${j}" aria-label="Set ${j + 1} afvinken" aria-pressed="${s.done}">${I.ok}</button>
        <button class="del" data-a="delset" data-e="${i}" data-s="${j}" aria-label="Set ${j + 1} verwijderen">${I.x}</button></div>`;
    });
    h += `<button class="addset" data-a="addset" data-v="${i}">Set toevoegen</button></div></section>`;
  });
  if (!a.entries.length) h += '<div class="card empty">Voeg je eerste oefening toe. Grijze cijfers zijn je waarden van vorige keer; tik op het vinkje om ze over te nemen.</div>';
  h += '<button class="btn" data-a="pick">Oefening toevoegen</button>';
  h += `<button class="btn pri" data-a="finish">${a.editId ? 'Wijzigingen opslaan' : 'Workout afronden'}</button><button class="btn bad" data-a="discard">${a.editId ? 'Wijzigingen weggooien' : 'Workout weggooien'}</button>`;
  return h;
}
const isPR = (c, b, time) => !!(c && b.n && (time ? c.t > b.t : b.w || c.w ? c.w > b.w || setVol(c) > b.vol : c.r > b.reps));

function hbars(rows, unit) {
  if (!rows.length) return '<p class="mut">Nog geen gegevens.</p>';
  const mx = Math.max(...rows.map(r => r[1]), 1);
  return rows.map(([l, n]) => `<button class="hb" data-tip="${esc(l)}: ${nf(n)} ${n === 1 ? unit[0] : unit[1]}"><span>${esc(l)}</span><span><i class="${n ? '' : 'zero'}" style="width:${n / mx * 100}%"></i></span><span class="num">${nf(n)}</span></button>`).join('');
}

function vDone() {
  const w = db.workouts.find(x => x.id === ui.id);
  if (!w) { ui.view = null; return vTrain(); }
  const prs = newPRs(w), mus = muscleSets([w]), v = volume(w), d = duration(w);
  const justDone = ui.just === w.id;
  let h = backBtn('Terug') + `<h1 style="margin-bottom:4px">${justDone ? 'Lekker getraind!' : esc(w.name)}</h1><p class="mut" style="margin-bottom:18px">${justDone ? esc(w.name) + ', ' : ''}${fdate(w.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>`;
  if (prs.length) h += `<h2 style="margin-top:0">${plural(prs.length, 'nieuw PR', "nieuwe PR's")}</h2><div class="list">${prs.map(p => `<div class="item"><span><b>${esc(p.name)}</b><span class="mut">${p.label}</span></span><span class="end"><b>${p.now}</b><span class="mut">was ${p.old}</span></span></div>`).join('')}</div>`;
  h += '<h2>Getrainde spiergroepen</h2><div class="card">' + (mus.length ? hbars(mus, ['set', 'sets']) + '<p class="mut" style="margin:8px 0 0">Aantal sets per spiergroep</p>' : '<p class="mut">Bij deze oefeningen zijn geen spiergroepen aangevinkt.</p>') + '</div>';
  h += `<div class="tiles"><div class="tile"><b>${sum(w.entries.map(e => e.sets.length))}</b><span>sets</span></div>`
    + (v ? `<div class="tile"><b>${nf(v)} <small>kg</small></b><span>totaal verplaatst</span></div>` : '')
    + (d > 0 ? `<div class="tile"><b>${d} <small>min</small></b><span>duur</span></div>` : '') + '</div>';
  h += '<h2>Oefeningen</h2><div class="list">' + w.entries.map(e => `<div class="item"><span><b>${esc(ex(e.exId).name)}</b>${e.sets.map(s => `<span class="mut num" style="display:block">${fset(s)}</span>`).join('')}</span></div>`).join('') + '</div>';
  h += '<button class="btn pri" data-a="repeat">Herhaal deze workout</button><button class="btn" data-a="editw">Bewerken</button><button class="btn bad" data-a="delw">Verwijderen</button>';
  return h;
}

function exRows(q, act) {
  return db.exercises.filter(e => !e.archived && e.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, 'nl'))
    .map(e => { const b = act === 'exopen' ? best(e.id) : null;
      return `<button class="item" data-a="${act}" data-v="${e.id}"><span><b>${esc(e.name)}</b><span class="mut">${esc(e.muscles.join(', ')) || 'Geen spiergroepen'}</span></span>${b && b.n ? `<span class="end">${e.type === 'time' ? ftime(b.t) : b.w ? nf(b.w) + ' kg' : nf(b.reps) + ' herh.'}</span>` : ''}</button>`; }).join('');
}
function vExercises() {
  let h = '<h1>Oefeningen</h1><button class="btn pri" data-a="exnew" style="margin-bottom:16px">Nieuwe oefening</button>';
  if (!db.exercises.some(e => !e.archived)) return h + '<div class="card empty"><p>Maak zelf oefeningen aan, of begin met een paar bekende zoals squat, bench press en plank.</p><button class="btn" data-a="examples">Voeg voorbeelden toe</button></div>';
  return h + `<input data-i="q" placeholder="Zoek oefening" aria-label="Zoek oefening" value="${esc(ui.q)}" style="background:var(--card);margin-bottom:12px"><div class="list" id="exlist">${exRows(ui.q, 'exopen') || '<div class="empty">Niets gevonden.</div>'}</div>`;
}

function vExercise() {
  const e = ex(ui.id), time = e.type === 'time', b = best(e.id);
  let h = backBtn('Oefeningen') + `<h1 style="margin-bottom:8px">${esc(e.name)}</h1><div style="margin-bottom:16px">${e.muscles.map(m => `<span class="tag">${m}</span>`).join('')}</div>`;
  if (b.n) {
    h += `<h2>PR's</h2><div class="list">${prLines(b, time).map(([l, v]) => `<div class="item"><span>${l}</span><span class="end"><b>${v}</b></span></div>`).join('')}</div>`;
    const metric = time ? 't' : !b.w ? 'reps' : ui.metric;
    const pts = sorted().map(w => { const s = w.entries.filter(x => x.exId === e.id).flatMap(x => x.sets); return s.length ? [w.start, mergeBest({ w: 0, vol: 0, sess: 0, reps: 0, t: 0, tsess: 0 }, s)[metric]] : null; }).filter(Boolean);
    h += '<h2>Verloop</h2><div class="card">';
    if (metric === 'w' || metric === 'vol') h += `<div class="seg" style="margin-bottom:18px">${[['w', 'Gewicht'], ['vol', 'Totaal per set']].map(([k, l]) => `<button data-a="metric" data-v="${k}" aria-pressed="${metric === k}">${l}</button>`).join('')}</div>`;
    const f = v => time ? ftime(v) : metric === 'reps' ? nf(v) + ' herh.' : nf(v) + ' kg';
    h += pts.length > 1 ? lineChart(pts, f) : '<p class="mut" style="margin:0">Na je tweede workout met deze oefening zie je hier je verloop.</p>';
    h += '</div><h2>Geschiedenis</h2><div class="list">' + sorted().reverse().filter(w => w.entries.some(x => x.exId === e.id)).slice(0, 20).map(w => `<button class="item" data-a="open" data-v="${w.id}"><span><b>${fdate(w.start, { day: 'numeric', month: 'long', year: 'numeric' })}</b><span class="mut num">${w.entries.filter(x => x.exId === e.id).flatMap(x => x.sets).map(fset).join(', ')}</span></span></button>`).join('') + '</div>';
  } else h += '<div class="card empty">Nog niet gedaan. Je PR\'s verschijnen hier na je eerste workout.</div>';
  return h + '<button class="btn" data-a="exedit">Bewerken</button><button class="btn bad" data-a="exdel">Verwijderen</button>';
}
function lineChart(pts, f) {
  const W = 340, H = 160, L = 4, R = 12, T = 22, B = 24;
  const ys = pts.map(p => p[1]); let lo = Math.min(...ys), hi = Math.max(...ys);
  if (lo === hi) { lo -= 1; hi += 1; }
  const x0 = pts[0][0], x1 = pts[pts.length - 1][0];
  const X = t => L + 8 + (t - x0) / (x1 - x0 || 1) * (W - L - R - 8), Y = v => T + (hi - v) / (hi - lo) * (H - T - B - 8);
  const P = pts.map(p => [X(p[0]), Y(p[1])]), end = P[P.length - 1];
  const d = t => fdate(t, { day: 'numeric', month: 'short' });
  return `<svg class="line" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verloop van ${f(ys[0])} naar ${f(ys[ys.length - 1])}">
  <line x1="0" x2="${W}" y1="${H - B}" y2="${H - B}" stroke="var(--line)"/>
  <polyline points="${P.map(p => p.join(',')).join(' ')}" fill="none" stroke="var(--mark)" stroke-width="2" stroke-linejoin="round"/>
  ${P.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="var(--mark)" stroke="var(--card)" stroke-width="2"/><circle cx="${p[0]}" cy="${p[1]}" r="14" fill="transparent" data-tip="${d(pts[i][0])}: ${f(ys[i])}"/>`).join('')}
  <text x="${end[0]}" y="${end[1] - 10}" text-anchor="end" style="fill:var(--ink);font-weight:650">${f(ys[ys.length - 1])}</text>
  <text x="0" y="${H - 6}">${d(x0)}</text><text x="${W}" y="${H - 6}" text-anchor="end">${d(x1)}</text></svg>`;
}

function curHabit() { return db.habits.find(h => h.id === ui.habit) || db.habits[0]; }
function vHome() {
  const h0 = curHabit(), today = dkey(Date.now()), day = ui.day || today, tot = dayTotals(h0.id);
  const n = tot[day] || 0, entries = db.logs.filter(l => l.hid === h0.id && l.day === day);
  let h = '<h1>Thuis</h1><div class="chips" style="margin-bottom:14px">' + db.habits.map(x => `<button class="chip" data-a="habit" data-v="${x.id}" aria-pressed="${x.id === h0.id}">${esc(x.name)}</button>`).join('') + '<button class="chip" data-a="habitnew">+ Nieuw</button></div>';
  h += `<section class="card big"><div class="mut">${day === today ? 'Vandaag' : fdate(fromKey(day), { weekday: 'long', day: 'numeric', month: 'long' })}</div><div class="count num">${nf(n)}</div><div class="mut">${esc(h0.name.toLowerCase())}</div>`;
  if (h0.goal) h += `<div class="goal"><i style="width:${Math.min(100, n / h0.goal * 100)}%"></i></div><div class="mut">${n >= h0.goal ? `Doel van ${nf(h0.goal)} gehaald!` : `Nog ${nf(h0.goal - n)} tot je doel van ${nf(h0.goal)}`}</div>`;
  h += `<div class="quick">${[1, 3, 5, 10].map(q => `<button data-a="log" data-v="${q}">+${q}</button>`).join('')}</div>
  <form class="inline" data-f="log"><input name="n" inputmode="numeric" placeholder="Ander aantal" aria-label="Ander aantal" autocomplete="off"><button class="btn pri">Toevoegen</button></form>`;
  if (day !== today) h += '<button class="link" style="margin-top:8px" data-a="today">Terug naar vandaag</button>';
  h += '</section>';
  if (entries.length) h += `<div class="list">${[...entries].reverse().map(l => `<div class="item" style="min-height:50px;padding:2px 8px 2px 16px"><span><b class="num">${nf(l.n)}</b></span><span class="mut">${dkey(l.ts) === l.day ? new Date(l.ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : ''}</span><button class="iconb" data-a="unlog" data-v="${l.id}" aria-label="${nf(l.n)} verwijderen">${I.x}</button></div>`).join('')}</div>`;
  h += '<h2>Afgelopen weken</h2><section class="card">' + heatmap(tot, day, h0) + '</section>';
  const vals = Object.entries(tot).filter(x => x[1] > 0), rec = vals.sort((a, b) => b[1] - a[1])[0], mon = dkey(monday(Date.now()));
  const wk = sum(vals.filter(x => x[0] >= mon).map(x => x[1])), all = sum(vals.map(x => x[1])), st = dayStreak(tot);
  h += `<div class="tiles"><div class="tile"><b>${nf(wk)}</b><span>deze week</span></div><div class="tile"><b>${plural(st, 'dag', 'dagen')}</b><span>op rij</span></div><div class="tile"><b>${rec ? nf(rec[1]) : 0}</b><span>record${rec ? ' op ' + fdate(fromKey(rec[0]), { day: 'numeric', month: 'short' }) : ' op één dag'}</span></div><div class="tile"><b>${nf(all)}</b><span>totaal</span></div></div>`;
  return h + '<button class="btn" data-a="habitedit">Naam en dagdoel aanpassen</button>';
}
function heatmap(tot, sel, hb) {
  const W = 16, start = addDays(monday(Date.now()), -7 * (W - 1)), today = dkey(Date.now());
  const days = [...Array(W * 7)].map((_, i) => dkey(addDays(start, i)));
  const mx = Math.max(1, ...days.map(d => tot[d] || 0));
  const lvl = n => n ? Math.min(4, Math.ceil(n / mx * 4)) : 0;
  let h = `<div class="heat" style="--w:${W}"><span></span>`, lastM = -1, lastC = -9;
  for (let w = 0; w < W; w++) {
    const d = fromKey(days[w * 7]), m = d.getMonth();
    const show = m !== lastM && w - lastC > 1; if (show) { lastM = m; lastC = w; }
    h += `<span class="m">${show ? fdate(d, { month: 'short' }) : ''}</span>`;
  }
  ['ma', '', 'wo', '', 'vr', '', 'zo'].forEach((l, r) => {
    h += `<span>${l}</span>`;
    for (let w = 0; w < W; w++) {
      const d = days[w * 7 + r], n = tot[d] || 0;
      h += d > today ? '<span></span>' : `<button class="l${lvl(n)} ${d === sel ? 'sel' : ''}" data-a="day" data-v="${d}" data-tip="${fdate(fromKey(d))}: ${nf(n)}" aria-label="${fdate(fromKey(d))}: ${nf(n)} ${esc(hb.name)}"></button>`;
    }
  });
  return h + `</div><div class="legend"><span>0</span>${[0, 1, 2, 3, 4].map(i => `<i style="background:var(--h${i})"></i>`).join('')}<span>${nf(mx)}</span></div><p class="mut" style="margin:8px 0 0">Tik op een dag om hem te bekijken of aan te vullen.</p>`;
}

function funFact(kg) {
  const f = [[180000, 'blauwe vinvis', 'blauwe vinvissen'], [40000, 'volgeladen vrachtwagen', 'volgeladen vrachtwagens'], [6000, 'Afrikaanse olifant', 'Afrikaanse olifanten'], [1400, 'personenauto', "personenauto's"], [500, 'paard', 'paarden'], [80, 'volwassen mens', 'volwassen mensen']].find(x => kg >= x[0]);
  if (!f) return '';
  const n = Math.round(kg / f[0] * 10) / 10;
  return `Dat is evenveel als ${plural(n, f[1], f[2])}.`;
}
function vStats() {
  const ws = sorted(), now = new Date(), mon = monday(now);
  const inMonth = ws.filter(w => { const d = new Date(w.start); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
  const inWeek = ws.filter(w => dkey(w.start) >= dkey(mon)).length;
  let h = `<h1>Statistieken</h1><div class="tiles"><div class="tile"><b>${inWeek}</b><span>workouts deze week</span></div><div class="tile"><b>${inMonth}</b><span>workouts deze maand</span></div><div class="tile"><b>${plural(weekStreak(), 'week', 'weken')}</b><span>op rij getraind</span></div><div class="tile"><b>${ws.length}</b><span>workouts in totaal</span></div></div>`;
  if (ws.length) {
    const wk = [...Array(12)].map((_, i) => { const a = addDays(mon, -7 * (11 - i)), k = dkey(a); return [a, ws.filter(w => dkey(monday(w.start)) === k).length]; });
    const mx = Math.max(1, ...wk.map(x => x[1]));
    h += `<h2>Workouts per week</h2><div class="card"><div class="bars">${wk.map(([d, n]) => `<button data-tip="Week van ${fdate(d, { day: 'numeric', month: 'short' })}: ${plural(n, 'workout', 'workouts')}" aria-label="Week van ${fdate(d)}: ${n}">${n || ''}<i style="height:${n / mx * 100}px"></i></button>`).join('')}</div><div class="axis"><span>${fdate(wk[0][0], { day: 'numeric', month: 'short' })}</span><span>deze week</span></div></div>`;
    const since = ui.period ? addDays(now, -ui.period).getTime() : 0, sel = ws.filter(w => w.start >= since);
    const m = Object.fromEntries(muscleSets(sel)), rows = MUSCLES.map(x => [x, m[x] || 0]).sort((a, b) => b[1] - a[1]);
    h += `<h2>Spiergroepen</h2><div class="card"><div class="seg" style="margin-bottom:14px">${[[30, '30 dagen'], [90, '90 dagen'], [0, 'Alles']].map(([k, l]) => `<button data-a="period" data-v="${k}" aria-pressed="${ui.period === k}">${l}</button>`).join('')}</div>${hbars(rows, ['set', 'sets'])}<p class="mut" style="margin:8px 0 0">Aantal sets per spiergroep</p></div>`;
    const kg = sum(ws.map(volume)), cnt = {};
    for (const w of ws) for (const id of new Set(w.entries.map(e => e.exId))) cnt[id] = (cnt[id] || 0) + 1;
    const fav = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0], dur = ws.map(duration).filter(x => x > 0);
    const wd = [0, 0, 0, 0, 0, 0, 0]; ws.forEach(w => wd[new Date(w.start).getDay()]++);
    const bd = wd.indexOf(Math.max(...wd)), DN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
    const it = (l, v, s = '') => `<div class="item"><span>${l}${s ? `<span class="mut" style="display:block">${s}</span>` : ''}</span><span class="end" style="white-space:normal;max-width:55%"><b>${v}</b></span></div>`;
    h += '<h2>Weetjes</h2><div class="list">' + (kg ? it('Totaal verplaatst', nf(kg) + ' kg', funFact(kg)) : '') + (fav ? it('Favoriete oefening', esc(ex(fav[0]).name), plural(fav[1], 'workout', 'workouts')) : '')
      + it('Favoriete trainingsdag', DN[bd], plural(wd[bd], 'workout', 'workouts')) + (dur.length ? it('Gemiddelde duur', Math.round(sum(dur) / dur.length) + ' min') : '') + it('Sets in totaal', nf(sum(ws.flatMap(w => w.entries.map(e => e.sets.length))))) + '</div>';
  } else h += '<div class="card empty">Na je eerste workout zie je hier hoe vaak je traint en welke spiergroepen je het meest pakt.</div>';
  return h + '<h2>Back-up</h2><div class="card"><p class="mut">Je gegevens staan alleen op dit toestel. Bewaar af en toe een back-up, bijvoorbeeld in iCloud of Bestanden.</p><button class="btn" data-a="export">Back-up maken</button><button class="btn" data-a="import">Back-up terugzetten</button></div>';
}

/* ---------- sheets ---------- */
let sheet = null;
function openSheet(s) { sheet = s; renderSheet(); }
function closeSheet() { sheet = null; $('#sheet').innerHTML = ''; }
function renderSheet() {
  const s = sheet; let h = '';
  const head = t => `<div class="row"><h2 style="margin:6px 0">${t}</h2><button class="iconb" data-a="close" aria-label="Sluiten">${I.x}</button></div>`;
  if (s.k === 'pick') {
    h = head('Kies een oefening');
    h += `<input data-i="pq" placeholder="Zoek oefening" aria-label="Zoek oefening" style="margin-bottom:12px"><div class="list" id="picklist">${exRows('', 'picked') || '<div class="empty">Je hebt nog geen oefeningen.</div>'}</div><button class="btn" data-a="exnew">Nieuwe oefening</button>`;
    if (!db.exercises.some(e => !e.archived)) h += '<button class="btn" data-a="examples">Voeg voorbeelden toe</button>';
  } else if (s.k === 'ex') {
    const used = s.id && db.workouts.concat(db.active || []).some(w => w.entries.some(e => e.exId === s.id));
    h = head(s.id ? 'Oefening bewerken' : 'Nieuwe oefening') + `<label class="f" for="exn">Naam</label><input id="exn" data-i="sname" value="${esc(s.name)}" placeholder="Bijv. Squat" autocomplete="off">
    <div class="flabel">Wat meet je?</div>` + (used ? `<p>${s.type === 'time' ? 'Tijd' : 'Gewicht'} <span class="mut">(vast, want je hebt al sets ingevuld)</span></p>` : `<div class="seg"><button data-a="stype" data-v="weight" aria-pressed="${s.type === 'weight'}">Gewicht</button><button data-a="stype" data-v="time" aria-pressed="${s.type === 'time'}">Tijd</button></div>`)
    + `<div class="flabel">Spiergroepen</div><div class="chips">${MUSCLES.map(m => `<button class="chip" data-a="smus" data-v="${m}" aria-pressed="${s.muscles.includes(m)}">${m}</button>`).join('')}</div><button class="btn pri" data-a="exsave">Opslaan</button>`;
  } else if (s.k === 'habit') {
    h = head(s.id ? 'Oefening aanpassen' : 'Nieuwe thuisoefening') + `<form data-f="habit"><label class="f" for="hn">Naam</label><input id="hn" name="name" value="${esc(s.name)}" placeholder="Bijv. Push-ups" autocomplete="off"><label class="f" for="hg">Dagdoel (mag leeg)</label><input id="hg" name="goal" inputmode="numeric" value="${s.goal || ''}" autocomplete="off"><button class="btn pri">Opslaan</button></form>`;
    if (s.id && db.habits.length > 1) h += '<button class="btn bad" data-a="habitdel">Verwijderen</button>';
  } else if (s.k === 'exmenu') {
    h = head(esc(ex(db.active.entries[s.i].exId).name)) + (s.i > 0 ? '<button class="btn" data-a="exup">Omhoog verplaatsen</button>' : '') + (s.i < db.active.entries.length - 1 ? '<button class="btn" data-a="exdown">Omlaag verplaatsen</button>' : '') + '<button class="btn bad" data-a="exrm">Uit workout halen</button>';
  }
  const old = $('#sheet .panel'), top = old ? old.scrollTop : 0;
  $('#sheet').innerHTML = `<div class="back" data-a="backdrop"><div class="panel" role="dialog" aria-modal="true" ${old ? 'style="animation:none"' : ''}>${h}</div></div>`;
  $('#sheet .panel').scrollTop = top;
}

/* ---------- acties ---------- */
function addEntry(id) {
  const n = Math.max(1, lastSets(id).length);
  db.active.entries.push({ exId: id, sets: [...Array(n)].map(emptySet) });
  save();
}
function startWorkout(name, ids = []) {
  db.active = { name, start: Date.now(), entries: [] };
  ids.forEach(addEntry); save(); go('editor');
}
function defaultName() {
  const h = new Date().getHours();
  return h < 12 ? 'Ochtendworkout' : h < 18 ? 'Middagworkout' : 'Avondworkout';
}
function finish() {
  const a = db.active; let dropped = 0;
  const entries = a.entries.map(en => {
    const time = isTime(en.exId), prev = lastSets(en.exId);
    const sets = en.sets.map((s, j) => {
      const c = cleanSet(s, time, prev[j] || prev[prev.length - 1]);
      if (!c && (s.done || [s.w, s.r, s.m, s.s].some(v => v !== ''))) dropped++;
      return c;
    }).filter(Boolean);
    return { exId: en.exId, sets };
  }).filter(e => e.sets.length);
  if (!entries.length) return alert('Vul eerst minstens één set in.');
  if (dropped && !confirm(`${plural(dropped, 'set is', 'sets zijn')} niet compleet ingevuld en ${dropped === 1 ? 'wordt' : 'worden'} niet opgeslagen. Toch doorgaan?`)) return;
  const w = { id: a.editId || uid(), name: a.name.trim() || defaultName(), start: a.start, entries };
  if (a.editId) {
    const o = db.workouts.find(x => x.id === a.editId);
    if (o?.end) w.end = a.start + (o.end - o.start);
    db.workouts = db.workouts.filter(x => x.id !== a.editId);
  } else if (!a.backdated && Date.now() - a.start < 6 * 36e5) w.end = Date.now();
  db.workouts.push(w); db.active = null; save();
  ui.just = a.editId ? null : w.id; ui.tab = 'train';
  go('done', w.id);
}
const setOf = t => db.active.entries[t.dataset.e].sets[t.dataset.s];
function delHabit() {
  if (!confirm('Deze thuisoefening en alle ingevulde aantallen verwijderen?')) return;
  db.habits = db.habits.filter(h => h.id !== sheet.id); db.logs = db.logs.filter(l => l.hid !== sheet.id);
  ui.habit = null; save(); closeSheet(); render();
}
function logReps(n) {
  n = Math.round(n); if (!(n > 0) || n > 100000) return;
  db.logs.push({ id: uid(), hid: curHabit().id, day: ui.day || dkey(Date.now()), ts: Date.now(), n });
  save(); render();
}
async function exportData() {
  const name = `fitness-backup-${dkey(Date.now())}.json`, f = new File([JSON.stringify(db)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [f] }) && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ files: [f] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
function validBackup(d) {
  const arr = Array.isArray;
  return d && arr(d.exercises) && arr(d.workouts) && arr(d.habits) && d.habits.length && arr(d.logs)
    && d.exercises.every(e => e.id && typeof e.name === 'string' && arr(e.muscles) && e.muscles.every(m => MUSCLES.includes(m)))
    && d.workouts.every(w => w.id && isFinite(w.start) && arr(w.entries) && w.entries.every(e => e.exId && arr(e.sets)))
    && d.habits.every(h => h.id && typeof h.name === 'string')
    && d.logs.every(l => /^\d{4}-\d\d-\d\d$/.test(l.day) && isFinite(l.n));
}
function importData() {
  const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
  i.onchange = async () => {
    try {
      const d = JSON.parse(await i.files[0].text());
      if (!validBackup(d)) throw 0;
      if (!confirm(`Deze back-up bevat ${plural(d.workouts.length, 'workout', 'workouts')}. Al je huidige gegevens worden vervangen. Doorgaan?`)) return;
      db = { ...fresh(), ...d }; save(); render();
    } catch { alert('Dit bestand is geen geldige back-up van deze app.'); }
  };
  i.click();
}

const A = {
  tab: v => { ui.tab = v; ui.view = null; ui.q = ''; if (v === 'home') ui.day = null; render(); },
  back: () => { ui.just = null; go(ui.tab === 'ex' && ui.view === 'done' && ui.from ? 'exd' : null, ui.view === 'done' ? ui.from : null); },
  start: () => startWorkout(defaultName()),
  resume: () => go('editor'),
  showall: () => { ui.all = true; render(); },
  open: v => { ui.from = ui.view === 'exd' ? ui.id : null; go('done', v); },
  finish, pick: () => openSheet({ k: 'pick' }),
  picked: v => { addEntry(v); closeSheet(); render(); window.scrollTo(0, document.body.scrollHeight); },
  addset: v => {
    const e = db.active.entries[v], l = e.sets[e.sets.length - 1];
    e.sets.push(l ? { ...l, done: false } : emptySet()); save(); render();
  },
  delset: (v, t) => { db.active.entries[t.dataset.e].sets.splice(t.dataset.s, 1); save(); render(); },
  tick: (v, t) => {
    const s = setOf(t), en = db.active.entries[t.dataset.e];
    if (s.done) s.done = false;
    else {
      const time = isTime(en.exId), pv = lastSets(en.exId), c = cleanSet({ ...s, done: true }, time, pv[t.dataset.s] || pv[pv.length - 1]);
      if (!c) return t.closest('.set').querySelector(`[data-k=${time ? 's' : 'r'}]`).focus();
      s.done = true;
      if (time) { s.m = String(Math.floor(c.t / 60)); s.s = String(Math.round(c.t % 60)); }
      else { s.w = String(c.w).replace('.', ','); s.r = String(c.r); }
    }
    save(); render();
  },
  exmenu: v => openSheet({ k: 'exmenu', i: +v }),
  exup: () => move(-1), exdown: () => move(1),
  exrm: () => { db.active.entries.splice(sheet.i, 1); save(); closeSheet(); render(); },
  discard: () => { if (confirm(db.active.editId ? 'Wijzigingen weggooien?' : 'Deze workout weggooien? Alles wat je hebt ingevuld verdwijnt.')) { db.active = null; save(); go(null); } },
  repeat: () => {
    if (db.active) return alert('Je bent al met een workout bezig. Rond die eerst af.');
    const w = db.workouts.find(x => x.id === ui.id); ui.tab = 'train';
    startWorkout(w.name, [...new Set(w.entries.map(e => e.exId))].filter(id => db.exercises.some(e => e.id === id && !e.archived)));
  },
  editw: () => {
    if (db.active) return alert('Je bent al met een workout bezig. Rond die eerst af.');
    const w = db.workouts.find(x => x.id === ui.id); ui.tab = 'train';
    const dec = n => String(n).replace('.', ',');
    db.active = { editId: w.id, name: w.name, start: w.start, entries: w.entries.map(e => ({ exId: e.exId, sets: e.sets.map(s => s.t ? { w: '', r: '', m: String(Math.floor(s.t / 60)), s: dec(s.t % 60), done: true } : { w: dec(s.w), r: String(s.r), m: '', s: '', done: true }) })) };
    save(); go('editor');
  },
  delw: () => { if (confirm('Deze workout definitief verwijderen? Dit kan ook je PR\'s veranderen.')) { db.workouts = db.workouts.filter(w => w.id !== ui.id); save(); A.back(); } },
  exnew: () => openSheet({ k: 'ex', name: '', type: 'weight', muscles: [], pick: sheet?.k === 'pick' }),
  exedit: () => { const e = ex(ui.id); openSheet({ k: 'ex', id: e.id, name: e.name, type: e.type, muscles: [...e.muscles] }); },
  exopen: v => go('exd', v),
  stype: v => { sheet.type = v; renderSheet(); },
  smus: v => { const m = sheet.muscles; m.includes(v) ? m.splice(m.indexOf(v), 1) : m.push(v); renderSheet(); },
  exsave: () => {
    const s = sheet, name = s.name.trim();
    if (!name) return alert('Geef de oefening een naam.');
    if (db.exercises.some(e => !e.archived && e.id !== s.id && e.name.toLowerCase() === name.toLowerCase())) return alert('Je hebt al een oefening met deze naam.');
    const muscles = MUSCLES.filter(m => s.muscles.includes(m)), id = s.id || uid();
    if (s.id) Object.assign(ex(s.id), { name, type: s.type, muscles }); else db.exercises.push({ id, name, type: s.type, muscles });
    save(); closeSheet();
    if (s.pick && db.active) A.picked(id); else render();
  },
  exdel: () => {
    if (db.active?.entries.some(e => e.exId === ui.id)) return alert('Deze oefening zit in je huidige workout. Haal hem daar eerst uit.');
    const used = db.workouts.some(w => w.entries.some(e => e.exId === ui.id));
    if (!confirm(used ? 'Oefening verwijderen uit je lijst? Je oude workouts blijven bewaard.' : 'Oefening verwijderen?')) return;
    if (used) ex(ui.id).archived = true; else db.exercises = db.exercises.filter(e => e.id !== ui.id);
    save(); go(null);
  },
  examples: () => { EXAMPLES.forEach(([name, type, muscles]) => db.exercises.push({ id: uid(), name, type, muscles })); save(); if (sheet) renderSheet(); else render(); },
  metric: v => { ui.metric = v; render(); },
  period: v => { ui.period = +v; render(); },
  habit: v => { ui.habit = v; render(); },
  habitnew: () => openSheet({ k: 'habit', name: '', goal: 0 }),
  habitedit: () => openSheet({ k: 'habit', ...curHabit() }),
  habitdel: delHabit,
  log: v => logReps(+v),
  unlog: v => { db.logs = db.logs.filter(l => l.id !== v); save(); render(); },
  day: v => { ui.day = v === dkey(Date.now()) ? null : v; render(); },
  today: () => { ui.day = null; render(); },
  export: exportData, import: importData, close: closeSheet,
};
function move(d) {
  const e = db.active.entries, i = sheet.i; [e[i], e[i + d]] = [e[i + d], e[i]];
  save(); closeSheet(); render();
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const tip = e.target.closest('[data-tip]');
  if (tip) showTip(tip); else hideTip();
  const t = e.target.closest('[data-a]');
  if (!t) return;
  if (t.dataset.a === 'backdrop') { if (e.target === t) closeSheet(); return; }
  A[t.dataset.a](t.dataset.v, t);
});
document.addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse') return;
  const t = e.target.closest('[data-tip]'); t ? showTip(t) : hideTip();
});
window.addEventListener('scroll', () => hideTip(), { passive: true });
function showTip(t) {
  const el = $('#tip'), r = t.getBoundingClientRect();
  el.textContent = t.dataset.tip; el.className = 'on';
  const b = el.getBoundingClientRect();
  el.style.left = Math.max(8, Math.min(innerWidth - b.width - 8, r.left + r.width / 2 - b.width / 2)) + 'px';
  el.style.top = Math.max(8, r.top - b.height - 6) + 'px';
}
function hideTip() { $('#tip').className = ''; }

document.addEventListener('input', e => {
  const t = e.target, v = t.value;
  switch (t.dataset.i) {
    case 'wname': db.active.name = v; save(); break;
    case 'set': setOf(t)[t.dataset.k] = v; setOf(t).done = false; t.closest('.set').classList.remove('done'); save(); break;
    case 'sname': sheet.name = v; break;
    case 'q': ui.q = v; $('#exlist').innerHTML = exRows(v, 'exopen') || '<div class="empty">Niets gevonden.</div>'; break;
    case 'pq': $('#picklist').innerHTML = exRows(v, 'picked') || '<div class="empty">Niets gevonden.</div>'; break;
  }
});
document.addEventListener('change', e => {
  if (e.target.dataset.i !== 'wdate' || !e.target.value) return;
  const o = new Date(db.active.start), n = fromKey(e.target.value);
  n.setHours(o.getHours(), o.getMinutes(), o.getSeconds(), o.getMilliseconds());
  db.active.start = Math.min(n.getTime(), Date.now());
  db.active.backdated = dkey(n) !== dkey(Date.now());
  save(); render();
});
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  if (e.target.dataset.f === 'log') logReps(num(f.get('n')));
  if (e.target.dataset.f === 'habit') {
    const name = f.get('name').trim(), goal = Math.round(num(f.get('goal')));
    if (!name) return alert('Geef de oefening een naam.');
    if (sheet.id) Object.assign(db.habits.find(h => h.id === sheet.id), { name, goal });
    else { const id = uid(); db.habits.push({ id, name, goal }); ui.habit = id; }
    save(); closeSheet(); render();
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet) closeSheet(); });
/* na middernacht weer openen: 'vandaag' bijwerken */
let shownDay = dkey(Date.now());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && dkey(Date.now()) !== shownDay) { shownDay = dkey(Date.now()); if (!sheet) render(); }
});

if (db.active) ui.view = 'editor';
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
