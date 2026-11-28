// Seen · session sync. Firebase Realtime Database when js/config.js has a config,
// otherwise BroadcastChannel (all screens as tabs/windows on ONE computer — good for rehearsing).
window.Sync = (function(){
  const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const id = Math.random().toString(36).slice(2,9);
  let mode = 'connecting', room = 'booth', offset = 0, state = null, fb = null, bc = null, live = null, liveAt = 0;
  const stateCbs = [], devCbs = [], statusCbs = []; let devices = {};
  const gotLive = v => { live = v; liveAt = performance.now(); };
  const emit = () => stateCbs.forEach(cb => cb(state));
  const emitDev = () => devCbs.forEach(cb => cb(devices));
  const setMode = m => { mode = m; statusCbs.forEach(cb => cb(mode)); };

  async function connect(r){
    room = (r || 'booth').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'booth';
    const cfg = window.SEEN_FIREBASE;
    if (cfg && cfg.databaseURL) {
      try {
        const app = await import(FB + 'firebase-app.js');
        const d = await import(FB + 'firebase-database.js');
        const a = app.initializeApp(cfg, 'seen');
        const db = d.getDatabase(a);
        fb = { d, db };
        d.onValue(d.ref(db, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });
        d.onValue(d.ref(db, '.info/connected'), s => setMode(s.val() ? 'online' : 'offline'));
        d.onValue(d.ref(db, `rooms/${room}/state`), s => { state = s.val(); emit(); });
        d.onValue(d.ref(db, `rooms/${room}/devices`), s => { devices = s.val() || {}; emitDev(); });
        if (!window.__seenLiveHost) d.onValue(d.ref(db, `rooms/${room}/live`), s => gotLive(s.val()));
        return;
      } catch (e) { console.warn('Firebase unavailable, using this-computer mode', e); }
    }
    // local fallback
    bc = new BroadcastChannel('seen-' + room);
    bc.onmessage = e => {
      const m = e.data || {};
      if (m.type === 'state') { state = m.state; emit(); }
      if (m.type === 'live' && !window.__seenLiveHost) gotLive(m.live);
      if (m.type === 'hb') { devices[m.id] = { role: m.role, at: Date.now() }; emitDev(); }
      if (m.type === 'hello' && state && window.__seenController) bc.postMessage({ type: 'state', state });
    };
    try { const saved = localStorage.getItem('seen-' + room); if (saved) state = JSON.parse(saved); } catch (_) {}
    setMode('local'); emit(); bc.postMessage({ type: 'hello' });
    setInterval(() => { const now = Date.now(); let ch = false; for (const k in devices) if (now - devices[k].at > 6000) { delete devices[k]; ch = true; } if (ch) emitDev(); }, 2000);
  }

  function publish(st){
    state = JSON.parse(JSON.stringify(st));
    if (fb) fb.d.set(fb.d.ref(fb.db, `rooms/${room}/state`), state);
    else if (bc) { bc.postMessage({ type: 'state', state }); try { localStorage.setItem('seen-' + room, JSON.stringify(state)); } catch (_) {} }
    emit();
  }

  // Live car state from the windscreen computer (participant driving), ~15 times a second.
  function publishLive(o){
    if (fb) fb.d.set(fb.d.ref(fb.db, `rooms/${room}/live`), o);
    else if (bc) bc.postMessage({ type: 'live', live: o });
  }

  function presence(role){
    if (fb) {
      const r = fb.d.ref(fb.db, `rooms/${room}/devices/${id}`);
      fb.d.set(r, { role, at: fb.d.serverTimestamp(), ua: navigator.userAgent.slice(0, 60) });
      fb.d.onDisconnect(r).remove();
    } else if (bc) {
      const hb = () => bc.postMessage({ type: 'hb', id, role }); hb(); setInterval(hb, 2000);
    }
  }

  return {
    connect, publish, presence, publishLive,
    get live(){ return live; }, get liveAt(){ return liveAt; },
    now: () => Date.now() + offset,
    get mode(){ return mode; }, get room(){ return room; }, get state(){ return state; },
    onState: cb => { stateCbs.push(cb); if (state) cb(state); },
    onDevices: cb => { devCbs.push(cb); cb(devices); },
    onStatus: cb => { statusCbs.push(cb); cb(mode); },
  };
})();
