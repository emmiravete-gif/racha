'use strict';
// Racha — web version. Same JSON format as the Android app, so backups move between both.

// ---------------- dates (epoch days, local calendar) ----------------
const DAY = 86400000;
const epochOf = (y, m, d) => Math.floor(Date.UTC(y, m, d) / DAY);
const todayEpoch = () => { const n = new Date(); return epochOf(n.getFullYear(), n.getMonth(), n.getDate()); };
const dt = e => new Date(e * DAY);                      // read with getUTC*
const dow = e => ((dt(e).getUTCDay() + 6) % 7) + 1;      // 1 = lunes
const dom = e => dt(e).getUTCDate();
const monthLen = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const ymOf = e => ({ y: dt(e).getUTCFullYear(), m: dt(e).getUTCMonth() });

const WEEK_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const WEEK_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (e, opts) => new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', ...opts }).format(dt(e));
const longLabel = e => cap(fmt(e, { weekday: 'long', day: 'numeric', month: 'long' }));
const shortLabel = e => cap(fmt(e, { weekday: 'short', day: 'numeric', month: 'short' }));
const mediumLabel = e => fmt(e, { day: 'numeric', month: 'short', year: 'numeric' });
const monthLabel = (y, m) => cap(new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m, 1))));
const monthShort = (y, m) => cap(new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m, 1)))).replace('.', '');
const toISO = e => dt(e).toISOString().slice(0, 10);
const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return epochOf(y, m - 1, d); };
const countdown = n => n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : n === -1 ? 'Ayer' : n < 0 ? `Hace ${-n} días` : `En ${n} días`;
const pct = r => r == null ? '—' : `${Math.round(r * 100)}%`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const hex = n => '#' + (Number(n) & 0xFFFFFF).toString(16).padStart(6, '0');
const alpha = (h, a) => h + Math.round(a * 255).toString(16).padStart(2, '0');

const HABIT_EMOJIS = ['💧','📚','🏃','🧘','💪','🥗','😴','✍️','🎸','💊','🧹','🚭','💻','🌱','🙏','🦷','🚶','🧠','💰','📵','☀️','🍎','🎨','❤️'];
const GOAL_EMOJIS = ['🎯','🏆','💼','🎓','🏠','✈️','💰','🏋️','📖','🚀','🌍','🎹'];
const DATE_EMOJIS = ['📅','🎂','💍','🎉','✈️','🎓','❤️','🩺','📝','🎄','⚽','🎤'];
const HABIT_COLORS = [0xFFEF5350, 0xFFFF7043, 0xFFFFCA28, 0xFF66BB6A, 0xFF26A69A, 0xFF29B6F6, 0xFF5C6BC0, 0xFFAB47BC, 0xFFEC407A, 0xFF8D6E63];

