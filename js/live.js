// Seen · live driving. The participant drives with a USB wheel + pedals plugged into the windscreen computer.
// That computer (the "host") runs the simulation with the real inputs and broadcasts the car and road users
// ~15 times a second. Every other screen (cluster, mirrors, wizard) shows that broadcast, smoothed between updates.

// ---------- wheel + pedals (Gamepad API) ----------
const PAD = { name: '', map: null, prevBtn: {}, analog: {} };
try { PAD.map = JSON.parse(localStorage.getItem('seen-pad-map') || 'null'); } catch (_) {}
const KB = {};
addEventListener('keydown', e => { KB[e.code] = true; if (window.__seenLiveHost && !e.repeat) { if (e.code === 'KeyQ' || e.code === 'Comma') toggleSig('L'); if (e.code === 'KeyE' || e.code === 'Period') toggleSig('R'); } });
addEventListener('keyup', e => { KB[e.code] = false; });
function toggleSig(sd){ LIVEIN.sig = LIVEIN.sig === sd ? null : sd; }
// Controls can be an axis or an analog button (PS4-style wheels report the pedals as L2/R2 triggers),
// and can live on a different device than the wheel (some pedal sets enumerate separately).
function pads(){ return navigator.getGamepads ? [...navigator.getGamepads()].filter(p => p && p.connected) : []; }
function getPad(id){ const ps = pads(); if (id) { const m = ps.find(p => p.id === id); if (m) return m; }
  if (PAD.map && PAD.map.id) { const m = ps.find(p => p.id === PAD.map.id); if (m) return m; }
  return ps.find(p => p.axes.length >= 2) || ps[0] || null; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rawVal(m){ const p = getPad(m.id); if (!p) return null; if (m.src === 'b') { const b = p.buttons[m.i]; return b ? b.value : null; } return p.axes[m.i] ?? null; }
function pedal(m){ if (!m) return 0; const v = rawVal(m); if (v === null) return 0; const span = m.full - m.rest; if (Math.abs(span) < 0.05) return 0; const x = clamp((v - m.rest) / span, 0, 1); return x < 0.04 ? 0 : x; }
function readInputs(){
  const p = getPad(); let g = 0, b = 0, w = 0; PAD.name = p ? p.id.replace(/\s*\(.*$/, '').slice(0, 40) : ''; PAD.old = !!(PAD.map && PAD.map.v !== 2);
  if (PAD.map) { const m = PAD.map;
    if (m.steer) { const v = rawVal(m.steer); if (v !== null) { w = clamp((v - m.steer.c) / (m.steer.h || 1), -1, 1); if (Math.abs(w) < 0.03) w = 0; } }
    g = pedal(m.gas); b = pedal(m.brake);
    ['sigL', 'sigR'].forEach(k => { const c = m[k]; if (c === undefined || c === null) return; const q = typeof c === 'object' ? getPad(c.id) : p, i = typeof c === 'object' ? c.i : c;
      if (!q || !q.buttons[i]) return; const key = q.id + '|' + i, bv = q.buttons[i].value;
      if (bv > 0.02 && bv < 0.98) PAD.analog[key] = true;
      if (PAD.analog[key] || (m.noSig || []).includes(key) || [m.gas, m.brake].some(x => x && x.src === 'b' && x.i === i && (x.id || q.id) === q.id)) return;
      const on = q.buttons[i].pressed; if (on && !PAD.prevBtn[k]) toggleSig(k === 'sigL' ? 'L' : 'R'); PAD.prevBtn[k] = on; });
  }
  if (KB.ArrowUp) g = Math.max(g, 0.7); if (KB.ArrowDown) b = Math.max(b, 0.8);
  if (KB.ArrowLeft) w = -0.6; if (KB.ArrowRight) w = 0.6;
  LIVEIN.gas = g; LIVEIN.brake = b; LIVEIN.wheel = w;
}
// every analog input on every connected device: [{key, id, src, i, v, label}]
function allInputs(){ const out = []; pads().forEach((p, pi) => {
  p.axes.forEach((v, i) => out.push({key: `${p.id}|a|${i}`, id: p.id, src: 'a', i, v, label: `${pads().length > 1 ? 'Device ' + (pi + 1) + ' · ' : ''}Axis ${i}`}));
  p.buttons.forEach((b, i) => out.push({key: `${p.id}|b|${i}`, id: p.id, src: 'b', i, v: b.value, label: `${pads().length > 1 ? 'Device ' + (pi + 1) + ' · ' : ''}Button ${i}${p.mapping === 'standard' && i === 6 ? ' (L2)' : p.mapping === 'standard' && i === 7 ? ' (R2)' : ''}`})); }); return out; }

// ---------- wheel setup (runs once per windscreen computer; saved in that browser) ----------
function startWheelSetup(checkOnly){
  let box = document.getElementById('padsetup'); if (box) box.remove();
  box = document.createElement('div'); box.id = 'padsetup'; document.body.appendChild(box);
  const steps = [
    {k: 'steer', t: 'Steering', d: 'Turn the wheel all the way LEFT first, then all the way right, then back to the centre. Then click Next (or press Enter).'},
    {k: 'gas', t: 'Accelerator', d: 'Press the accelerator all the way down, let it go, then click Next.'},
    {k: 'brake', t: 'Brake', d: 'Press the brake all the way down, let it go, then click Next.'},
    {k: 'sigL', t: 'Left indicator', d: 'Feet off the pedals. Press the button or paddle the driver will use for the LEFT indicator.', btn: true},
    {k: 'sigR', t: 'Right indicator', d: 'Press the button or paddle for the RIGHT indicator.', btn: true},
  ];
  const map = {}; let ix = 0, lo = {}, hi = {}, first = {}, firstDir = {}, samp = {}, startBtns = {}, axisBtns = new Set(), raf = 0, alive = true;
  const stop = () => { alive = false; cancelAnimationFrame(raf); removeEventListener('keydown', onKey); };
  const snapBtns = () => { const o = {}; pads().forEach(p => p.buttons.forEach((b, i) => o[p.id + '|' + i] = b.pressed)); return o; };
  const begin = i => { ix = i; firstDir = {}; samp = {}; if (ix >= steps.length) { finish(); return; } lo = {}; hi = {}; first = {}; allInputs().forEach(c => { lo[c.key] = hi[c.key] = c.v; first[c.key] = c.v; }); startBtns = snapBtns(); render(); };
  const usedKey = m => m ? `${m.id}|${m.src}|${m.i}` : '';
  const commitAxis = () => { const st = steps[ix], now = {}; allInputs().forEach(c => now[c.key] = c);
    let best = null, r = 0.15;
    Object.keys(lo).forEach(k => { const c = now[k]; if (!c) return; if (st.k === 'steer' && c.src === 'b') return; if (st.k !== 'steer' && k === usedKey(map.steer)) return;
      const range = hi[k] - lo[k]; if (range > r) { r = range; best = c; } });
    if (best) { const k = best.key, base = {id: best.id, src: best.src, i: best.i};
      if (st.k === 'steer') map.steer = Object.assign(base, {c: (lo[k] + hi[k]) / 2, h: (hi[k] - lo[k]) / 2 * (firstDir[k] > 0 ? -1 : 1)});
      else { const rg = hi[k] - lo[k], sp = samp[k] || []; const nl = sp.filter(v => v - lo[k] < rg * 0.15).length, nh = sp.filter(v => hi[k] - v < rg * 0.15).length; const restLo = nl !== nh ? nl > nh : Math.abs(best.v - lo[k]) < Math.abs(best.v - hi[k]); map[st.k] = Object.assign(base, {rest: restLo ? lo[k] : hi[k], full: restLo ? hi[k] : lo[k]}); } }
    else { const w = box.querySelector('#pslive'); if (w) { w.insertAdjacentHTML('afterbegin', '<p class="warn">Nothing moved enough. Press it all the way, then Next.</p>'); } return; }
    begin(ix + 1); };
  const bar = (l, v, mid) => `<div class="pb"><span>${l}</span><i><em style="${mid ? `left:${Math.min(v, .5) * 100}%;width:${Math.abs(v - .5) * 100}%` : `width:${v * 100}%`}"></em></i></div>`;
  const render = () => { const st = steps[ix];
    box.innerHTML = `<div class="ps"><small>Wheel setup · ${ix + 1} of ${steps.length}</small><b>${st.t}</b><p>${st.d}</p><div id="pslive"></div><div class="row"><button id="pscancel">Cancel</button><button id="psskip">${st.btn ? 'Skip · use keyboard Q / E' : 'Skip'}</button>${st.btn ? '' : '<button id="psnext" class="pri">Next</button>'}</div></div>`;
    box.querySelector('#pscancel').onclick = () => { stop(); box.remove(); };
    box.querySelector('#psskip').onclick = () => begin(ix + 1);
    const nx = box.querySelector('#psnext'); if (nx) nx.onclick = commitAxis; };
  const finish = () => { const p = getPad(map.steer && map.steer.id); map.id = p ? p.id : ''; map.v = 2; map.noSig = [...axisBtns]; PAD.map = map; try { localStorage.setItem('seen-pad-map', JSON.stringify(map)); } catch (_) {}
    box.innerHTML = `<div class="ps"><b>Wheel ready</b><p>Check that each bar moves the right way. If one doesn't, run the setup again.</p><div id="psbars"></div><div class="row" style="justify-content:flex-start"><button id="psfg">Flip accelerator</button><button id="psfb">Flip brake</button><button id="psfs">Flip steering</button></div><div class="row"><button id="psagain">Set up again</button><button id="psdone" class="pri">Done</button></div></div>`;
    const save = () => { try { localStorage.setItem('seen-pad-map', JSON.stringify(map)); } catch (_) {} }; const flip = m => { if (m) { const r = m.rest; m.rest = m.full; m.full = r; save(); } };
    box.querySelector('#psfg').onclick = () => flip(map.gas); box.querySelector('#psfb').onclick = () => flip(map.brake); box.querySelector('#psfs').onclick = () => { if (map.steer) { map.steer.h = -map.steer.h; save(); } };
    box.querySelector('#psagain').onclick = () => { stop(); startWheelSetup(); }; box.querySelector('#psdone').onclick = () => { stop(); box.remove(); }; };
  const watch = () => { if (!alive) return;
    const p = getPad(), el = box.querySelector('#pslive'), bars = box.querySelector('#psbars'), st = steps[ix];
    if (bars) { readInputs(); bars.innerHTML = bar('Steering', (LIVEIN.wheel + 1) / 2, true) + bar('Accelerator', LIVEIN.gas) + bar('Brake', LIVEIN.brake) + `<p>Indicator: <b>${LIVEIN.sig === 'L' ? '← left' : LIVEIN.sig === 'R' ? 'right →' : 'off'}</b></p>`; }
    else if (el) {
      if (!p) el.innerHTML = '<p class="warn">No wheel found. Plug it in, then press a pedal or button so the browser sees it.</p>';
      else if (!st.btn) { const all = allInputs(); pads().forEach(q => q.buttons.forEach((bb, i) => { if (bb.pressed || bb.value > 0.1) axisBtns.add(q.id + '|' + i); })); all.forEach(c => { lo[c.key] = Math.min(lo[c.key] ?? c.v, c.v); hi[c.key] = Math.max(hi[c.key] ?? c.v, c.v); if (!firstDir[c.key] && Math.abs(c.v - first[c.key]) > 0.4) firstDir[c.key] = Math.sign(c.v - first[c.key]); const sp = samp[c.key] || (samp[c.key] = []); if (sp.length < 900) sp.push(c.v); });
        const show = all.filter(c => c.src === 'a' || (hi[c.key] - lo[c.key]) > 0.05 || c.v > 0.05);
        el.innerHTML = `<p class="dim">${pads().map(p => p.id + (p.mapping ? ' · ' + p.mapping : '')).join('<br>')}</p>` + show.map(c => `<div class="pb"><span>${c.label}</span><i><em style="${c.src === 'b' ? `left:0;width:${c.v * 100}%` : `left:${(Math.min(c.v, 0) + 1) / 2 * 100}%;width:${Math.abs(c.v) / 2 * 100}%`}"></em></i></div>`).join(''); }
      else { el.innerHTML = '<p class="dim">Waiting for a button…</p>'; const pedalKeys = [...axisBtns, ...[map.gas, map.brake].filter(m => m && m.src === 'b').map(m => m.id + '|' + m.i)];
        let hit = null; pads().forEach(q => q.buttons.forEach((bb, i) => { const k = q.id + '|' + i; if (!hit && bb.pressed && !startBtns[k] && !pedalKeys.includes(k)) hit = {id: q.id, i}; }));
        if (hit && hit.i !== (map.sigL && map.sigL.i) ) { map[st.k] = hit; PAD.prevBtn[st.k] = true; begin(ix + 1); } }
    }
    raf = requestAnimationFrame(watch); };
  const onKey = e => { if (e.code === 'Enter' && steps[ix] && !steps[ix].btn && box.querySelector('#psnext')) commitAxis(); if (e.code === 'Escape') { stop(); box.remove(); } };
  addEventListener('keydown', onKey);
  if (checkOnly && PAD.map) { Object.assign(map, PAD.map); ix = steps.length; finish(); } else begin(0);
  raf = requestAnimationFrame(watch);
}

// ---------- host: pack the state and broadcast it ----------
let pubN = 0, lastPub = 0;
const r3 = x => Math.round((x || 0) * 1000) / 1000;
function liveKey(){ return [SESSION.preset, SESSION.epoch, SESSION.rev || 0].join('|'); }
function packLive(){
  const c = S.car;
  return {k: liveKey(), n: ++pubN, t: r3(S.t), pr: preset,
    c: [r3(c.x), r3(c.y), r3(c.v), r3(c.theta), r3(c.steer), c.brake ? 1 : 0, c.gas ? 1 : 0, c.sig || '', r3(c.blink), c.done ? 1 : 0],
    u: S.users.map(u => { const i = u.info || {}; return [u.id, u.kind, r3(u.x), r3(u.y), r3(u.vx), r3(u.vy), u.state || '', u.level || 0, r3(u.levelSince), r3(u.ledFade), i.inPath ? 1 : 0, i.react ? 1 : 0, i.why || '', i.bsd ? 1 : 0]; }),
    fs: S.failsafe ? [S.failsafe.u.id, r3(S.failsafe.t)] : 0, st: S.started ? 1 : 0, tb: S.turnBlock ? [r3(S.turnBlock.t), S.turnBlock.dir] : 0, rd: S.car.road ? [S.car.road.t, S.car.road.k, S.car.road.d] : 0, tr: S.car.turn ? [S.car.turn.to.t, S.car.turn.to.k, S.car.turn.to.d] : 0, p: S.primary ? S.primary.id : '', top: S.top || 0, pp: S.pedalPush ? 1 : 0, ls: r3(S.lastSlowSound), ll: S.lastLevel || 0,
    ev: EVQ.slice(-12).map(e => ({n: e.n, k: e.k, h: e.h || '', s: e.s || '', p: e.p || 0, t: e.t || 0})),
    inp: {g: r3(LIVEIN.gas), b: r3(LIVEIN.brake), w: r3(LIVEIN.wheel), sig: LIVEIN.sig || '', pad: PAD.name || '', map: PAD.map && !PAD.old ? 1 : 0}};
}
function maybePublish(force){ const now = performance.now(); if (!force && now - lastPub < 66) return; lastPub = now; try { Sync.publishLive(packLive()); } catch (e) { console.warn(e); } }

// ---------- followers: rebuild S from the latest broadcast, dead-reckoned to now ----------
let fKey = null, fLastEv = 0, fN = -1;
function unpackLive(L){
  const byId = {}; (S && S.users || []).forEach(u => byId[u.id] = u);
  if (!S) S = freshState(); const c = S.car, a = L.c;
  c.x = a[0]; c.y = a[1]; c.v = a[2]; c.theta = a[3]; c.steer = a[4]; c.brake = !!a[5]; c.gas = !!a[6]; c.sig = a[7] || null; c.blink = a[8]; c.done = !!a[9];
  S.t = L.t; preset = L.pr || preset;
  S.users = (L.u || []).map(q => { const u = byId[q[0]] || {}; Object.assign(u, {id: q[0], kind: q[1], x: q[2], y: q[3], vx: q[4], vy: q[5], state: q[6] || undefined, level: q[7], levelSince: q[8], ledFade: q[9]});
    u.info = {inPath: !!q[10], react: !!q[11], why: q[12] || '', bsd: !!q[13]}; return u; });
  const find = id => S.users.find(u => u.id === id) || null;
  S.failsafe = L.fs ? {u: find(L.fs[0]), t: L.fs[1]} : null; if (S.failsafe && !S.failsafe.u) S.failsafe = null;
  S.started = !!L.st; S.turnBlock = L.tb ? {t: L.tb[0], dir: L.tb[1]} : null; c.road = L.rd ? {t: L.rd[0], k: L.rd[1], d: L.rd[2]} : null; c.turn = L.tr ? {to: {t: L.tr[0], k: L.tr[1], d: L.tr[2]}, dir: 0} : null;
  S.primary = L.p ? find(L.p) : null; S.top = L.top || 0; S.pedalPush = !!L.pp; S.lastSlowSound = L.ls; S.lastLevel = L.ll;
}
function followLive(){
  const key = liveKey(), L = Sync.live;
  if (fKey !== key) { fKey = key; fN = -1; fLastEv = 0; load(SESSION.preset); if (window.onSeenReset) window.onSeenReset(); }
  if (!L || L.k !== key) { if (!S) load(SESSION.preset); S.users.forEach(u => { u.info = evalUser(S, u); }); return false; }
  if (L.n !== fN) { fN = L.n;
    (L.ev || []).forEach(e => { if (e.n <= fLastEv) return; fLastEv = e.n;
      if (e.k === 'log' && window.onSeenLog) window.onSeenLog(e.h, e.t);
      if (e.k === 'snd' && L.t - e.t < 1) sound(e.s, e.p); });
  }
  unpackLive(L);
  const dt = (SESSION.paused || !S.started) ? 0 : Math.min(0.3, (performance.now() - Sync.liveAt) / 1000), c = S.car;
  c.x += Math.sin(c.theta) * c.v * dt; c.y += Math.cos(c.theta) * c.v * dt; c.blink += dt; S.t += dt;
  S.users.forEach(u => { u.x += (u.vx || 0) * dt; u.y += (u.vy || 0) * dt; });
  S.users.forEach(u => { const r = rel(c, u); u.info.r = r; u.info.side = r.rx < 0 ? 'L' : 'R'; });
  return true;
}
