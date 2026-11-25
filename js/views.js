// Seen · one renderer per physical screen, all driven by the same simulation (core.js) and session (sync.js).
const SESSION_DEFAULT = {preset:'alongside', epoch:0, paused:true, pausedAt:0, overrides:[], env:'day', enc:'seen', sndIn:true, sndOut:false, fov:90, rev:0};

// ---------- session → simulation ----------
let simKey = null;
function applySession(st){
  SESSION = Object.assign({}, SESSION_DEFAULT, st || {});
  const o = SESSION.overrides; SESSION.overrides = Array.isArray(o) ? o : (o ? Object.values(o) : []);
  opts.env = SESSION.env; opts.enc = SESSION.enc;
}
function simTarget(){ return SESSION.paused ? (SESSION.pausedAt || 0) : Math.max(0, (Sync.now() - SESSION.epoch) / 1000); }
function advanceSim(){
  const target = simTarget();
  const key = [SESSION.preset, SESSION.epoch, SESSION.paused, SESSION.pausedAt, JSON.stringify(SESSION.overrides), SESSION.rev].join('|');
  if (key !== simKey || !S || S.t > target + 0.05) { const changed = key !== simKey; simKey = key; opts.auto = true; load(SESSION.preset); if (changed && window.onSeenReset) window.onSeenReset(); }
  SILENT = (target - S.t) > 0.4; let n = 0;
  while (S.t + 1/120 < target && n < 4000) { step(1/60); n++; }
  SILENT = false;
}

// ---------- 3D helpers ----------
let rSize = [0, 0];
function update3D(){
  const st = st3(); if (!st) return null; const c = S.car;
  st.setEnv(opts.env); st.zebras.forEach(z => z.visible = (preset === 'pedYield'));
  const list = []; if (preset !== 'carBike') for (let y = Math.floor((c.y - 20) / 6.5) * 6.5; y < c.y + 110; y += 6.5) { if (Math.abs(y - 43) < 4 && preset === 'pedYield') continue; list.push({x: 2.55, y}); }
  st.setParked(list);
  const cars = S.users.filter(u => u.kind === 'car'); while (st.movers.length < cars.length) { const m = st.makeCar(0x4b4e58); st.scene.add(m); st.movers.push(m); }
  st.movers.forEach((m, i) => { const u = cars[i]; m.visible = !!u; if (u) { m.position.set(u.x, 0, -u.y); m.rotation.y = -Math.atan2(u.vx || 0, u.vy || 1); } });
  st.setFocus(c.x + Math.sin(c.theta) * 18, c.y + Math.cos(c.theta) * 18);
  st.renderer.shadowMap.autoUpdate = false; st.renderer.shadowMap.needsUpdate = true;
  return st;
}
function renderInto(st, cam, W, H){
  const R = st.renderer;
  if (W > rSize[0] || H > rSize[1]) { rSize = [Math.max(W, rSize[0]), Math.max(H, rSize[1])]; R.setSize(rSize[0], rSize[1], false); }
  R.setScissorTest(true); R.setViewport(0, 0, W, H); R.setScissor(0, 0, W, H); R.render(st.scene, cam); R.setScissorTest(false);
  return {cv: R.domElement, sx: 0, sy: rSize[1] - H};
}
function renderMirror(side, W, H){
  const st = st3(); if (!st) return; const mc = mirCam[side], img = mirImg[side];
  if (img.width !== W || img.height !== H) { img.width = W; img.height = H; }
  mc.aspect = W / H; mc.fov = 30; mc.updateProjectionMatrix();
  const c = S.car, sd = side === 'L' ? -1 : 1; const [mx, my] = carPose(c, sd * 1.02, 0.55); const [tx, ty] = carPose(c, sd * 1.02 + sd * 0.22 * 20, 0.55 - 20);
  mc.position.set(mx, 1.05, -my); mc.lookAt(tx, 0.9, -ty);
  const r = renderInto(st, mc, W, H); const g = img.getContext('2d'); g.save(); g.translate(W, 0); g.scale(-1, 1); g.drawImage(r.cv, r.sx, r.sy, W, H, 0, 0, W, H); g.restore();
}