// ---------------- storage ----------------
const KEY = 'racha-data';
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.habits)) return normalize(d);
  } catch (_) { /* fall through */ }
  return { habits: [], goals: [], dates: [] };
}
function normalize(d) {
  return {
    habits: (d.habits || []).map(h => ({ weekDays: [1,2,3,4,5,6,7], monthDays: [1], done: [], archived: false, emoji: '✅', color: 0xFF66BB6A, freq: 'DAILY', createdDay: todayEpoch(), ...h })),
    goals: (d.goals || []).map(g => ({ emoji: '🎯', note: '', targetDay: null, milestones: [], completed: false, createdDay: todayEpoch(), ...g })),
    dates: (d.dates || []).map(x => ({ emoji: '📅', yearly: false, note: '', ...x })),
  };
}
let data = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { toast('No se pudo guardar'); }
  render();
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------------- habit logic (mirrors Model.kt) ----------------
const setCache = new WeakMap();
const doneSet = h => { let s = setCache.get(h.done); if (!s) { s = new Set(h.done); setCache.set(h.done, s); } return s; };
const isDone = (h, e) => doneSet(h).has(e);
const startDay = h => h.done.length ? Math.min(h.createdDay, ...h.done) : h.createdDay;
function matches(h, e) {
  if (h.freq === 'WEEKLY') return h.weekDays.includes(dow(e));
  if (h.freq === 'MONTHLY') { const { y, m } = ymOf(e); const last = monthLen(y, m); return h.monthDays.some(x => Math.min(x, last) === dom(e)); }
  return true;
}
const isDue = (h, e) => e >= startDay(h) && matches(h, e);
function currentStreak(h, today = todayEpoch()) {
  let e = today; const start = startDay(h); let s = 0;
  if (isDue(h, e) && !isDone(h, e)) e--;
  for (; e >= start; e--) if (matches(h, e)) { if (isDone(h, e)) s++; else break; }
  return s;
}
function bestStreak(h, today = todayEpoch()) {
  let cur = 0, best = 0;
  for (let e = startDay(h); e <= today; e++) if (matches(h, e)) {
    if (isDone(h, e)) { cur++; best = Math.max(best, cur); } else if (e !== today) cur = 0;
  }
  return best;
}
function rate(h, from, to) {
  let due = 0, ok = 0;
  for (let e = from; e <= to; e++) if (isDue(h, e)) { due++; if (isDone(h, e)) ok++; }
  return due ? ok / due : null;
}
const active = () => data.habits.filter(h => !h.archived);
function dayRatio(e) {
  const due = active().filter(h => isDue(h, e));
  return due.length ? due.filter(h => isDone(h, e)).length / due.length : null;
}
function monthStats(y, m, today = todayEpoch()) {
  let due = 0, ok = 0, perfect = 0;
  for (let d = 1; d <= monthLen(y, m); d++) {
    const e = epochOf(y, m, d); if (e > today) break;
    const dd = active().filter(h => isDue(h, e)); const k = dd.filter(h => isDone(h, e)).length;
    due += dd.length; ok += k; if (dd.length && k === dd.length) perfect++;
  }
  return { rate: due ? ok / due : null, perfect, checkIns: ok };
}
function freqLabel(h) {
  if (h.freq === 'WEEKLY') return h.weekDays.length === 7 ? 'Cada día' : [...h.weekDays].sort().map(d => WEEK_SHORT[d - 1]).join(', ');
  if (h.freq === 'MONTHLY') return 'Días ' + [...h.monthDays].sort((a, b) => a - b).join(', ') + ' del mes';
  return 'Cada día';
}
const goalProgress = g => g.completed ? 1 : g.milestones.length ? g.milestones.filter(m => m.done).length / g.milestones.length : 0;
function nextOccurrence(x, today = todayEpoch()) {
  if (!x.yearly) return x.day;
  const b = dt(x.day); const ty = ymOf(today).y;
  let n = epochOf(ty, b.getUTCMonth(), b.getUTCDate());
  if (n < today) n = epochOf(ty + 1, b.getUTCMonth(), b.getUTCDate());
  return n;
}
function occursOn(x, e) {
  if (!x.yearly) return x.day === e;
  const a = dt(x.day), b = dt(e);
  return e >= x.day && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

// ---------------- mutations ----------------
function toggle(id, e) {
  const h = data.habits.find(x => x.id === id); if (!h) return;
  h.done = isDone(h, e) ? h.done.filter(x => x !== e) : [...h.done, e];
  if (navigator.vibrate) navigator.vibrate(12);
  save();
}
const upsert = (list, item) => { const i = data[list].findIndex(x => x.id === item.id); if (i >= 0) data[list][i] = item; else data[list].push(item); save(); };
const remove = (list, id) => { data[list] = data[list].filter(x => x.id !== id); save(); };

// ---------------- UI state ----------------
const ui = {
  tab: sessionStorage.getItem('tab') || 'today',
  todaySel: todayEpoch(),
  cal: ymOf(todayEpoch()),
  calSel: todayEpoch(),
  calFilter: null,
  goalSeg: 0,
};
const $screen = document.getElementById('screen');

function ring(r, size, stroke, label, color = 'var(--primary)', track = 'var(--surface-3)') {
  const rad = (size - stroke) / 2, c = 2 * Math.PI * rad;
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${rad}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${rad}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - (r || 0))}"/></svg>
    <span class="lbl">${label}</span></div>`;
}
const head = (title, sub, trailing = '') =>
  `<div class="head"><div class="t"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${trailing}</div>`;
const empty = (e, t, p) => `<div class="empty"><div class="e">${e}</div><div class="t">${t}</div><p>${p}</p></div>`;
const stat = (v, k) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`;

