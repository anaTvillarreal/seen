// Seen · wizard console. This page owns the session; every screen in the room follows it.
window.__seenController = true;
const $ = id => document.getElementById(id);
const room = (new URLSearchParams(location.search).get('room') || 'booth');
let CS = Object.assign({}, SESSION_DEFAULT);
const LVL_NAMES = ['Baseline', 'Aware', 'Caution', 'Urgent', 'Failsafe'];

function publish(){ Sync.publish(CS); }
Sync.connect(room).then(() => { $('roomName').textContent = Sync.room; Sync.presence('control'); buildLinks(); setTimeout(() => { if (!Sync.state) publish(); }, 1500); });
Sync.onState(st => { if (st) { CS = Object.assign({}, SESSION_DEFAULT, st); CS.overrides = arr(CS.overrides); CS.spawns = arr(CS.spawns); } applySession(CS); refreshUI(); });
Sync.onStatus(m => { const c = $('conn'); c.textContent = m === 'online' ? 'Synced online (Firebase)' : m === 'local' ? 'This computer only · add Firebase to sync devices' : m === 'offline' ? 'Offline · reconnecting' : 'Connecting…'; c.className = 'chip' + (m === 'online' ? ' on' : m === 'connecting' ? '' : ' warn'); });
const ROLES = [['windscreen', 'Windscreen'], ['dashboard', 'Cluster'], ['mirror-L', 'Mirror L'], ['mirror-R', 'Mirror R']];
Sync.onDevices(d => { const have = new Set(Object.values(d || {}).map(x => x.role)); $('devs').innerHTML = ROLES.map(([k, l]) => `<span class="chip ${have.has(k) ? 'on' : ''}"><i></i>${l}</span>`).join(''); });

// ---------- actions ----------
function currentOverride(){ const o = CS.overrides || []; return o.length ? o[o.length - 1].level : -1; }
function play(){ if (CS.paused) { CS.epoch = Sync.now() - (CS.pausedAt || 0) * 1000; CS.paused = false; } else { CS.pausedAt = +simTarget().toFixed(3); CS.paused = true; } publish(); }
function restart(){ CS.epoch = Sync.now(); CS.paused = false; CS.pausedAt = 0; CS.overrides = []; CS.spawns = []; publish(); }
function choose(p){ CS.preset = p; CS.epoch = Sync.now(); CS.paused = true; CS.pausedAt = 0; CS.overrides = []; CS.spawns = []; publish(); }
function setDrive(d){ CS.drive = d; choose(CS.preset); }
function spawn(type){ CS.spawns = [...(CS.spawns || []), {t: +simTarget().toFixed(3), type, seed: Math.floor(Math.random() * 1e9)}]; publish(); }
function force(n){ CS.overrides = [...(CS.overrides || []), {t: +simTarget().toFixed(3), level: n}]; publish(); }
$('play').onclick = play; $('restart').onclick = restart;
document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => choose(b.dataset.preset));
document.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => force(+b.dataset.lv));
document.querySelectorAll('[data-drive]').forEach(b => b.onclick = () => setDrive(b.dataset.drive));
document.querySelectorAll('[data-route]').forEach(b => b.onclick = () => { CS.route = b.dataset.route; publish(); });
document.querySelectorAll('[data-spawn]').forEach(b => b.onclick = () => spawn(b.dataset.spawn));
document.querySelectorAll('[data-env]').forEach(b => b.onclick = () => { CS.env = b.dataset.env; publish(); });
document.querySelectorAll('[data-enc]').forEach(b => b.onclick = () => { CS.enc = b.dataset.enc; publish(); });
$('sndIn').onclick = () => { CS.sndIn = !CS.sndIn; publish(); };
$('sndOut').onclick = () => { CS.sndOut = !CS.sndOut; publish(); };
$('fov').oninput = e => { CS.fov = +e.target.value; $('fovV').textContent = CS.fov + '°'; publish(); };
addEventListener('keydown', e => {
  if (e.target.closest('input,textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); play(); }
  else if (e.key === 'r' || e.key === 'R') restart();
  else if ('01234'.includes(e.key) && e.key.length === 1) force(+e.key);
  else if (e.key === 'a' || e.key === 'A') force(-1);
  else if (e.key === 'c' || e.key === 'C') spawn('cycBehindL');
  else if (e.key === 'v' || e.key === 'V') spawn('cycBehindR');
  else if (e.key === 'p' || e.key === 'P') spawn('pedRand');
});

function refreshUI(){
  const set = (sel, attr, v) => document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(v))));
  set('[data-preset]', 'preset', CS.preset); set('[data-drive]', 'drive', CS.drive || 'script'); set('[data-route]', 'route', CS.route || 'L'); $('liveBox').hidden = CS.drive !== 'live'; set('[data-env]', 'env', CS.env); set('[data-enc]', 'enc', CS.enc); set('[data-lv]', 'lv', currentOverride());
  $('sndIn').setAttribute('aria-pressed', String(!!CS.sndIn)); $('sndOut').setAttribute('aria-pressed', String(!!CS.sndOut));
  $('fov').value = CS.fov || 90; $('fovV').textContent = (CS.fov || 90) + '°';
  $('play').textContent = CS.paused ? ((CS.pausedAt || 0) > 0 ? 'Resume' : 'Start') : 'Pause';
  $('runState').textContent = CS.paused ? ((CS.pausedAt || 0) > 0 ? 'Paused' : 'Ready') : 'Running';
}