// ---------- windscreen (monitor) ----------
function drawWindscreen(cv, maxW){
  const {ctx, w, h} = fit(cv); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  const st = update3D();
  if (!st) { ctx.fillStyle = '#ddd'; ctx.font = `600 16px ${FONT}`; ctx.fillText('3D is not available on this device (WebGL is off).', 24, 40); return; }
  const W = Math.max(320, Math.min(cv.width, maxW || 1920)), H = Math.max(160, Math.round(W * h / w));
  const f = W / 2 / Math.tan((SESSION.fov || 90) * Math.PI / 360);
  st.setPinhole(W, H, f, W / 2, H * 0.44);
  const c = S.car, fx = Math.sin(c.theta), fy = Math.cos(c.theta);
  st.camera.position.set(c.x - fx * 0.2, 1.25, -(c.y - fy * 0.2)); st.camera.lookAt(c.x + fx * 10, 1.25, -(c.y + fy * 10));
  const r = renderInto(st, st.camera, W, H); ctx.drawImage(r.cv, r.sx, r.sy, W, H, 0, 0, w, h);
  const its = []; S.users.forEach(u => { if (u.kind === 'car') return; const rl = rel(c, u); if (rl.ry < 0.8) return;
    const b = st.project(u.x, u.y, 0, w, h), tp = st.project(u.x, u.y, 1.9, w, h); if (b[2] > 1) return;
    its.push({d: rl.ry, f: () => rider(ctx, b[0], b[1], Math.abs(b[1] - tp[1]), u.kind, 1, 0, opts.env === 'night' ? '#D9D7E0' : '#24242A')}); });
  its.sort((a, b) => b.d - a.d).forEach(i => i.f());
  if (opts.env === 'rain') { ctx.fillStyle = 'rgba(225,235,250,.3)'; for (let i = 0; i < 140; i++) { const x = (i * 211.7) % w, y = (i * 97.3 + S.t * (25 + (i % 5) * 12) * (h / 600)) % h; ctx.beginPath(); ctx.arc(x, y, (2 + (i % 4)) * w / 1600, 0, 7); ctx.fill(); } }
}

// ---------- shared drawing in cockpit-photo units (2576 × 1288) ----------
const MGEOM = {L: {gx: 28, gy: 391, gw: 172, gh: 164, real: [62, 20, 26, 46]}, R: {gx: 2377, gy: 393, gw: 172, gh: 162, real: [20, 62, 46, 26]}}, CUER = [20, 62, 46, 26];
function Gof(ctx, sd){ const m = MGEOM[sd]; return {gx: m.gx, gy: m.gy, gw: m.gw, gh: m.gh, radii: CUER,
  glassPath: () => { ctx.beginPath(); ctx.roundRect(m.gx, m.gy, m.gw, m.gh, m.real); }, cuePath: () => { ctx.beginPath(); ctx.roundRect(m.gx, m.gy, m.gw, m.gh, CUER); }}; }