// ---------------- screens ----------------
function renderToday() {
  const today = todayEpoch(); const day = ui.todaySel; const isToday = day === today;
  const hs = active(); const due = hs.filter(h => isDue(h, day)); const others = hs.filter(h => !isDue(h, day));
  const done = due.filter(h => isDone(h, day)).length;
  const top = hs.map(h => [h, currentStreak(h, today)]).sort((a, b) => b[1] - a[1])[0];
  const msg = !due.length ? 'Día libre ✨' : done === due.length ? '¡Día perfecto! 🎉' : done === 0 ? 'Vamos a por ello 💪'
    : due.length - done === 1 ? 'Solo te queda 1' : `Te quedan ${due.length - done}`;

  let week = '';
  for (let i = 6; i >= 0; i--) {
    const e = today - i;
    week += `<button class="wday ${e === day ? 'sel' : ''}" data-act="today-day" data-e="${e}">
      <span class="l">${WEEK_LETTERS[dow(e) - 1]}</span>${ring(dayRatio(e), 36, 3.5, `<span style="font-size:13px;font-weight:${e === today ? 800 : 500}">${dom(e)}</span>`)}</button>`;
  }
  const card = (h, on) => {
    const c = hex(h.color); const s = currentStreak(h, today); const d = isDone(h, day);
    return `<div class="habit ${on ? '' : 'off'}" style="--c:${c}">
      <button class="badge" style="background:${alpha(c, .18)}" data-act="edit-habit" data-id="${h.id}">${h.emoji}</button>
      <button class="grow" style="text-align:left" data-act="edit-habit" data-id="${h.id}">
        <div class="name ellipsis">${esc(h.name)}</div>
        <div class="small ellipsis">${s > 0 ? `🔥 ${s} · ` : ''}${freqLabel(h)}</div></button>
      ${on ? `<button class="check ${d ? 'on' : ''}" data-act="toggle" data-id="${h.id}" data-e="${day}" aria-label="Marcar">${d ? '✓' : ''}</button>` : ''}
    </div>`;
  };
  const upcoming = data.dates.map(x => [x, nextOccurrence(x, today)]).filter(([, n]) => n >= today && n - today <= 60)
    .sort((a, b) => a[1] - b[1]).slice(0, 5);

  return head(isToday ? 'Hoy' : shortLabel(day), longLabel(day), `<button class="icon-btn" data-act="menu" aria-label="Más">⋯</button>`)
    + `<div class="week">${week}</div>`
    + `<div class="summary">${ring(due.length ? done / due.length : 0, 86, 9, `<span style="font-size:20px">${done}/${due.length}</span>`, 'var(--primary)', 'color-mix(in srgb, var(--on-primary-soft) 14%, transparent)')}
        <div><div class="msg">${msg}</div>${top && top[1] > 0 ? `<div class="sub">Mejor racha activa: 🔥 ${top[1]} · ${top[0].emoji} ${esc(top[0].name)}</div>` : ''}</div></div>`
    + (!hs.length ? empty('🌱', 'Empieza con un hábito', 'Pulsa «Hábito» para añadir el primero.') : '')
    + (due.length ? `<div class="section">${isToday ? 'Para hoy' : 'Ese día tocaba'}</div>` + due.map(h => card(h, true)).join('') : '')
    + (others.length ? `<div class="section">${isToday ? 'No tocan hoy' : 'No tocaban ese día'}</div>` + others.map(h => card(h, false)).join('') : '')
    + (upcoming.length ? `<div class="section">Próximas fechas</div><div class="hscroll">${upcoming.map(([x, n]) =>
      `<button class="event-chip" style="text-align:left" data-act="edit-date" data-id="${x.id}"><div class="e">${x.emoji}</div>
        <div class="strong ellipsis" style="max-width:130px">${esc(x.title)}</div><div class="when">${countdown(n - today)}</div></button>`).join('')}</div>` : '');
}