// ---------- screen links ----------
function buildLinks(){
  const base = location.href.replace(/control\.html.*$/, '').replace(/\?.*$/, '');
  const r = encodeURIComponent(Sync.room);
  const L = [['Windscreen · monitor', `windscreen.html?room=${r}`], ['Instrument cluster', `dashboard.html?room=${r}`], ['Mirror left · iPad', `mirror.html?room=${r}&side=L`], ['Mirror right · iPad', `mirror.html?room=${r}&side=R`]];
  $('links').innerHTML = L.map(([n, u], i) => `<b>${n}</b><code>${base}${u}</code><button data-copy="${i}">Copy</button><button data-open="${i}">Open</button>`).join('');
  $('links').querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { const u = base + L[+b.dataset.copy][1]; try { await navigator.clipboard.writeText(u); b.textContent = 'Copied'; } catch (_) { b.textContent = 'Select it'; } setTimeout(() => b.textContent = 'Copy', 1400); });
  $('links').querySelectorAll('[data-open]').forEach(b => b.onclick = () => window.open(base + L[+b.dataset.open][1], '_blank'));
}

// ---------- log + logic ----------
window.onSeenLog = (html, t) => { const li = document.createElement('li'); li.innerHTML = `${t.toFixed(1)}s · ${html}`; $('log').prepend(li); while ($('log').children.length > 40) $('log').lastChild.remove(); };
window.onSeenReset = () => { $('log').innerHTML = ''; };
function drawLogicTable(){
  $('logic').innerHTML = S.users.map(u => { if (!u.info) return ''; const r = u.info.r; const lv = (S.failsafe && S.failsafe.u === u) ? 4 : u.level;
    const where = `${Math.abs(r.ry) < 1 ? 'beside' : (r.ry > 0 ? Math.round(r.ry) + ' m ahead' : Math.round(-r.ry) + ' m behind')}, ${r.rx < 0 ? 'left' : 'right'}`;
    if (u.kind === 'car') return `<tr><td>car</td><td>${where}</td><td>–</td><td>–</td><td><span class="lvl">${u.info.bsd ? 'Blind-spot light' : 'not Seen'}</span></td></tr>`;
    return `<tr><td>${u.kind}</td><td>${where}</td><td>${u.info.inPath ? 'yes' : 'no'}</td><td>${u.info.react ? 'yes' : 'no'}</td><td><span class="lvl l${lv}">${LVL_NAMES[lv]}</span></td></tr>`; }).join('') || '<tr><td colspan="5" style="color:var(--muted)">No road users detected</td></tr>';
}

// ---------- live driving gauges ----------
function drawGauges(){ if (CS.drive !== 'live') return; const L = Sync.live, ok = L && L.k === liveKey();
  const age = ok ? (performance.now() - Sync.liveAt) / 1000 : 99;
  $('liveStat').innerHTML = !ok ? 'Waiting for the windscreen computer… Open the windscreen link there and plug the wheel into it.'
    : age > 2 ? `<span style="color:var(--warn)">Windscreen stopped sending ${Math.round(age)} s ago. Is its tab still open and in front?</span>`
    : L.inp.pad ? `Wheel: <b>${L.inp.pad}</b>${L.inp.map ? '' : ' · <span style="color:var(--warn)">not set up yet (Shift+W on the windscreen)</span>'}` : '<span style="color:var(--warn)">No wheel found on the windscreen computer.</span> Keyboard there: arrows to drive, Q / E indicators.';
  const i = ok ? L.inp : {g: 0, b: 0, w: 0, sig: ''}; const pct = v => Math.round(v * 100);
  const bar = (l, v, mid, val) => `<span>${l}</span><i><em style="${mid ? `left:${Math.min(v, .5) * 100}%;width:${Math.abs(v - .5) * 100}%` : `width:${v * 100}%`}"></em></i><b>${val}</b>`;
  $('gauges').innerHTML = bar('Steering', (i.w + 1) / 2, true, (i.w > 0 ? '+' : '') + pct(i.w)) + bar('Accelerator', i.g, false, pct(i.g) + '%') + bar('Brake', i.b, false, pct(i.b) + '%')
    + `<span>Speed</span><span>${i.sig === 'L' ? '◀ indicator' : i.sig === 'R' ? 'indicator ▶' : ''}</span><b>${Math.round(S.car.v * 3.6)} km/h</b>`; }

// ---------- loop ----------
let lastUi = 0;
function frame(now){
  opts.sndIn = false; opts.sndOut = false;
  advanceSim();
  drawWindscreen($('pvWs'), 900);
  drawMirrorScreen($('pvL'), 'L', 320); drawClusterScreen($('pvD')); drawMirrorScreen($('pvR'), 'R', 320);
  drawTop();
  $('clock').textContent = S.t.toFixed(1) + ' s';
  if (now - lastUi > 200) { lastUi = now; const st = conceptState(); const ov = currentOverride();
    $('stateDesc').innerHTML = `<b>${st.label}</b>${ov >= 0 ? ' · forced by wizard' : ''}<br>${st.desc}`; drawLogicTable(); drawGauges(); }
  requestAnimationFrame(frame);
}
applySession(CS); refreshUI(); requestAnimationFrame(frame);