function cropDraw(cv, R, fn){
  const {ctx, w, h} = fit(cv); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  const sc = Math.min(w / R.w, h / R.h), ox = (w - R.w * sc) / 2, oy = (h - R.h * sc) / 2;
  ctx.save(); ctx.translate(ox, oy); ctx.scale(sc, sc); ctx.beginPath(); ctx.rect(0, 0, R.w, R.h); ctx.clip(); ctx.translate(-R.x, -R.y); fn(ctx, sc); ctx.restore();
  return {sc, ox, oy};
}
function drawNav(ctx){ const c = S.car;
  ctx.save(); ctx.translate(1078, 522); ctx.scale(384 / 376, 177 / 180); ctx.translate(-1092, -526);
  ctx.save(); rr(ctx, 1092, 526, 376, 180, 12); ctx.clip(); ctx.fillStyle = '#12141A'; ctx.fillRect(1092, 526, 376, 180);
  ctx.fillStyle = '#F2F2F6'; ctx.font = `700 34px ${FONT}`; ctx.textAlign = 'left';
  const turned = c.theta < -0.8, dist = turned ? '400 m' : Math.max(0, Math.round((SIDE_STREET.y0 - c.y) / 10) * 10) + ' m';
  ctx.fillText((turned ? '↑ ' : '↰ ') + dist, 1116, 580);
  ctx.fillStyle = '#A9A9B6'; ctx.font = `500 22px ${FONT}`; ctx.fillText(turned ? 'Corso Magenta' : 'Via Dante', 1118, 612);
  ctx.strokeStyle = '#5B6070'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(1300, 690); ctx.lineTo(1300, 620); ctx.lineTo(turned ? 1300 : 1250, turned ? 560 : 600); ctx.stroke();
  ctx.strokeStyle = SEEN_HI; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(1300, 690); ctx.lineTo(1300, 650); ctx.stroke(); ctx.fillStyle = SEEN_HI; ctx.beginPath(); ctx.arc(1300, 690, 7, 0, 7); ctx.fill();
  ctx.fillStyle = '#F2F2F6'; ctx.font = `600 18px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText('8:30', 1452, 550); ctx.restore(); ctx.restore(); }
function drawCluster(ctx){ ctx.save(); ctx.beginPath(); ctx.roundRect(698, 554, 307, 131, 24); ctx.clip(); ctx.fillStyle = '#050507'; ctx.fillRect(698, 554, 307, 131);
  const ar = (panelCv.width / panelCv.height) || 2.385; let pw = 307, ph = pw / ar; if (ph > 131) { ph = 131; pw = ph * ar; } try { ctx.drawImage(panelCv, 698 + (307 - pw) / 2, 554 + (131 - ph) / 2, pw, ph); } catch (_) {} ctx.restore(); }

// ---------- dashboard (cluster + centre screen in the real dash) ----------
const DASH = {wide: {x: 400, y: 455, w: 1790, h: 360}, tight: {x: 640, y: 492, w: 860, h: 250}};
function drawDashboard(cv, crop){ drawPanel();
  cropDraw(cv, DASH[crop] || DASH.wide, ctx => { const ck = cockpitImg(); if (ck) ctx.drawImage(ck, 0, 0, 2576, 1288); drawNav(ctx); drawCluster(ctx); }); }

// ---------- side mirror (housing photo + live glass + Seen cue) ----------
const MREG = {L: {x: 0, y: 330, w: 330, h: 290}, R: {x: 2246, y: 330, w: 330, h: 290}};
function drawMirrorScreen(cv, side, maxW){
  const e = ENV[opts.env], R = MREG[side];
  const sc0 = Math.min(cv.width / R.w, cv.height / R.h); const W = Math.max(160, Math.min(maxW || 900, Math.round(MGEOM[side].gw * sc0))), H = Math.round(W * MGEOM[side].gh / MGEOM[side].gw);
  if (update3D()) renderMirror(side, W, H);
  cropDraw(cv, R, ctx => {
    const g = ctx.createLinearGradient(0, R.y, 0, R.y + R.h); g.addColorStop(0, e.sky[1]); g.addColorStop(0.55, e.trees); g.addColorStop(1, e.road); ctx.fillStyle = g; ctx.fillRect(R.x, R.y, R.w, R.h);
    const G = Gof(ctx, side); povMirror(ctx, side, G, e, S.t, 'content');
    const ck = cockpitImg(); if (ck) ctx.drawImage(ck, 0, 0, 2576, 1288);
    povMirror(ctx, side, G, e, S.t, 'cue'); });
}

// ---------- display page boot ----------
function bootDisplay(role, draw){
  const q = new URLSearchParams(location.search); const room = q.get('room') || 'booth';
  window.SEEN_ROLE = role;
  const badge = document.getElementById('badge'), tap = document.getElementById('tap');
  Sync.connect(room).then(() => Sync.presence(role));
  Sync.onState(st => { applySession(st); });
  Sync.onStatus(m => { if (badge) { badge.textContent = `${role} · room ${room} · ${m === 'local' ? 'this computer only' : m}`; badge.dataset.mode = m; } });
  let audioOK = false;
  tap.addEventListener('click', async () => {
    if (role === 'dashboard') { ensureAudio(); audioOK = true; }
    try { await document.documentElement.requestFullscreen(); } catch (_) {}
    try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch (_) {}
    tap.hidden = true; setTimeout(() => badge && badge.classList.add('fade'), 4000);
  });
  addEventListener('dblclick', () => { tap.hidden = false; badge && badge.classList.remove('fade'); });
  function frame(){ opts.sndIn = audioOK && SESSION.sndIn; opts.sndOut = audioOK && SESSION.sndOut;
    advanceSim(); draw(); requestAnimationFrame(frame); }
  applySession(null); requestAnimationFrame(frame);
}