function renderCalendar() {
  const today = todayEpoch(); const { y, m } = ui.cal; const hs = active();
  const f = hs.find(h => h.id === ui.calFilter);
  const first = epochOf(y, m, 1); const offset = dow(first) - 1; const len = monthLen(y, m);
  const st = monthStats(y, m, today);
  let cells = WEEK_LETTERS.map(l => `<div class="cal-wd">${l}</div>`).join('') + '<div></div>'.repeat(offset);
  for (let d = 1; d <= len; d++) {
    const e = first + d - 1; const fut = e > today;
    let bg = 'transparent', strong = false;
    if (!f) {
      const r = dayRatio(e);
      if (!fut && r != null) { if (r === 0) bg = 'var(--surface-3)'; else { bg = `color-mix(in srgb, var(--primary) ${Math.round(22 + 78 * r)}%, transparent)`; strong = r > .6; } }
    } else if (isDone(f, e)) { bg = hex(f.color); strong = true; }
    else if (!fut && isDue(f, e)) bg = 'var(--surface-3)';
    const ev = data.dates.some(x => occursOn(x, e)); const gl = data.goals.some(g => g.targetDay === e);
    const cls = ['cal-day', e === today && 'today', e === ui.calSel && 'sel', fut && 'future'].filter(Boolean).join(' ');
    cells += `<button class="${cls}" style="background:${bg};${strong ? `color:${f ? '#fff' : 'var(--on-primary)'};font-weight:700` : ''}" data-act="cal-day" data-e="${e}">${d}
      ${ev || gl ? `<span class="dots">${ev ? '<i class="dot" style="background:var(--tertiary)"></i>' : ''}${gl ? '<i class="dot" style="background:var(--danger)"></i>' : ''}</span>` : ''}</button>`;
  }
  const sel = ui.calSel;
  const due = hs.filter(h => isDue(h, sel)); const evs = data.dates.filter(x => occursOn(x, sel)); const gls = data.goals.filter(g => g.targetDay === sel);
  const detail = `<div class="card"><div class="strong" style="font-size:17px;margin-bottom:6px">${longLabel(sel)}</div>
    ${!due.length && !evs.length && !gls.length ? '<div class="small">Nada programado.</div>' : ''}
    ${evs.map(x => `<div style="color:var(--tertiary);font-weight:600;padding:3px 0">${x.emoji}  ${esc(x.title)}</div>`).join('')}
    ${gls.map(g => `<div style="color:var(--danger);font-weight:600;padding:3px 0">${g.emoji}  Fecha límite: ${esc(g.title)}</div>`).join('')}
    ${due.map(h => { const d = isDone(h, sel); return `<button class="check-row" style="--c:${hex(h.color)};width:100%" data-act="toggle" data-id="${h.id}" data-e="${sel}" ${sel > today ? 'disabled' : ''}>
      <span class="box ${d ? 'on' : ''}">${d ? '✓' : ''}</span><span>${h.emoji}  ${esc(h.name)}</span></button>`; }).join('')}</div>`;

  return head('Calendario', monthLabel(y, m), `<button class="icon-btn" data-act="cal-prev" aria-label="Mes anterior">‹</button><button class="icon-btn" data-act="cal-next" aria-label="Mes siguiente">›</button>`)
    + (hs.length ? `<div class="hscroll"><button class="chip ${!f ? 'on' : ''}" data-act="cal-filter" data-id="">Todos</button>${hs.map(h =>
      `<button class="chip ${f && f.id === h.id ? 'on' : ''}" data-act="cal-filter" data-id="${h.id}">${h.emoji} ${esc(h.name)}</button>`).join('')}</div>` : '')
    + `<div class="card" style="padding:12px"><div class="cal-grid">${cells}</div></div>`
    + `<div class="stats">${stat(pct(st.rate), 'cumplido')}${stat(st.perfect, 'días perfectos')}${stat(st.checkIns, 'completados')}</div>`
    + detail;
}

function renderProgress() {
  const today = todayEpoch(); const { y, m } = ymOf(today); const hs = active();
  const st = monthStats(y, m, today);
  const best = hs.reduce((a, h) => Math.max(a, bestStreak(h, today)), 0);
  const total = hs.reduce((a, h) => a + h.done.length, 0);
  const months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(Date.UTC(y, m - i, 1)); months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() }); }
  const bars = months.map((mm, i) => { const r = monthStats(mm.y, mm.m, today).rate;
    return `<div class="bar-col"><span class="small" style="font-size:11px">${pct(r)}</span><div class="bar-wrap"><div class="bar ${i === 5 ? 'cur' : ''}" style="height:${Math.max(3, (r || 0) * 100)}%"></div></div><span style="font-size:11px">${monthShort(mm.y, mm.m)}</span></div>`; }).join('');

  const WEEKS = 18; const monday = today - (dow(today) - 1); const start = monday - (WEEKS - 1) * 7;
  const habitCard = h => {
    const c = hex(h.color); let cells = '';
    for (let e = start; e < start + WEEKS * 7; e++) {
      if (e > today) cells += '<i class="none"></i>';
      else if (isDone(h, e)) cells += `<i style="background:${c}"></i>`;
      else cells += `<i class="${isDue(h, e) ? 'miss' : ''}"></i>`;
    }
    return `<button class="card" style="text-align:left;display:flex;flex-direction:column;gap:12px" data-act="edit-habit" data-id="${h.id}">
      <div class="row"><span class="badge" style="width:38px;height:38px;font-size:18px;background:${alpha(c, .18)}">${h.emoji}</span>
        <div class="grow"><div class="strong ellipsis" style="font-size:17px">${esc(h.name)}</div><div class="small">${freqLabel(h)}</div></div></div>
      <div class="stats" style="width:100%"><div class="mini"><div class="v">🔥 ${currentStreak(h, today)}</div><div class="small">racha</div></div>
        <div class="mini"><div class="v">🏆 ${bestStreak(h, today)}</div><div class="small">mejor</div></div>
        <div class="mini"><div class="v">${pct(rate(h, today - 29, today))}</div><div class="small">30 días</div></div></div>
      <div class="heat" style="width:100%">${cells}</div></button>`;
  };
  return head('Progreso', monthLabel(y, m))
    + `<div class="stats" style="--n:2">${stat(pct(st.rate), 'este mes')}${stat(st.perfect, 'días perfectos')}${stat('🏆 ' + best, 'mejor racha')}${stat(total, 'veces completado')}</div>`
    + `<div class="card"><div class="strong" style="font-size:17px">Últimos 6 meses</div><div class="bars">${bars}</div></div>`
    + (hs.length ? '<div class="section">Por hábito · últimas 18 semanas</div>' + hs.map(habitCard).join('')
      : empty('📈', 'Sin datos todavía', 'Añade hábitos y márcalos para ver tu evolución.'));
}

function renderGoals() {
  const today = todayEpoch();
  const seg = `<div class="seg"><button class="${ui.goalSeg === 0 ? 'on' : ''}" data-act="goal-seg" data-i="0">🎯 Objetivos</button><button class="${ui.goalSeg === 1 ? 'on' : ''}" data-act="goal-seg" data-i="1">📅 Fechas</button></div>`;
  let body = '';
  if (ui.goalSeg === 0) {
    const goalCard = g => {
      const p = goalProgress(g);
      const sub = g.completed ? '¡Conseguido!' : g.targetDay != null ? `${mediumLabel(g.targetDay)} · ${countdown(g.targetDay - today)}` : 'Sin fecha límite';
      return `<div class="card" style="display:flex;flex-direction:column;gap:10px">
        <button class="row" style="text-align:left" data-act="edit-goal" data-id="${g.id}">
          <span class="badge" style="background:var(--primary-soft)">${g.emoji}</span>
          <div class="grow"><div class="strong" style="font-size:17px">${esc(g.title)}</div><div class="small">${sub}</div></div>
          <span class="strong" style="color:var(--primary);font-size:17px">${Math.round(p * 100)}%</span></button>
        ${g.note ? `<div class="small">${esc(g.note)}</div>` : ''}
        <div class="progress"><div style="width:${p * 100}%"></div></div>
        ${g.milestones.map(ms => `<button class="ms ${ms.done ? 'done' : ''}" style="--c:var(--primary);text-align:left" data-act="toggle-ms" data-g="${g.id}" data-m="${ms.id}">
          <span class="box ${ms.done ? 'on' : ''}">${ms.done ? '✓' : ''}</span><span>${esc(ms.text)}</span></button>`).join('')}</div>`;
    };
    const act = data.goals.filter(g => !g.completed).sort((a, b) => (a.targetDay ?? Infinity) - (b.targetDay ?? Infinity));
    const done = data.goals.filter(g => g.completed);
    body = (!data.goals.length ? empty('🎯', 'Sin objetivos aún', 'Define una meta grande y divídela en hitos.') : '')
      + act.map(goalCard).join('') + (done.length ? '<div class="section">Conseguidos 🏆</div>' + done.map(goalCard).join('') : '');
  } else {
    const all = data.dates.map(x => [x, nextOccurrence(x, today)]);
    const up = all.filter(([, n]) => n >= today).sort((a, b) => a[1] - b[1]);
    const past = all.filter(([, n]) => n < today).sort((a, b) => b[1] - a[1]);
    const dateCard = ([x, n], faded) => { const d = n - today;
      return `<button class="card row" style="text-align:left;width:100%;${faded ? 'opacity:.55' : ''}" data-act="edit-date" data-id="${x.id}">
        <span class="badge" style="width:48px;height:48px;background:var(--tertiary-soft)">${x.emoji}</span>
        <div class="grow"><div class="strong" style="font-size:17px">${esc(x.title)}</div><div class="small">${longLabel(n)}${x.yearly ? ' · cada año' : ''}</div>${x.note ? `<div class="small">${esc(x.note)}</div>` : ''}</div>
        <div class="count">${d >= 0 ? `<div class="n">${d}</div><div class="small">${d === 1 ? 'día' : 'días'}</div>` : `<div class="small">${countdown(d)}</div>`}</div></button>`; };
    body = (!data.dates.length ? empty('📅', 'Sin fechas', 'Guarda cumpleaños, exámenes, viajes…') : '')
      + up.map(p => dateCard(p, false)).join('') + (past.length ? '<div class="section">Pasadas</div>' + past.map(p => dateCard(p, true)).join('') : '');
  }
  return head('Metas', 'Objetivos a largo plazo y fechas importantes') + seg + body;
}

function render() {
  const screens = { today: renderToday, calendar: renderCalendar, progress: renderProgress, goals: renderGoals };
  $screen.innerHTML = screens[ui.tab]();
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  document.getElementById('fab-label').textContent = ui.tab === 'goals' ? (ui.goalSeg === 0 ? 'Objetivo' : 'Fecha') : 'Hábito';
}

// ---------------- sheets (editors) ----------------
const $sheet = document.getElementById('sheet-root');
let draft = null;
function closeSheet() { $sheet.innerHTML = ''; draft = null; }
function openSheet(html) {
  $sheet.innerHTML = `<div class="scrim" data-act="close"></div><div class="sheet" role="dialog"><div class="grab"></div>${html}</div>`;
}
const emojiGrid = (list, sel) => `<div class="emojis">${list.map(e => `<button class="${e === sel ? 'on' : ''}" data-act="d-emoji" data-v="${e}">${e}</button>`).join('')}</div>`;
const sw = (on, field) => `<button class="switch ${on ? 'on' : ''}" data-act="d-switch" data-f="${field}" role="switch" aria-checked="${on}"></button>`;
const actions = (canDelete) => `<div class="actions">${canDelete ? '<button class="btn danger" data-act="d-delete">Eliminar</button>' : ''}<span class="grow"></span>
  <button class="btn ghost" data-act="close">Cancelar</button><button class="btn primary" data-act="d-save" id="d-save">Guardar</button></div>`;

function habitSheet() {
  const d = draft.v;
  let days = '';
  if (d.freq === 'WEEKLY') days = `<div class="field"><span class="lbl">Elige los días de la semana</span><div class="daygrid">${WEEK_LETTERS.map((l, i) =>
    `<button class="${d.weekDays.includes(i + 1) ? 'on' : ''}" data-act="d-wd" data-v="${i + 1}">${l}</button>`).join('')}</div></div>`;
  if (d.freq === 'MONTHLY') days = `<div class="field"><span class="lbl">Elige los días del mes</span><div class="daygrid">${Array.from({ length: 31 }, (_, i) =>
    `<button class="${d.monthDays.includes(i + 1) ? 'on' : ''}" data-act="d-md" data-v="${i + 1}">${i + 1}</button>`).join('')}</div>
    ${d.monthDays.some(x => x > 28) ? '<p class="small">En meses más cortos, los días 29–31 caen en el último día.</p>' : ''}</div>`;
  openSheet(`<h2>${draft.isNew ? 'Nuevo hábito' : 'Editar hábito'}</h2>
    <div class="field"><label>Nombre</label><input class="input" data-f="name" value="${esc(d.name)}" placeholder="Beber 2 L de agua" autocapitalize="sentences"></div>
    <div class="field"><span class="lbl">Icono</span>${emojiGrid(HABIT_EMOJIS, d.emoji)}</div>
    <div class="field"><span class="lbl">Color</span><div class="colors">${HABIT_COLORS.map(c => `<button class="${c === d.color ? 'on' : ''}" style="background:${hex(c)}" data-act="d-color" data-v="${c}">${c === d.color ? '✓' : ''}</button>`).join('')}</div></div>
    <div class="field"><span class="lbl">¿Cuándo se repite?</span><div class="seg">${[['DAILY', 'Diario'], ['WEEKLY', 'Semanal'], ['MONTHLY', 'Mensual']].map(([f, l]) =>
      `<button class="${d.freq === f ? 'on' : ''}" data-act="d-freq" data-v="${f}">${l}</button>`).join('')}</div></div>
    ${days}${actions(!draft.isNew)}`);
  validate();
}
function goalSheet() {
  const d = draft.v;
  openSheet(`<h2>${draft.isNew ? 'Nuevo objetivo' : 'Editar objetivo'}</h2>
    <div class="field"><label>Objetivo</label><input class="input" data-f="title" value="${esc(d.title)}" placeholder="Correr una media maratón"></div>
    <div class="field"><span class="lbl">Icono</span>${emojiGrid(GOAL_EMOJIS, d.emoji)}</div>
    <div class="field"><label>Notas / por qué</label><textarea class="input" data-f="note" rows="2">${esc(d.note)}</textarea></div>
    <div class="field"><label>Fecha límite (opcional)</label><input class="input" type="date" data-f="targetDay" value="${d.targetDay != null ? toISO(d.targetDay) : ''}"></div>
    <div class="field"><span class="lbl">Hitos</span>
      ${d.milestones.map((ms, i) => `<div class="ms-edit"><span class="grow">${ms.done ? '✅' : '◻️'} ${esc(ms.text)}</span><button class="icon-btn" data-act="d-ms-del" data-i="${i}" aria-label="Quitar">✕</button></div>`).join('')}
      <div class="ms-edit"><input class="input" id="ms-new" placeholder="Añadir hito" enterkeyhint="done"><button class="icon-btn" data-act="d-ms-add" aria-label="Añadir hito">＋</button></div></div>
    <div class="switch-row"><span>Objetivo conseguido</span>${sw(d.completed, 'completed')}</div>
    ${actions(!draft.isNew)}`);
  validate();
}
function dateSheet() {
  const d = draft.v;
  openSheet(`<h2>${draft.isNew ? 'Nueva fecha importante' : 'Editar fecha'}</h2>
    <div class="field"><label>Título</label><input class="input" data-f="title" value="${esc(d.title)}" placeholder="Cumpleaños de mamá"></div>
    <div class="field"><span class="lbl">Icono</span>${emojiGrid(DATE_EMOJIS, d.emoji)}</div>
    <div class="field"><label>Fecha</label><input class="input" type="date" data-f="day" value="${toISO(d.day)}"></div>
    <div class="switch-row"><span>Se repite cada año</span>${sw(d.yearly, 'yearly')}</div>
    <div class="field"><label>Nota (opcional)</label><input class="input" data-f="note" value="${esc(d.note)}"></div>
    ${actions(!draft.isNew)}`);
  validate();
}
const sheets = { habits: habitSheet, goals: goalSheet, dates: dateSheet };
function edit(list, item) {
  const isNew = !item;
  const blank = {
    habits: () => ({ id: uid(), name: '', emoji: HABIT_EMOJIS[0], color: HABIT_COLORS[3], freq: 'DAILY', weekDays: [1, 3, 5], monthDays: [dom(todayEpoch())], createdDay: todayEpoch(), done: [], archived: false }),
    goals: () => ({ id: uid(), title: '', emoji: GOAL_EMOJIS[0], note: '', targetDay: null, milestones: [], completed: false, createdDay: todayEpoch() }),
    dates: () => ({ id: uid(), title: '', emoji: DATE_EMOJIS[0], day: todayEpoch(), yearly: false, note: '' }),
  };
  const v = isNew ? blank[list]() : JSON.parse(JSON.stringify(item));
  if (list === 'habits' && !isNew && v.freq !== 'WEEKLY') v.weekDays = [1, 3, 5];
  draft = { list, isNew, v };
  sheets[list]();
}
function validate() {
  if (!draft) return; const d = draft.v; let ok;
  if (draft.list === 'habits') ok = d.name.trim() && (d.freq !== 'WEEKLY' || d.weekDays.length) && (d.freq !== 'MONTHLY' || d.monthDays.length);
  else ok = d.title.trim();
  const b = document.getElementById('d-save'); if (b) b.disabled = !ok;
}
function addMilestone() {
  const inp = document.getElementById('ms-new'); const t = inp && inp.value.trim();
  if (t) { draft.v.milestones.push({ id: uid(), text: t, done: false }); goalSheet(); document.getElementById('ms-new').focus(); }
}
$sheet.addEventListener('input', e => {
  const f = e.target.dataset.f; if (!f || !draft) return;
  if (f === 'targetDay') draft.v.targetDay = e.target.value ? fromISO(e.target.value) : null;
  else if (f === 'day') { if (e.target.value) draft.v.day = fromISO(e.target.value); }
  else draft.v[f] = e.target.value;
  validate();
});
$sheet.addEventListener('keydown', e => { if (e.target.id === 'ms-new' && e.key === 'Enter') { e.preventDefault(); addMilestone(); } });

// ---------------- menu, toast, backup ----------------
function toast(t) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = t; document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
function openMenu() {
  $sheet.innerHTML = `<div class="scrim" style="background:transparent" data-act="close"></div><div class="menu">
    <button data-act="export">⬇️  Exportar copia de seguridad</button>
    <button data-act="import">⬆️  Importar copia de seguridad</button>
    <button data-act="install-help">📲  Cómo instalar en el iPhone</button></div>`;
}
function exportData() {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const name = `racha-${toISO(todayEpoch())}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: 'Copia de Racha' }).catch(() => {});
  } else {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
document.getElementById('import-file').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const parsed = JSON.parse(await f.text());
    if (!Array.isArray(parsed.habits)) throw new Error();
    if (!confirm('Se sustituirán todos los hábitos, objetivos y fechas actuales por los de la copia. ¿Continuar?')) return;
    data = normalize(parsed); save(); toast('Copia restaurada');
  } catch (_) { toast('Archivo no válido'); }
});

// ---------------- events ----------------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act; const n = k => Number(el.dataset[k]);
  switch (a) {
    case 'tab': ui.tab = el.dataset.tab; sessionStorage.setItem('tab', ui.tab); render(); window.scrollTo(0, 0); break;
    case 'fab': ui.tab === 'goals' ? edit(ui.goalSeg === 0 ? 'goals' : 'dates') : edit('habits'); break;
    case 'toggle': toggle(el.dataset.id, n('e')); break;
    case 'today-day': ui.todaySel = n('e'); render(); break;
    case 'cal-day': ui.calSel = n('e'); render(); break;
    case 'cal-prev': case 'cal-next': {
      const d = new Date(Date.UTC(ui.cal.y, ui.cal.m + (a === 'cal-next' ? 1 : -1), 1));
      ui.cal = { y: d.getUTCFullYear(), m: d.getUTCMonth() }; render(); break;
    }
    case 'cal-filter': ui.calFilter = el.dataset.id || null; render(); break;
    case 'goal-seg': ui.goalSeg = n('i'); render(); break;
    case 'toggle-ms': {
      const g = data.goals.find(x => x.id === el.dataset.g); const ms = g && g.milestones.find(x => x.id === el.dataset.m);
      if (ms) { ms.done = !ms.done; save(); } break;
    }
    case 'edit-habit': edit('habits', data.habits.find(x => x.id === el.dataset.id)); break;
    case 'edit-goal': edit('goals', data.goals.find(x => x.id === el.dataset.id)); break;
    case 'edit-date': edit('dates', data.dates.find(x => x.id === el.dataset.id)); break;
    case 'close': closeSheet(); break;
    case 'menu': openMenu(); break;
    case 'export': closeSheet(); exportData(); break;
    case 'import': closeSheet(); document.getElementById('import-file').click(); break;
    case 'install-help': closeSheet(); alert('En Safari: botón Compartir (cuadrado con flecha) → «Añadir a pantalla de inicio». Así Racha se abre a pantalla completa como una app y funciona sin conexión.'); break;
    // editor actions
    case 'd-emoji': draft.v.emoji = el.dataset.v; sheets[draft.list](); break;
    case 'd-color': draft.v.color = n('v'); habitSheet(); break;
    case 'd-freq': draft.v.freq = el.dataset.v; habitSheet(); break;
    case 'd-wd': case 'd-md': {
      const key = a === 'd-wd' ? 'weekDays' : 'monthDays'; const v = n('v'); const arr = draft.v[key];
      draft.v[key] = arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]; habitSheet(); break;
    }
    case 'd-switch': draft.v[el.dataset.f] = !draft.v[el.dataset.f]; sheets[draft.list](); break;
    case 'd-ms-add': addMilestone(); break;
    case 'd-ms-del': draft.v.milestones.splice(n('i'), 1); goalSheet(); break;
    case 'd-save': {
      if (draft.list === 'goals') addMilestone();
      const v = draft.v;
      if (draft.list === 'habits') { v.name = v.name.trim(); if (v.freq === 'DAILY') v.weekDays = [1, 2, 3, 4, 5, 6, 7]; }
      else { v.title = v.title.trim(); v.note = (v.note || '').trim(); }
      upsert(draft.list, v); closeSheet(); break;
    }
    case 'd-delete':
      if (confirm('¿Eliminar? Se borrará junto con todo su historial. No se puede deshacer.')) { remove(draft.list, draft.v.id); closeSheet(); }
      break;
  }
});

// Re-render when the app comes back (e.g. the next morning) so "today" is right.
let lastToday = todayEpoch();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || draft) return;
  const t = todayEpoch();
  if (t !== lastToday) { if (ui.todaySel === lastToday) ui.todaySel = t; if (ui.calSel === lastToday) ui.calSel = t; lastToday = t; }
  render();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
