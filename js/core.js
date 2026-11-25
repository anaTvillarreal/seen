// Seen · shared simulation + drawing core (extracted from the Seen Simulator).
// Globals: S (sim state), opts, preset, SESSION, step(), load(), draw helpers.
let SESSION={preset:'alongside', epoch:0, paused:true, pausedAt:0, overrides:[], env:'day', enc:'seen', sndIn:true, sndOut:false};
function wizForce(t){ const o=SESSION.overrides||[]; let v=null; for(const e of o){ if(e.t<=t+1e-6) v=(e.level===undefined||e.level===-1)?null:e.level; } return v; }
// ---------- constants ----------
const LEVELS = ['Baseline','Aware','Caution','Urgent','Failsafe'];
const LANE = {bikeL:-3.6, bikeR:-2.1, carR:1.6, parkR:3.4, walkL:-6.5, walkR:6.5};
const SIDE_STREET = {y0:46, y1:54};
const CAR_L = 4.4, CAR_W = 1.85;

// ---------- state ----------
let S, keys = {}, opts = {enc:'seen', env:'night', sndIn:false, sndOut:false, auto:true, paused:false}, preset = 'alongside';
function pushLog(html){ if(window.onSeenLog) window.onSeenLog(html, S?S.t:0); }
let SILENT=false;

function freshState(){
  return {t:0, car:{x:-0.2,y:0,v:5.5,theta:0,steer:0,brake:false,gas:false,sig:null,blink:0,vHist:[]},
          users:[], failsafe:null, msgHold:0, lastSlowSound:-9, lastLevel:0, pedalPush:false, events:[]};
}

const PRESETS = {
  alongside:{ init(s){ s.car.v=5.4; addCyclist(s,-9,6.3); }, script(s){ return {}; } },
  turnNo:{ init(s){ s.car.v=5.4; addCyclist(s,-11,6.6); },
    script(s){ const o={}; if(s.t>2.2 && s.car.y<SIDE_STREET.y1) o.sig='L';
      if(s.car.y>SIDE_STREET.y0-3.5 && s.car.theta>-1.45) o.steer=-1; return o; } },
  turnYes:{ init(s){ s.car.v=5.4; addCyclist(s,-11,6.6); },
    script(s){ const o={}; if(s.t>2.2 && s.car.y<SIDE_STREET.y1) o.sig='L';
      const cyc=s.users.find(u=>u.kind==='cyclist');
      if(cyc && cyc.level>=2 && cyc.levelSince>0.9 && !s._yielded) { s._braking=true; }
      if(s._braking){ o.brake=true; if(s.car.v<1.2){ s._braking=false; s._yielded=true; } }
      if(s._yielded){ const r=rel(s.car,cyc); if(r.ry>6 || r.ry<-12){ if(s.car.y>SIDE_STREET.y0-3.5 && s.car.theta>-1.45) o.steer=-1; o.gas=s.car.v<4; } else o.hold=true; }
      else if(s.car.y>SIDE_STREET.y0-3.5 && s.car.theta>-1.45 && !s._braking) o.steer=-1;
      return o; } },
  pedOut:{ init(s){ s.car.v=8.3; s.car.y=0; s.spawnPed={at:2.0, ahead:17, speed:1.5}; }, script(s){ return {}; } },
  pedYield:{ init(s){ s.car.v=7.5; addPed(s, 42, 2.9, 0, 'waiting'); },
    script(s){ const o={}; const p=s.users.find(u=>u.kind==='pedestrian'); if(!p) return o; const r=rel(s.car,p);
      if(p.state==='walking' && p.x<-3.9){ o.gas = s.car.v<7; return o; }
      if(p.state==='walking'){ o.brake=true; o.hold=true; return o; }
      if(p.state==='waiting' && r.ry>0 && r.ry<30){ const need = s.car.v*s.car.v/(2*Math.max(r.ry-4,0.5)); if(need>0.9) o.brake=true; else o.coast=true; }
      return o; } },
  both:{ init(s){ s.car.v=6.0; addCyclist(s,-8,6.6); s.spawnPed={at:3.0, ahead:19, speed:1.5}; }, script(s){ return {}; } },
  carBike:{ init(s){ s.car.v=5.4; addCyclist(s,-11,6.6); addCar(s,-26,8.6); }, script(s){ return {}; } },
  explore:{ init(s){ s.car.v=0; addCyclist(s,-3.6,0); }, script(s){ return {}; } },
};

function addCyclist(s, dy, v){ s.users.push({id:'C'+s.users.length, kind:'cyclist', x:-2.85, y:s.car.y+dy, vx:0, vy:v, level:0, shown:0, levelSince:0, ledFade:0}); }
let forcedLevel=1;
function addCar(s, dy, v){ s.users.push({id:'V'+s.users.length, kind:'car', x:2.55, y:s.car.y+dy, vx:0, vy:v, level:0, shown:0, levelSince:0, ledFade:0}); }
function addPed(s, y, x, vx, state){ s.users.push({id:'P'+s.users.length, kind:'pedestrian', x, y, vx, vy:0, state:state||'walking', level:0, shown:0, levelSince:0, ledFade:0}); }

function load(name){ preset = name; S = freshState(); PRESETS[name].init(S); panelAnim={icon:0, crit:0, speedX:0.5}; }

// ---------- geometry ----------
function rel(car,u){ const dx=u.x-car.x, dy=u.y-car.y, c=Math.cos(car.theta), s=Math.sin(car.theta);
  return {rx: dx*c - dy*s, ry: dx*s + dy*c}; }
function relVel(car,u){ const c=Math.cos(car.theta), s=Math.sin(car.theta);
  const vx=u.vx - Math.sin(car.theta)*car.v, vy=u.vy - Math.cos(car.theta)*car.v; return {vrx: vx*c - vy*s, vry: vx*s + vy*c}; }

// ---------- relevance ----------
function reacting(s, side){
  const c=s.car; const h=c.vHist; const slowing = h.length>10 && (h[0]-c.v) > 0.5;
  const steerAway = side && ((side==='L' && c.steer>0) || (side==='R' && c.steer<0));
  return c.brake || slowing || steerAway;
}
function evalUser(s,u){
  if(u.kind==='car'){ const r=rel(s.car,u); return {r, side:r.rx<0?'L':'R', inPath:false, react:false, target:0, why:'', bsd: Math.abs(r.rx)>1 && Math.abs(r.rx)<4.6 && r.ry>-9 && r.ry<1.8}; }
  const c=s.car, r=rel(c,u), side = r.rx<0?'L':'R';
  const info={r, side, inPath:false, react:false, target:0, why:''};
  if(u.kind==='cyclist'){
    const inZone = Math.abs(r.rx)<3.8 && r.ry>-8 && r.ry<5;
    const approaching = Math.abs(r.rx)<3.8 && r.ry>-16 && r.ry<=-8;
    const turningToward = (side==='L' && c.theta<-0.06) || (side==='R' && c.theta>0.06);
    const intent = c.sig===side || (side==='L'?c.steer<0:c.steer>0) || turningToward;
    info.inPath = intent; info.react = reacting(s, side);
    if(inZone){ info.target=1; info.why='alongside'; }
    if((inZone||approaching) && intent){ info.target=2; info.why='your next move crosses them'; }
    if(info.target===2 && !info.react){
      const close = Math.abs(r.ry)<4.5 && Math.abs(r.rx)<3.2;
      if((u.level>=2 && u.levelSince>2.2 && close) || (turningToward && Math.abs(c.theta)>0.25 && close)){ info.target=3; info.why='collision risk, no reaction'; }
    }
    if(info.react && info.target>=2){ info.target=1; info.why='driver is reacting'; }
    // failsafe: predicted overlap within 1 s
    const vr=relVel(c,u); for(let k=0;k<=10;k++){ const tt=k*0.1, px=r.rx+vr.vrx*tt, py=r.ry+vr.vry*tt;
      if(Math.abs(px)<CAR_W/2+0.45 && Math.abs(py)<CAR_L/2+0.5 && c.v>0.6 && Math.abs(c.theta)>0.08){ info.fail=true; break; } }
  } else {
    const vr=relVel(c,u);
    if(r.ry>-2 && r.ry<34){
      const ttc = Math.max(r.ry-CAR_L/2,0)/Math.max(c.v,0.3);
      const pred = r.rx + vr.vrx*Math.min(ttc,4);
      info.inPath = Math.abs(r.rx)<1.6 || (Math.abs(pred)<1.8 && u.state!=='waiting') || (u.state==='waiting' && Math.abs(r.rx)<3.6);
      info.react = reacting(s,null); info.ttc=ttc;
      if(Math.abs(r.rx)<6) { info.target=1; info.why='near the road'; }
      if(info.inPath){
        if(ttc<5.5){ info.target=2; info.why='in your path'; }
        if(ttc<2.6){ info.target=3; info.why='in your path, close'; }
        const stopDist = c.v*c.v/(2*6);
        if(info.react && stopDist < r.ry-CAR_L/2-1){ info.target=Math.min(info.target,1); info.why='driver is stopping'; }
        if(ttc<1.25 && c.v>1 && Math.abs(r.rx)<1.9 && !(c.brake && stopDist<r.ry-CAR_L/2)) info.fail=true;
      }
    }
  }
  return info;
}

// ---------- simulation step ----------
function step(dt){
  const s=S, c=s.car; s.t+=dt;
  // inputs
  let inp = {sig:keys.sigToggle, steer:(keys.left?-1:0)+(keys.right?1:0), gas:!!keys.up, brake:!!keys.down};
  if(opts.auto){ const o=PRESETS[preset].script(s)||{}; inp.sig=o.sig!==undefined?o.sig:null; inp.steer=o.steer||0; inp.gas=!!o.gas; inp.brake=!!o.brake; inp.coast=!!o.coast; inp.hold=!!o.hold; }
  c.sig = inp.sig||null; c.steer=inp.steer; c.brake=inp.brake; c.gas=inp.gas;
  if(preset==='explore'){ const wf=wizForce(s.t); const n=(wf===null||wf===undefined)?forcedLevel:wf, cyc=s.users[0]; c.v=0; c.vHist=[0];
    s.users.forEach(u=>{ u.info=evalUser(s,u); u.info.why='level explorer'; u.level=Math.min(n,3); u.ledFade += ((n>=1?1:0)-u.ledFade)*Math.min(1,dt*5); });
    s.failsafe = n===4 ? (s.failsafe||{u:cyc,t:0}) : null; s.top=n; s.primary = n>0?cyc:null; s.pedalPush = n===2||n===3;
    if(n!==s.lastLevel){ pushLog(`Level → <b>${LEVELS[n]}</b>`); if(n===3) sound('urgent',-1); if(n===4) sound('fail'); s.lastLevel=n; }
    c.blink+=dt; return; }

  // spawn scripted pedestrian
  if(s.spawnPed && s.t>=s.spawnPed.at){ addPed(s, c.y+s.spawnPed.ahead, 2.6, -s.spawnPed.speed, 'walking'); pushLog('Pedestrian steps out from between parked cars'); s.spawnPed=null; }

  // relevance
  let top=0, primary=null;
  const infos = s.users.map(u=>{ const i=evalUser(s,u); u.info=i; return i; });
  let fail=null;
  s.users.forEach((u,ix)=>{ const i=infos[ix];
    if(i.fail && !fail) fail=u;
    // hysteresis: up immediately, down after 0.7 s
    if(i.target>u.level){ u.level=i.target; u.levelSince=0; u.downT=0; }
    else if(i.target<u.level){ u.downT=(u.downT||0)+dt; if(u.downT>0.7){ u.level=i.target; u.levelSince=0; u.downT=0; } else u.levelSince+=dt; }
    else { u.levelSince+=dt; u.downT=0; }
    u.ledFade += ((u.level>=1?1:0) - u.ledFade)*Math.min(1,dt*5);
    if(u.level>top){ top=u.level; primary=u; }
  });
  const ov=wizForce(s.t);
  if(ov!==null && ov!==undefined){ const cands=s.users.filter(u=>u.kind!=='car'&&u.info); let near=null, nd=1e9; cands.forEach(u=>{ const d=Math.hypot(u.info.r.rx,u.info.r.ry); if(d<nd){ nd=d; near=u; } });
    const n=Math.min(ov,3); cands.forEach(u=>{ if(u.level!==n){ u.level=n; u.levelSince=0; } u.ledFade += ((n>=1?1:0)-u.ledFade)*Math.min(1,dt*5); });
    top = cands.length? n : 0; primary = (cands.length && n>0)? near : null; fail = (ov===4)? near : null; if(ov!==4 && s.failsafe) s.failsafe=null; }
  if(fail && !s.failsafe){ s.failsafe={u:fail, t:0}; pushLog(`<b>Emergency braking</b>: ${fail.kind}`); sound('fail'); }
  if(s.failsafe){ s.failsafe.t+=dt; if(c.v<0.05 && s.failsafe.t>2.8) { s.failsafe=null; s.msgHold=0; } }
  const shownTop = s.failsafe?4:top;
  if(shownTop!==s.lastLevel){ if(shownTop>0 && shownTop<4) pushLog(`Level → <b>${LEVELS[shownTop]}</b>${primary?` · ${primary.kind}, ${primary.info.why}`:''}`); else if(shownTop===0) pushLog('Level → Baseline'); if(shownTop===3) sound('urgent', primary&&primary.kind!=='pedestrian' ? (primary.info.r.rx<0?-1:1) : 0); s.lastLevel=shownTop; }
  s.primary = s.failsafe ? s.failsafe.u : primary; s.top=shownTop;

  // longitudinal dynamics
  s.pedalPush = (c.gas && top>=2 && !s.failsafe);
  let a = 0;
  if(s.failsafe) a = -7.5;
  else if(c.brake) a = (inp.hold?-2.5:-4.5);
  else if(c.gas) a = s.pedalPush ? 0.8 : 2.2;
  else if(inp.coast) a = -0.6;
  if(inp.hold && c.v<0.3) { c.v=0; a=0; }
  c.v = Math.max(0, Math.min(14, c.v + a*dt));
  c.vHist.push(c.v); if(c.vHist.length>40) c.vHist.shift();
  // steering
  const rate = 0.75*Math.min(c.v/4,1);
  c.theta += c.steer*rate*dt;
  if(!c.steer && Math.abs(c.theta)<0.3) c.theta*= (1-Math.min(1,dt*1.5));
  c.x += Math.sin(c.theta)*c.v*dt; c.y += Math.cos(c.theta)*c.v*dt;
  // keep car in lane softly when straight
  if(!c.steer && Math.abs(c.theta)<0.05 && c.y< SIDE_STREET.y0-1) c.x += (-0.2-c.x)*dt*0.6;

  // road users
  s.users.forEach(u=>{
    if(u.kind==='pedestrian'){
      if(u.state==='waiting'){ const r=rel(c,u); if(c.v<0.4 && r.ry>0 && r.ry<14){ u.state='walking'; u.vx=-1.4; pushLog('Pedestrian starts crossing'); } }
      if(u.x<-7){ u.vx=0; }
    }
    if(u.kind==='cyclist'){ // cyclist slows if car blocks them
      const ahead=c.y-u.y; if(Math.abs(c.x-u.x)<2.1 && ahead>0 && ahead<4.8) u.vy=Math.max(0,u.vy-6*dt); else u.vy=Math.min(u.vy+1.2*dt,6.6);
    }
    u.x+=u.vx*dt; u.y+=u.vy*dt;
  });

  // outside sound: car slowing to let a pedestrian pass (non-emergency)
  const ped=s.users.find(u=>u.kind==='pedestrian' && u.info && u.info.inPath);
  if(ped && !s.failsafe && c.v>0.5 && c.vHist.length>10 && c.vHist[0]-c.v>0.6 && s.t-s.lastSlowSound>4){ s.lastSlowSound=s.t; sound('slow'); pushLog(opts.sndOut?'Outside sound: "slowing down"':'Outside sound cue (turn on Sound · Outside to hear it)'); }

  c.blink += dt;
}

// ---------- audio ----------
let actx=null;
function ensureAudio(){ if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ actx=null; } } if(actx&&actx.state==='suspended') actx.resume(); }
function tone(f,dur,when,type,vol,pan){ if(!actx) return; const o=actx.createOscillator(), g=actx.createGain(); o.type=type||'sine'; o.frequency.value=f; const t0=actx.currentTime+(when||0);
  g.gain.setValueAtTime(0,t0); g.gain.linearRampToValueAtTime(vol||0.12,t0+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t0+dur); let out=g; if(pan && actx.createStereoPanner){ const sp=actx.createStereoPanner(); sp.pan.value=pan; g.connect(sp); out=sp; } o.connect(g); out.connect(actx.destination); o.start(t0); o.stop(t0+dur+0.05); }
function sound(kind,pan){ if(SILENT) return;
  if(kind==='urgent' && opts.sndIn){ tone(1046,0.18,0,'sine',0.14,pan*0.9); tone(1318,0.22,0.16,'sine',0.14,pan*0.9); }
  if(kind==='fail' && opts.sndIn){ tone(330,0.3,0,'triangle',0.16); tone(247,0.5,0.28,'triangle',0.16); }
  if(kind==='slow' && opts.sndOut){ tone(523,0.35,0,'sine',0.12); tone(392,0.5,0.3,'sine',0.12); }
}

// ---------- drawing helpers ----------
function fit(cv){ const r=cv.isConnected?cv.getBoundingClientRect():{width:+(cv.dataset.w||cv.width),height:+(cv.dataset.h||cv.height)}, d=Math.min(2,window.devicePixelRatio||1); const w=Math.round(r.width*d), h=Math.round(r.height*d);
  if(cv.width!==w||cv.height!==h){ cv.width=w; cv.height=h; } const ctx=cv.getContext('2d'); ctx.setTransform(d,0,0,d,0,0); ctx.clearRect(0,0,r.width,r.height); return {ctx,w:r.width,h:r.height}; }
function rr(ctx,x,y,w,h,r){ r=Math.min(r,w/2,h/2); ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
const SEEN='#B44BFF', SEEN_HI='#E2B5FF', FONT='"Manrope",system-ui,sans-serif';
const ENV = {
  day:  {sky:['#8E99A8','#B9C1CB'], road:'#545862', trees:'#33402F', bg:['#3B3E46','#1E2026'], car:['#E2E3E7','#A2A4AB'], glow:5,  ledA:0.55, ghost:0.45},
  night:{sky:['#11131B','#1C1F2A'], road:'#16171D', trees:'#07080A', bg:['#1C1D25','#0B0B10'], car:['#BDBEC4','#62636B'], glow:22, ledA:1,    ghost:0.55},
  rain: {sky:['#3A414C','#59616C'], road:'#262930', trees:'#151A17', bg:['#2A2D35','#121318'], car:['#C9CACF','#7A7C83'], glow:13, ledA:0.8,  ghost:0.5},
};
function glowLine(ctx, pts, alpha, width){ const e=ENV[opts.env]; if(alpha<0.02) return; ctx.save(); ctx.globalAlpha=alpha*e.ledA; ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.strokeStyle=SEEN; ctx.lineWidth=width||4; ctx.shadowColor=SEEN; ctx.shadowBlur=e.glow; path(ctx,pts); ctx.stroke();
  ctx.shadowBlur=0; ctx.strokeStyle=SEEN_HI; ctx.lineWidth=Math.max(1,(width||4)*0.35); path(ctx,pts); ctx.stroke(); ctx.restore(); }
function path(ctx,pts){ ctx.beginPath(); pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])); }
function glyph(ctx,cx,cy,s,kind,col){ ctx.save(); ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=Math.max(1.6,s*0.13); ctx.lineCap='round'; ctx.lineJoin='round';
  if(kind==='pedestrian'){
    ctx.beginPath(); ctx.arc(cx+s*0.08,cy-s*0.78,s*0.17,0,7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx+s*0.02,cy-s*0.5); ctx.lineTo(cx-s*0.08,cy+s*0.1); ctx.lineTo(cx-s*0.42,cy+s*0.78); ctx.moveTo(cx-s*0.08,cy+s*0.1); ctx.lineTo(cx+s*0.12,cy+s*0.42); ctx.lineTo(cx+s*0.2,cy+s*0.8);
    ctx.moveTo(cx+s*0.02,cy-s*0.45); ctx.lineTo(cx-s*0.32,cy-s*0.12); ctx.moveTo(cx+s*0.0,cy-s*0.42); ctx.lineTo(cx+s*0.3,cy-s*0.05); ctx.stroke();
  } else {
    const wr=s*0.36; ctx.beginPath(); ctx.arc(cx-s*0.56,cy+s*0.3,wr,0,7); ctx.stroke(); ctx.beginPath(); ctx.arc(cx+s*0.56,cy+s*0.3,wr,0,7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx-s*0.56,cy+s*0.3); ctx.lineTo(cx-s*0.18,cy-s*0.28); ctx.lineTo(cx+s*0.36,cy-s*0.28); ctx.lineTo(cx+s*0.56,cy+s*0.3);
    ctx.moveTo(cx-s*0.56,cy+s*0.3); ctx.lineTo(cx+s*0.02,cy+s*0.3); ctx.lineTo(cx+s*0.36,cy-s*0.28); ctx.moveTo(cx-s*0.18,cy-s*0.28); ctx.lineTo(cx+s*0.02,cy+s*0.3);
    ctx.moveTo(cx-s*0.3,cy-s*0.42); ctx.lineTo(cx-s*0.06,cy-s*0.42); ctx.moveTo(cx+s*0.36,cy-s*0.28); ctx.lineTo(cx+s*0.3,cy-s*0.5); ctx.lineTo(cx+s*0.46,cy-s*0.52); ctx.stroke();
  }
  ctx.restore(); }
function rider(ctx,x,yBase,hgt,kind,alpha,blur,col,dir){ // soft ghost figure (cyclist or walker) standing on yBase; dir -1 faces left
  ctx.save(); if(dir===-1){ ctx.translate(x,0); ctx.scale(-1,1); ctx.translate(-x,0); } ctx.globalAlpha=alpha; if(blur) ctx.filter=`blur(${blur}px)`; ctx.fillStyle=col||'#E9E7EE'; ctx.strokeStyle=col||'#E9E7EE'; ctx.lineCap='round';
  if(kind==='pedestrian'){ ctx.lineWidth=hgt*0.11; ctx.beginPath(); ctx.arc(x,yBase-hgt*0.9,hgt*0.08,0,7); ctx.fill(); ctx.beginPath(); ctx.moveTo(x,yBase-hgt*0.78); ctx.lineTo(x,yBase-hgt*0.4); ctx.lineTo(x-hgt*0.1,yBase); ctx.moveTo(x,yBase-hgt*0.4); ctx.lineTo(x+hgt*0.1,yBase); ctx.stroke(); }
  else { const wr=hgt*0.2; ctx.lineWidth=hgt*0.035; ctx.beginPath(); ctx.arc(x-hgt*0.28,yBase-wr,wr,0,7); ctx.stroke(); ctx.beginPath(); ctx.arc(x+hgt*0.3,yBase-wr,wr,0,7); ctx.stroke();
    ctx.lineWidth=hgt*0.1; ctx.beginPath(); ctx.moveTo(x-hgt*0.02,yBase-hgt*0.45); ctx.lineTo(x+hgt*0.12,yBase-hgt*0.8); ctx.lineTo(x+hgt*0.26,yBase-hgt*0.58); ctx.stroke();
    ctx.beginPath(); ctx.arc(x+hgt*0.15,yBase-hgt*0.93,hgt*0.08,0,7); ctx.fill(); ctx.lineWidth=hgt*0.07; ctx.beginPath(); ctx.moveTo(x-hgt*0.02,yBase-hgt*0.45); ctx.lineTo(x+hgt*0.08,yBase-hgt*0.22); ctx.stroke(); }
  ctx.restore(); }

// side lights: which side / front strips are lit (detection only)
function stripAlpha(){ const a={L:0,R:0,F:0,gL:0,gR:0,gF:0,hot:{L:[],R:[],F:[]}}; const fs=!!S.failsafe;
  S.users.forEach(u=>{ if(!u.info||u.ledFade<0.02||u.kind==='car') return; const r=u.info.r; const lv=Math.max(1,Math.min(3,u.level||1)); const len=[0,0.3,0.6,1][lv]; const la=fs?0:u.ledFade;
    if(r.ry>CAR_L/2-0.3 && Math.abs(r.rx)<4.5){ a.F=Math.max(a.F,la); a.gF=Math.max(a.gF,u.ledFade); a.hot.F.push({p:Math.max(-1,Math.min(1,r.rx/2.5)),a:la,ga:u.ledFade,len,kind:u.kind}); }
    else { const sd=r.rx<0?'L':'R'; a[sd]=Math.max(a[sd],la); a['g'+sd]=Math.max(a['g'+sd],u.ledFade); a.hot[sd].push({p:Math.max(-1,Math.min(1,r.ry/(CAR_L/2))),a:la,ga:u.ledFade,len,kind:u.kind,ry:r.ry}); } });
  return a; }
function segOn(lo,hi,center,len){ const span=(hi-lo)*len, half=span/2; const c=Math.max(lo+half,Math.min(hi-half,center)); return [c-half,c+half]; }

// level state shown to people (0 Baseline … 4 Failsafe)
function conceptState(){ const P=S.primary, top=S.top;
  const who = P ? (P.kind==='pedestrian' ? 'the pedestrian ahead' : `the cyclist on the ${P.info.r.rx<0?'left':'right'}`) : '';
  const sideW = P && P.kind!=='pedestrian' ? (P.info.r.rx<0?'left':'right') : 'front';
  if(S.failsafe){ return {n:4, label:'! · Failsafe', desc:`Existing emergency braking, with a reason: "Braking · ${S.failsafe.u.kind==='pedestrian'?'pedestrian crossing':'cyclist alongside'}". Outside, the brake lights take over.`}; }
  if(top>=3 && P) return {n:3, label:'3 · Urgent', desc:`Visual + haptic + sound for ${who}: full mirror outline with a fast sweep, the panel edge sweeps to the ${sideW}, a chime from the ${sideW}.`};
  if(top===2 && P) return {n:2, label:'2 · Caution', desc:`Visual + haptic for ${who}: the mirror light grows and sweeps, the panel names them, and the accelerator pushes back.`};
  if(top===1 && P) return {n:1, label:'1 · Aware', desc:`A soft directional cue for ${who}: panel icon, a small steady mirror light, and a short exterior light so they know they're detected.`};
  return {n:0, label:'0 · Baseline', desc:'Nothing relevant. Seen stays quiet.'}; }

// ---------- top view ----------
const topCv=document.getElementById('top');
function drawTop(){
  const {ctx,w,h}=fit(topCv), c=S.car; const t=S.t;
  const ppm = w/15, camX = Math.abs(c.x)>4 ? c.x : 0, camY=c.y;
  const X = x => w/2 + (x-camX)*ppm, Y = y => h*0.64 - (y-camY)*ppm;
  ctx.fillStyle='#0B0B10'; ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#16161D'; ctx.fillRect(X(LANE.walkL),0,(LANE.walkR-LANE.walkL)*ppm,h);
  ctx.fillStyle='#1E1E27'; ctx.fillRect(X(LANE.bikeL),0,(LANE.parkR-LANE.bikeL)*ppm,h);
  ctx.fillRect(0,Y(SIDE_STREET.y1),Math.max(0,X(LANE.bikeL)),(SIDE_STREET.y1-SIDE_STREET.y0)*ppm);
  ctx.fillStyle='#16161D'; ctx.fillRect(0,Y(SIDE_STREET.y1+2),Math.max(0,X(LANE.walkL)),2*ppm); ctx.fillRect(0,Y(SIDE_STREET.y0),Math.max(0,X(LANE.walkL)),2*ppm);
  ctx.fillStyle='#18251F'; ctx.fillRect(X(LANE.bikeL),0,(LANE.bikeR-LANE.bikeL)*ppm,h);
  ctx.strokeStyle='rgba(255,255,255,.22)'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(X(LANE.bikeR),0); ctx.lineTo(X(LANE.bikeR),h); ctx.stroke();
  ctx.setLineDash([ppm*1.5,ppm*1.5]); ctx.lineDashOffset=-(camY*ppm)%(ppm*3); ctx.beginPath(); ctx.moveTo(X(LANE.carR),0); ctx.lineTo(X(LANE.carR),h); ctx.stroke(); ctx.setLineDash([]);
  if(preset==='pedYield'){ ctx.fillStyle='rgba(255,255,255,.28)'; for(let x=LANE.bikeL; x<LANE.parkR; x+=0.9) ctx.fillRect(X(x),Y(43.5),0.5*ppm,3*ppm); }
  for(let y=Math.floor((camY-20)/12)*12; y<camY+30; y+=12) glyph(ctx,X(-2.85),Y(y),ppm*0.32,'cyclist','rgba(255,255,255,.18)');
  if(preset!=='carBike') for(let y=Math.floor((camY-25)/6.5)*6.5; y<camY+30; y+=6.5){ if(Math.abs(y-43)<4 && preset==='pedYield') continue; carTop(ctx,X(2.55),Y(y),0,ppm,false); }
  if(opts.env==='rain'){ ctx.strokeStyle='rgba(200,215,235,.12)'; ctx.lineWidth=1; for(let i=0;i<70;i++){ const rx=(i*97.13+t*40)%w, ry=(i*53.7+t*260)%h; ctx.beginPath(); ctx.moveTo(rx,ry); ctx.lineTo(rx-2,ry+9); ctx.stroke(); } }
  if(opts.env==='day'){ ctx.fillStyle='rgba(255,255,255,.05)'; ctx.fillRect(0,0,w,h); }
  // road users
  S.users.forEach(u=>{ const ux=X(u.x), uy=Y(u.y), lv=(S.failsafe&&S.failsafe.u===u)?4:u.level;
    if(u.kind==='car'){ carTop(ctx,ux,uy,0,ppm,false); ctx.fillStyle='#5A5F6E'; rr(ctx,ux-CAR_W/2*ppm,uy-CAR_L/2*ppm,CAR_W*ppm,CAR_L*ppm,CAR_W*ppm*0.3); ctx.fill(); ctx.fillStyle='#262833'; rr(ctx,ux-CAR_W*0.4*ppm,uy-CAR_L*0.24*ppm,CAR_W*0.8*ppm,CAR_L*0.42*ppm,6); ctx.fill();
      if(u.info&&u.info.bsd){ const txt='Blind-spot light'; ctx.font=`600 10px ${FONT}`; const tw=ctx.measureText(txt).width+12; const bx=ux-CAR_W/2*ppm-6-tw; ctx.fillStyle='#FFB020'; rr(ctx,bx,uy-9,tw,18,9); ctx.fill(); ctx.fillStyle='#1A1206'; ctx.textAlign='left'; ctx.fillText(txt,bx+6,uy+3.5); } return; }
    ctx.fillStyle=lv>=3?'#2A0F40':'#24242E'; ctx.beginPath(); ctx.arc(ux,uy,0.62*ppm,0,7); ctx.fill();
    ctx.strokeStyle=lv>=2?SEEN:'rgba(255,255,255,.35)'; ctx.lineWidth=lv>=3?2.5:1.2; ctx.stroke();
    glyph(ctx,ux,uy,0.42*ppm,u.kind,'#F2F2F6');
    if(lv>0){ const txt=LEVELS[lv]; ctx.font=`600 10px ${FONT}`; const tw=ctx.measureText(txt).width+12; const bx=u.kind==='pedestrian'?ux-tw-0.8*ppm:ux+0.8*ppm;
      ctx.fillStyle=lv>=2?SEEN:'#2C2C38'; rr(ctx,bx,uy-9,tw,18,9); ctx.fill(); ctx.fillStyle='#fff'; ctx.textAlign='left'; ctx.fillText(txt,bx+6,uy+3.5); }
  });
  // ego car + strips
  const A=stripAlpha();
  ctx.save(); ctx.translate(X(c.x),Y(c.y)); ctx.rotate(c.theta); carTop(ctx,0,0,0,ppm,true);
  const hw=CAR_W/2*ppm+1.5, hl=CAR_L/2*ppm;
  if(c.sig && Math.floor(c.blink*2.4)%2===0){ ctx.fillStyle='#FFB020'; const sx=(c.sig==='L'?-1:1)*(hw-3); ctx.fillRect(sx-2.5,-hl+2,5,5); ctx.fillRect(sx-2.5,hl-7,5,5); }
  ['L','R'].forEach(sd=>A.hot[sd].forEach(hs=>{ const x=(sd==='L'?-1:1)*hw; const [y0,y1]=segOn(-hl*0.75,hl*0.7,-hs.p*hl*0.7,hs.len); glowLine(ctx,[[x,y0],[x,y1]],hs.a*0.9,3); }));
  A.hot.F.forEach(hs=>{ const [x0,x1]=segOn(-hw*0.75,hw*0.75,hs.p*hw*0.75,hs.len); glowLine(ctx,[[x0,-hl-1.5],[x1,-hl-1.5]],hs.a*0.9,3); });
  if(S.failsafe){ ctx.save(); ctx.fillStyle='#FF3B30'; ctx.shadowColor='#FF3B30'; ctx.shadowBlur=14; ctx.fillRect(-hw*0.8,hl-3,hw*1.6,4); ctx.restore(); }
  ctx.restore();
  if(S.t-S.lastSlowSound<1.6 && opts.sndOut){ ctx.fillStyle='#F2F2F6'; ctx.font=`600 12px ${FONT}`; ctx.textAlign='center'; ctx.fillText('♪ slowing down', X(c.x), Y(c.y+CAR_L/2+1.4)); }
}
function carTop(ctx,x,y,th,ppm,ego){ ctx.save(); ctx.translate(x,y); ctx.rotate(th); const w=CAR_W*ppm,l=CAR_L*ppm;
  if(ego){ const g=ctx.createLinearGradient(-w/2,0,w/2,0); g.addColorStop(0,'#8E9098'); g.addColorStop(0.5,'#E4E5EA'); g.addColorStop(1,'#8E9098'); ctx.fillStyle=g; }
  else ctx.fillStyle='#2B2B35';
  rr(ctx,-w/2,-l/2,w,l,w*0.3); ctx.fill();
  ctx.fillStyle=ego?'#1A1B22':'#202029'; rr(ctx,-w*0.4,-l*0.24,w*0.8,l*0.42,w*0.18); ctx.fill();
  if(ego){ ctx.fillStyle='rgba(255,255,255,.18)'; rr(ctx,-w*0.36,-l*0.22,w*0.72,l*0.1,4); ctx.fill(); ctx.fillStyle='#E5322D'; ctx.fillRect(-w*0.38,l/2-2.5,w*0.76,2); }
  ctx.restore(); }

// ---------- instrument panel ----------
const panelCv=document.getElementById('panel')||(()=>{ const c=document.createElement('canvas'); c.width=1080; c.height=453; c.dataset.w=540; c.dataset.h=226.5; return c; })(); let panelAnim={icon:0, crit:0, speedX:0.5};
// Instrument panel · design "03_Aware": speed + limit (left), gear + turn arrows (top), car in a field of dots
// that light up toward each detected road user and animate with the risk level, navigation + charge (right).
const PANEL_W=2576, PANEL_H=1080, MONO='"JetBrains Mono","SF Mono",ui-monospace,Menlo,monospace';
const PDOTS=(()=>{ const out=[], cx=1258, cy=590, rings=7; for(let i=0;i<rings;i++){ const r=205+i*21; const n=Math.round(2*Math.PI*r/25); for(let k=0;k<n;k++){ const a=k/n*Math.PI*2+(i%2)*Math.PI/n; out.push({i,a,x:cx+Math.sin(a)*r,y:cy-Math.cos(a)*r}); } } return {list:out,cx,cy,rings}; })();
function drawPanel(){
  const {ctx,w,h}=fit(panelCv), c=S.car, t=S.t, P=S.primary;
  ctx.clearRect(0,0,w,h); const k=Math.min(w/PANEL_W,h/PANEL_H); ctx.save(); ctx.translate((w-PANEL_W*k)/2,(h-PANEL_H*k)/2); ctx.scale(k,k);
  const stad=(x,y,ww,hh)=>{ const r=hh/2; ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+ww-r,y); ctx.arc(x+ww-r,y+r,r,-Math.PI/2,Math.PI/2); ctx.lineTo(x+r,y+hh); ctx.arc(x+r,y+r,r,Math.PI/2,Math.PI*1.5); ctx.closePath(); };
  // bezel + screen
  ctx.fillStyle='#1C1E21'; stad(16,16,2544,1048); ctx.fill(); ctx.fillStyle='#050507'; stad(68,68,2440,944); ctx.fill();
  // ---- risks seen by Seen: per-user smoothed level and direction ----
  if(!panelAnim.u) panelAnim.u={};
  const fs=S.failsafe; const seen=[];
  S.users.forEach(u=>{ if(u.kind==='car'||!u.info) return; let lv=(fs&&fs.u===u)?4:u.level; const a=panelAnim.u[u.id]||(panelAnim.u[u.id]={v:0,lv:0});
    a.v += ((lv>=1?1:0)-a.v)*0.08; a.lv += (lv-a.lv)*0.1; if(a.v<0.01) return; const r=u.info.r; seen.push({u,lv,v:a.v,L:a.lv,ang:Math.atan2(r.rx,r.ry)}); });
  const prim = fs?fs.u:P;
  // ---- dot field ----
  const SIG=[0.30,0.42,0.62,0.95,3.2], SPD=[0,0.5,1.1,2.4,3.2];
  PDOTS.list.forEach(d=>{ let I=0;
    seen.forEach(s=>{ const L=Math.max(1,Math.min(4,Math.round(s.L))); let da=Math.abs(((d.a-s.ang+Math.PI*3)%(Math.PI*2))-Math.PI); const ang=Math.exp(-(da*da)/(2*SIG[L]*SIG[L]));
      const radial=0.55+0.45*Math.sin(Math.PI*(d.i+0.5)/PDOTS.rings);
      const wave = L===1 ? 0.8+0.2*Math.sin(t*Math.PI*2*SPD[1]) : 0.45+0.55*Math.max(0,Math.sin(t*Math.PI*2*SPD[L] + d.i*1.0));
      const base=[0,0.55,0.8,1,1][L]*(s.u===prim?1:0.6);
      I=Math.max(I, s.v*base*ang*radial*wave); });
    if(I<0.06){ ctx.fillStyle='rgba(120,120,135,.16)'; ctx.beginPath(); ctx.arc(d.x,d.y,3.4,0,7); ctx.fill(); return; }
    const r=3.4+7.5*I; ctx.fillStyle=`rgba(${Math.round(150+80*I)},${Math.round(40+60*I)},${Math.round(220+35*I)},${0.35+0.65*I})`; ctx.beginPath(); ctx.arc(d.x,d.y,r,0,7); ctx.fill(); });
  // inner ring + ego car outline
  ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(PDOTS.cx,PDOTS.cy,188,0,7); ctx.stroke();
  carOutline(ctx,PDOTS.cx+10,PDOTS.cy-5,1);
  // ---- bubbles for each road user Seen is tracking ----
  seen.sort((a,b)=>(a.u===prim)-(b.u===prim)).forEach(s=>{ const big=s.u===prim, R=big?84:44, rad=big?248:330; const bx=PDOTS.cx+Math.sin(s.ang)*rad, by=PDOTS.cy-Math.cos(s.ang)*rad*0.92;
    ctx.save(); ctx.globalAlpha=s.v; const g=ctx.createLinearGradient(bx-R,by-R,bx+R,by+R); g.addColorStop(0,s.lv>=3?'#9C2BE0':'#5E1C86'); g.addColorStop(1,s.lv>=3?'#C04BFF':'#8A2BBE'); ctx.fillStyle=g;
    if(s.lv>=3){ ctx.shadowColor=SEEN; ctx.shadowBlur=40; } ctx.beginPath(); ctx.arc(bx,by,R,0,7); ctx.fill(); ctx.shadowBlur=0;
    if(s.lv>=2){ const p=(t*SPD[Math.min(4,s.lv)])%1; ctx.strokeStyle=`rgba(210,140,255,${0.6*(1-p)})`; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(bx,by,R*(1+p*0.6),0,7); ctx.stroke(); }
    glyph(ctx,bx,by+R*0.04,R*0.46,s.u.kind,'#FFFFFF'); ctx.restore(); });
  // ---- level 3 / failsafe: light sweeps along the bezel toward the risk side ----
  if(!panelAnim.crit) panelAnim.crit=0; panelAnim.crit += ((S.top>=3||fs?1:0)-panelAnim.crit)*0.08;
  if(panelAnim.crit>0.02 && prim && prim.info){ const side=prim.kind==='pedestrian'?'F':(prim.info.r.rx<0?'L':'R');
    ctx.save(); ctx.globalAlpha=panelAnim.crit; ctx.lineCap='round'; stad(42,42,2492,996); const per=2*(2492-996)+Math.PI*996;
    ctx.strokeStyle='rgba(180,75,255,.35)'; ctx.lineWidth=10; ctx.stroke();
    const p=(t*(fs?1.6:1.1))%1, seg=per*0.16; ctx.setLineDash([seg, per-seg]);
    const centre=(side==='L'?0.872:side==='R'?0.372:0.124)*per; // dash centred over the risk side, sweeping across it
    ctx.lineDashOffset=-(centre-seg/2+(p-0.5)*per*0.12); ctx.strokeStyle='#F1DBFF'; ctx.shadowColor=SEEN; ctx.shadowBlur=26; ctx.lineWidth=12; ctx.stroke(); ctx.restore(); }
  // ---- left: speed + limit ----
  ctx.textAlign='center'; ctx.fillStyle='#F2F3F5'; ctx.font=`700 190px ${FONT}`; ctx.fillText(Math.round(c.v*3.6),548,472);
  ctx.fillStyle='#8E9096'; ctx.font=`500 42px ${MONO}`; ctx.fillText('km/h',548,556);
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(548,702,64,0,7); ctx.fill(); ctx.strokeStyle='#D93A2B'; ctx.lineWidth=17; ctx.beginPath(); ctx.arc(548,702,64,0,7); ctx.stroke();
  ctx.fillStyle='#111'; ctx.font=`700 60px ${FONT}`; ctx.fillText('50',548,724);
  // ---- top: gear + turn arrows ----
  ctx.font=`600 66px ${MONO}`; ['N','P','R','D'].forEach((g,i)=>{ ctx.fillStyle=g==='D'?'#45D9DF':'#8E9096'; ctx.fillText(g,1192+i*55,206); });
  const blink=Math.floor(c.blink*2.4)%2===0; [['L',880],['R',1695]].forEach(([sd,x])=>{ const d=sd==='L'?-1:1, on=c.sig===sd&&blink; ctx.beginPath(); ctx.moveTo(x+d*24,172); ctx.lineTo(x-d*20,142); ctx.lineTo(x-d*20,202); ctx.closePath();
    if(on){ ctx.fillStyle='#35D07F'; ctx.shadowColor='#35D07F'; ctx.shadowBlur=18; ctx.fill(); ctx.shadowBlur=0; } else { ctx.strokeStyle='#4A4C52'; ctx.lineWidth=4; ctx.stroke(); } });
  // ---- right: navigation, or what Seen is doing ----
  const turned=c.theta<-0.8, dist=turned?400:Math.max(0,Math.round((SIDE_STREET.y0-c.y)/10)*10);
  ctx.strokeStyle='#F2F3F5'; ctx.lineWidth=9; ctx.lineJoin='round'; ctx.beginPath(); if(turned){ ctx.moveTo(1765,570); ctx.lineTo(1765,450); } else { ctx.moveTo(1765,570); ctx.lineTo(1765,480); ctx.lineTo(1715,480); } ctx.stroke();
  ctx.fillStyle='#F2F3F5'; ctx.beginPath(); if(turned){ ctx.moveTo(1765,425); ctx.lineTo(1740,460); ctx.lineTo(1790,460); } else { ctx.moveTo(1690,480); ctx.lineTo(1722,455); ctx.lineTo(1722,505); } ctx.closePath(); ctx.fill();
  ctx.textAlign='left'; ctx.font=`600 96px ${FONT}`; ctx.fillText(dist+' m',1830,512); ctx.fillStyle='#8E9096'; ctx.font=`500 36px ${MONO}`; ctx.fillText(turned?'Corso Magenta':'Via Dante',1850,560);
  ctx.strokeStyle='#2A2C30'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(1782,782); ctx.lineTo(2142,782); ctx.stroke();
  let msg=null; if(fs) msg=['Braking', fs.u.kind==='pedestrian'?'pedestrian crossing':'cyclist alongside'];
  else if(prim && S.top>=2){ const ped=prim.kind==='pedestrian', sd=prim.info&&prim.info.r.rx<0?'left':'right'; msg = S.top>=3 ? [ped?'Brake':'Slow down', ped?'pedestrian ahead':'cyclist on your '+sd] : [ped?'Pedestrian':'Cyclist', ped?'ahead':'on your '+sd]; }
  if(msg){ ctx.fillStyle=S.top>=3||fs?'#E9C2FF':'#F2F3F5'; ctx.font=`700 52px ${FONT}`; ctx.fillText(msg[0],1782,858); ctx.fillStyle='#A9AAB2'; ctx.font=`500 34px ${MONO}`; ctx.fillText(msg[1],1782,906); }
  else if(S.pedalPush){ ctx.fillStyle='#E9C2FF'; ctx.font=`500 34px ${MONO}`; ctx.fillText('pedal resistance on',1782,858); }
  // ---- charge gauge ----
  const soc=78, range=Math.round(214-Math.max(0,c.y)/1000*1.4), gc=[2050,540], gr=365, a0=-0.63, a1=0.63, N=18;
  for(let i=0;i<N;i++){ const f=i/(N-1), a=a1-(a1-a0)*f, on=f<=soc/100+1e-6; const x=gc[0]+Math.cos(a)*gr, y=gc[1]+Math.sin(a)*gr; ctx.save(); ctx.translate(x,y); ctx.rotate(a); ctx.fillStyle=on?(f>0.65?'#2BE3B2':'#21C79A'):'#4A4C52'; ctx.beginPath(); ctx.roundRect(-20,-7,40,14,5); ctx.fill(); ctx.restore(); }
  ctx.textAlign='center'; ctx.fillStyle='#F2F3F5'; ctx.font=`700 54px ${FONT}`; ctx.fillText(soc+'%',2295,548); ctx.fillStyle='#8E9096'; ctx.font=`500 34px ${MONO}`; ctx.fillText(range+' km',2295,600);
  ctx.fillStyle='#21C79A'; ctx.beginPath(); ctx.roundRect(2312,772,22,32,4); ctx.fill(); ctx.fillStyle='#050507'; ctx.beginPath(); ctx.moveTo(2325,778); ctx.lineTo(2318,790); ctx.lineTo(2324,790); ctx.lineTo(2320,800); ctx.lineTo(2329,786); ctx.lineTo(2323,786); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function carOutline(ctx,cx,cy,s){ ctx.save(); ctx.translate(cx,cy); ctx.scale(s,s); ctx.strokeStyle='#E8E9EC'; ctx.lineWidth=5; ctx.lineJoin='round';
  ctx.beginPath(); ctx.roundRect(-62,-128,124,256,[48,48,40,40]); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-52,-60); ctx.quadraticCurveTo(0,-82,52,-60); ctx.lineTo(44,66); ctx.quadraticCurveTo(0,80,-44,66); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-40,74); ctx.lineTo(-40,104); ctx.moveTo(40,74); ctx.lineTo(40,104); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-62,-48); ctx.lineTo(-74,-40); ctx.lineTo(-62,-34); ctx.moveTo(62,-48); ctx.lineTo(74,-40); ctx.lineTo(62,-34); ctx.stroke(); ctx.restore(); }

// ---------- side mirrors ----------
const mirCv={L:document.getElementById('mirL'), R:document.getElementById('mirR')};
const TREES=[...Array(48)].map((_,i)=>0.5+0.5*Math.sin(i*1.7)*Math.cos(i*0.53)+0.3*Math.sin(i*3.1));
function drawMirror(side){
  const {ctx,w,h}=fit(mirCv[side]), e=ENV[opts.env], c=S.car, t=S.t;
  ctx.save(); if(side==='L'){ ctx.translate(w,0); ctx.scale(-1,1); } // draw as right-hand mirror, flip for left
  // housing (arm toward the car on the left of this frame)
  let g=ctx.createLinearGradient(w*0.05,0,w*0.95,h); g.addColorStop(0,'#3A3A44'); g.addColorStop(0.35,'#18181E'); g.addColorStop(1,'#060608');
  ctx.fillStyle=g; ctx.beginPath(); ctx.moveTo(w*0.1,h*0.42); ctx.bezierCurveTo(w*0.1,h*0.14,w*0.32,h*0.1,w*0.58,h*0.1); ctx.lineTo(w*0.8,h*0.1); ctx.quadraticCurveTo(w*0.95,h*0.1,w*0.95,h*0.28);
  ctx.lineTo(w*0.95,h*0.74); ctx.quadraticCurveTo(w*0.95,h*0.9,w*0.78,h*0.9); ctx.lineTo(w*0.36,h*0.9); ctx.bezierCurveTo(w*0.18,h*0.9,w*0.1,h*0.72,w*0.1,h*0.42); ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(w*0.14,h*0.36); ctx.bezierCurveTo(w*0.16,h*0.17,w*0.34,h*0.14,w*0.56,h*0.14); ctx.stroke();
  // glass
  const gx=w*0.3, gy=h*0.17, gw=w*0.6, gh=h*0.66, gr=gh*0.22;
  const glassPath=()=>{ ctx.beginPath(); ctx.moveTo(gx+gr,gy); ctx.lineTo(gx+gw-gr*0.7,gy); ctx.quadraticCurveTo(gx+gw,gy,gx+gw,gy+gr*0.8); ctx.lineTo(gx+gw,gy+gh-gr*1.3); ctx.quadraticCurveTo(gx+gw,gy+gh,gx+gw-gr*1.3,gy+gh); ctx.lineTo(gx+gr*0.6,gy+gh); ctx.quadraticCurveTo(gx,gy+gh,gx,gy+gh-gr*0.6); ctx.lineTo(gx,gy+gr); ctx.quadraticCurveTo(gx,gy,gx+gr,gy); ctx.closePath(); };
  ctx.save(); glassPath(); ctx.clip();
  if(!mirror3D(ctx,side,gx,gy,gw,gh,side==='L')){
  const hor=gy+gh*0.48; g=ctx.createLinearGradient(0,gy,0,hor); g.addColorStop(0,e.sky[0]); g.addColorStop(1,e.sky[1]); ctx.fillStyle=g; ctx.fillRect(gx,gy,gw,gh);
  ctx.fillStyle=e.trees; ctx.beginPath(); ctx.moveTo(gx,hor); TREES.forEach((v,i)=>{ const xx=gx+gw*i/(TREES.length-1); ctx.lineTo(xx, hor-gh*(0.08+0.18*v*(i%2?1:0.7))); }); ctx.lineTo(gx+gw,hor); ctx.fill();
  ctx.fillStyle=e.road; ctx.fillRect(gx,hor,gw,gh);
  const vp=[gx+gw*0.25,hor]; ctx.fillStyle='rgba(255,255,255,.04)'; ctx.beginPath(); ctx.moveTo(vp[0],vp[1]); ctx.lineTo(gx+gw*1.1,gy+gh); ctx.lineTo(gx+gw*0.3,gy+gh); ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.25)'; ctx.lineWidth=1.2; ctx.setLineDash([6,8]); ctx.lineDashOffset=-(c.y*8)%14; ctx.beginPath(); ctx.moveTo(vp[0],vp[1]); ctx.lineTo(gx+gw*0.55,gy+gh); ctx.stroke(); ctx.setLineDash([]);
  // reflections of road users behind/alongside on this side
  S.users.forEach(u=>{ const r=rel(c,u); const sd=r.rx<0?'L':'R'; if(sd!==side || r.ry>2.5 || r.ry<-35) return; const back=Math.max(0.6,-r.ry+2.6), kk=Math.min(1,4/back);
    const px=vp[0]+(gx+gw*0.95-vp[0])*Math.min(1,kk*1.15), yb=hor+(gy+gh*1.05-hor)*kk; if(u.kind==='car') mirrorCar(ctx,px,yb,gh*0.5*kk+6); else rider(ctx,px,yb,gh*0.55*kk+5,u.kind,0.8,kk>0.6?1.8:0.8); });
  }
  if(opts.env==='rain'){ ctx.fillStyle='rgba(220,230,245,.22)'; for(let i=0;i<22;i++){ const x=gx+(i*37.3)%gw, y=gy+((i*53.1)+t*(8+i%4))%gh; ctx.beginPath(); ctx.arc(x,y,1+(i%3),0,7); ctx.fill(); } }
  g=ctx.createLinearGradient(gx,gy,gx+gw,gy+gh); g.addColorStop(0,'rgba(255,255,255,.08)'); g.addColorStop(0.5,'rgba(255,255,255,0)'); ctx.fillStyle=g; ctx.fillRect(gx,gy,gw,gh);
  ctx.restore();
  ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.lineWidth=2; glassPath(); ctx.stroke();
  // Seen cue
  let best=null, bsd=false; S.users.forEach(u=>{ if(!u.info) return; const r=u.info.r; if(u.kind==='car'){ if(u.info.bsd && (r.rx<0?'L':'R')===side) bsd=true; return; } const sd=r.rx<0?'L':'R'; if(sd===side && r.ry<3 && (!best||u.level>best.level)) best=u; });
  let lv = best?best.level:0; if(S.failsafe && best && S.failsafe.u===best) lv=3;
  mirrorCue(ctx,lv,best?best.kind:'cyclist',{gx,gy,gw,gh,glassPath,radii:[gr,gr*0.75,gr*1.3,gr*0.6]},t,e);
  if(bsd) bsdIcon(ctx,gx+gw*0.84,gy+gh*0.18,gh*0.08,side==='L');
  // turn signal repeater (amber, standard)
  if(c.sig===side && Math.floor(c.blink*2.4)%2===0){ ctx.fillStyle='#FFB020'; ctx.shadowColor='#FFB020'; ctx.shadowBlur=8; rr(ctx,w*0.62,h*0.07,w*0.2,h*0.03,3); ctx.fill(); ctx.shadowBlur=0; }
  ctx.restore();
}
function bsdIcon(ctx,cx,cy,s,flip){ ctx.save(); ctx.translate(cx,cy); if(flip) ctx.scale(-1,1); ctx.fillStyle='#FFB020'; ctx.shadowColor='#FFB020'; ctx.shadowBlur=opts.env==='day'?3:10;
  rr(ctx,-s*1.1,-s*0.1,s*2.2,s*0.75,s*0.25); ctx.fill(); rr(ctx,-s*0.6,-s*0.6,s*1.25,s*0.6,s*0.25); ctx.fill(); ctx.shadowBlur=0; ctx.fillStyle='#1A1206'; ctx.beginPath(); ctx.arc(-s*0.6,s*0.68,s*0.22,0,7); ctx.arc(s*0.6,s*0.68,s*0.22,0,7); ctx.fill();
  ctx.strokeStyle='#FFB020'; ctx.lineWidth=Math.max(1.2,s*0.16); ctx.lineCap='round'; for(let k=0;k<3;k++){ ctx.beginPath(); ctx.arc(-s*1.3,s*0.25,s*(0.45+k*0.35),Math.PI*0.75,Math.PI*1.25); ctx.stroke(); } ctx.restore(); }
function mirrorCar(ctx,x,yb,hgt){ ctx.save(); const w=hgt*1.5; ctx.fillStyle=opts.env==='night'?'#3A3B44':'#4B4E58'; rr(ctx,x-w/2,yb-hgt*0.75,w,hgt*0.6,hgt*0.15); ctx.fill(); rr(ctx,x-w*0.33,yb-hgt,w*0.66,hgt*0.32,hgt*0.12); ctx.fill();
  ctx.fillStyle=opts.env==='day'?'#E9E9EC':'#FFF6D8'; ctx.shadowColor='#FFF6D8'; ctx.shadowBlur=opts.env==='day'?0:8; ctx.fillRect(x-w*0.42,yb-hgt*0.5,w*0.18,hgt*0.08); ctx.fillRect(x+w*0.24,yb-hgt*0.5,w*0.18,hgt*0.08); ctx.restore(); }
function roundPerim(G){ const x=G.gx,y=G.gy,w=G.gw,h=G.gh; const [a,b,c,d]=G.radii||[0,0,0,0]; const pts=[];
  const arc=(cx,cy,r,t0,t1)=>{ for(let i=0;i<=14;i++){ const t=t0+(t1-t0)*i/14; pts.push([cx+r*Math.cos(t),cy+r*Math.sin(t)]); } };
  pts.push([x+w,y+h/2]); arc(x+w-b,y+b,b,0,-Math.PI/2); arc(x+a,y+a,a,-Math.PI/2,-Math.PI); arc(x+d,y+h-d,d,Math.PI,Math.PI/2); arc(x+w-c,y+h-c,c,Math.PI/2,0); pts.push([x+w,y+h/2]);
  const L=[0]; for(let i=1;i<pts.length;i++) L.push(L[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  const N=240, tot=L[L.length-1], out=[]; let j=1; for(let i=0;i<N;i++){ const target=tot*i/N; while(j<L.length-1 && L[j]<target) j++; const seg=L[j]-L[j-1]||1, q=(target-L[j-1])/seg; out.push([pts[j-1][0]+(pts[j][0]-pts[j-1][0])*q, pts[j-1][1]+(pts[j][1]-pts[j-1][1])*q]); }
  return out; }
function mirrorCue(ctx,lv,kind,G,t,e){
  if(lv<=0) return; const L=Math.min(lv,3);
  const per=roundPerim(G);
  const n=per.length, seg=(a,b,width,alpha)=>{ const pts=[]; for(let i=Math.round(a*n);i<=Math.round(b*n);i++) pts.push(per[(i%n+n)%n]); glowLine(ctx,pts,alpha??1,width||5); };
  if(opts.enc==='seen'){
    const hl=(a,b)=>{ const pts=[]; for(let i=Math.round(a*n);i<=Math.round(b*n);i++) pts.push(per[(i%n+n)%n]); ctx.save(); ctx.globalAlpha=e.ledA; ctx.strokeStyle='#F6E8FF'; ctx.lineWidth=3; ctx.lineCap='round'; ctx.shadowColor=SEEN_HI; ctx.shadowBlur=e.glow; path(ctx,pts); ctx.stroke(); ctx.restore(); };
    if(L===1){ seg(-0.05,0.05,4); return; }
    if(L===2){ seg(-0.25,0.25,5); const p=0.25*(1-((t/1.6)%1)); hl(-p-0.035,-p+0.035); hl(p-0.035,p+0.035); return; }
    seg(0,1,6); const p=0.5*(1-((t/0.7)%1)); hl(-p-0.05,-p+0.05); hl(p-0.05,p+0.05); return; }
  if(opts.enc==='concept'){
    if(L<3) return;
    ctx.save(); ctx.lineJoin='round'; ctx.strokeStyle=SEEN; ctx.lineWidth=7; ctx.shadowColor=SEEN; ctx.shadowBlur=e.glow+6; ctx.globalAlpha=e.ledA; G.glassPath(); ctx.stroke();
    ctx.shadowBlur=0; ctx.lineWidth=2; ctx.strokeStyle=SEEN_HI; G.glassPath(); ctx.stroke();
    // movement: bright band sweeps from the car side (left of frame) to the outer edge
    const p=(t*0.9)%1, bx=G.gx+G.gw*(p*1.3-0.15); const gr=ctx.createLinearGradient(bx-G.gw*0.15,0,bx+G.gw*0.15,0); gr.addColorStop(0,'rgba(255,255,255,0)'); gr.addColorStop(0.5,'rgba(250,236,255,.95)'); gr.addColorStop(1,'rgba(255,255,255,0)');
    ctx.strokeStyle=gr; ctx.lineWidth=3.5; G.glassPath(); ctx.stroke(); ctx.restore(); return; }
  if(opts.enc==='extent'){ if(L===1) seg(-0.06,0.06); if(L===2) seg(-0.25,0.25); if(L===3) seg(0,1); }
  if(opts.enc==='motion'){ if(L===1) seg(-0.05,0.05); if(L===2){ const p=(t/1.6)%1; seg(-0.27+0.44*p,-0.17+0.44*p); } if(L===3){ for(let k=0;k<3;k++){ const p=((t/0.7)+k/3)%1; seg(p-0.06,p+0.06); } } }
  if(opts.enc==='icon'){ const ox=G.gx+G.gw*0.8, oy=G.gy+G.gh*0.26; ctx.save(); ctx.shadowColor=SEEN; ctx.shadowBlur=e.glow*0.6; ctx.globalAlpha=e.ledA;
    if(L===1){ ctx.fillStyle=SEEN; ctx.beginPath(); ctx.arc(ox,oy,4,0,7); ctx.fill(); }
    else { const s=L===2?G.gh*0.1:G.gh*0.16, cx=L===3?G.gx+G.gw/2:ox, cy=L===3?G.gy+G.gh/2:oy+3; ctx.fillStyle='rgba(20,8,32,.7)'; ctx.beginPath(); ctx.arc(cx,cy,s*1.6,0,7); ctx.fill(); glyph(ctx,cx,cy,s,kind,SEEN_HI); if(L===3){ ctx.strokeStyle=SEEN; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(cx,cy,s*1.6,0,7); ctx.stroke(); } }
    ctx.restore(); }
}

// ---------- exterior ----------
const extCv=document.getElementById('ext'), extCap=document.getElementById('extCap');
function drawExterior(){
  const {ctx,w,h}=fit(extCv), e=ENV[opts.env], c=S.car, t=S.t; const A=stripAlpha();
  let g=ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,e.bg[0]); g.addColorStop(1,e.bg[1]); ctx.fillStyle=g; rr(ctx,0,0,w,h,24); ctx.fill();
  ctx.save(); rr(ctx,0,0,w,h,24); ctx.clip();
  const front = A.gF>0.05 && A.gF>=Math.max(A.gL,A.gR);
  const side = front ? 'F' : (A.gR>A.gL ? 'R' : 'L');
  extCap.textContent = front ? 'Exterior light (vehicle front)' : `Exterior light (vehicle side · ${side==='L'?'left':'right'})`;
  const ground=h*0.88; ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(w/2,ground,w*0.42,h*0.04,0,0,7); ctx.fill();
  if(opts.env==='rain'){ ctx.strokeStyle='rgba(210,220,240,.18)'; ctx.lineWidth=1; for(let i=0;i<50;i++){ const x=(i*61.3+t*30)%w, y=(i*37.1+t*220)%h; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-2,y+9); ctx.stroke(); } }
  if(front) drawCarFront(ctx,w,h,ground,A,e,t); else drawCarSide(ctx,w,h,ground,side,A,e,t);
  ctx.restore();
}
function drawCarSide(ctx,w,h,ground,side,A,e,t){
  const cw=w*0.84, ch=h*0.66, x0=(w-cw)/2; const P=(u,v)=>[x0+u*cw, ground - v*ch];
  ctx.save(); if(side==='L'){ ctx.translate(w,0); ctx.scale(-1,1); } // canonical: front to the right (right side view); flip for left
  let g=ctx.createLinearGradient(0,ground-ch,0,ground); g.addColorStop(0,e.car[0]); g.addColorStop(0.55,e.car[1]); g.addColorStop(1,'#3B3C42'); ctx.fillStyle=g;
  ctx.beginPath(); ctx.moveTo(...P(0.02,0.16)); ctx.lineTo(...P(0.0,0.5)); ctx.quadraticCurveTo(...P(0.0,0.66),...P(0.06,0.72)); ctx.lineTo(...P(0.13,0.8)); ctx.quadraticCurveTo(...P(0.22,0.98),...P(0.36,0.98)); ctx.lineTo(...P(0.6,0.96));
  ctx.quadraticCurveTo(...P(0.68,0.95),...P(0.76,0.7)); ctx.quadraticCurveTo(...P(0.9,0.62),...P(0.98,0.55)); ctx.quadraticCurveTo(...P(1.01,0.45),...P(0.99,0.26)); ctx.lineTo(...P(0.97,0.14)); ctx.lineTo(...P(0.02,0.14)); ctx.closePath(); ctx.fill();
  // windows
  g=ctx.createLinearGradient(0,ground-ch,0,ground-ch*0.6); g.addColorStop(0,'#2A2C33'); g.addColorStop(1,'#0D0E12'); ctx.fillStyle=g;
  ctx.beginPath(); ctx.moveTo(...P(0.12,0.76)); ctx.quadraticCurveTo(...P(0.22,0.93),...P(0.36,0.92)); ctx.lineTo(...P(0.6,0.91)); ctx.quadraticCurveTo(...P(0.66,0.9),...P(0.72,0.72)); ctx.lineTo(...P(0.12,0.74)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle=e.car[1]; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(...P(0.43,0.92)); ctx.lineTo(...P(0.42,0.73)); ctx.stroke();
  ctx.strokeStyle='rgba(0,0,0,.25)'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(...P(0.42,0.72)); ctx.lineTo(...P(0.4,0.2)); ctx.moveTo(...P(0.72,0.7)); ctx.lineTo(...P(0.7,0.22)); ctx.stroke();
  // highlight
  ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(...P(0.08,0.74)); ctx.lineTo(...P(0.75,0.71)); ctx.quadraticCurveTo(...P(0.9,0.63),...P(0.97,0.56)); ctx.stroke();
  // wheels
  [0.19,0.81].forEach(u=>{ const [wx,wy]=P(u,0.0); const r=ch*0.24; ctx.fillStyle='rgba(10,10,12,.9)'; ctx.beginPath(); ctx.arc(wx,wy-r*0.98,r*1.18,Math.PI,0); ctx.fill(); ctx.fillStyle='#0B0B0D'; ctx.beginPath(); ctx.arc(wx,wy-r,r,0,7); ctx.fill();
    const rg=ctx.createRadialGradient(wx,wy-r,r*0.1,wx,wy-r,r*0.72); rg.addColorStop(0,'#6E7078'); rg.addColorStop(1,'#2A2B30'); ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(wx,wy-r,r*0.68,0,7); ctx.fill(); });
  // tail light + head light
  ctx.fillStyle='#E5322D'; ctx.shadowColor='#E5322D'; ctx.shadowBlur=opts.env==='day'?2:10; ctx.beginPath(); ctx.moveTo(...P(0.005,0.6)); ctx.lineTo(...P(0.09,0.62)); ctx.lineTo(...P(0.09,0.6)); ctx.lineTo(...P(0.005,0.575)); ctx.fill(); ctx.shadowBlur=0;
  ctx.fillStyle='#F2F2F6'; ctx.beginPath(); ctx.moveTo(...P(0.93,0.56)); ctx.lineTo(...P(0.99,0.5)); ctx.lineTo(...P(0.99,0.48)); ctx.lineTo(...P(0.93,0.53)); ctx.fill();
  // Seen side light: shoulder line along the full side, brighter next to the road user
  const a=A[side]; const lineA=P(0.07,0.53), lineB=P(0.95,0.5);
  ctx.strokeStyle='rgba(0,0,0,.35)'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(...lineA); ctx.lineTo(...lineB); ctx.stroke();
  A.hot[side].forEach(hs=>{ const [u0,u1]=segOn(0.07,0.95,0.51+hs.p*0.4,hs.len); glowLine(ctx,[P(u0,0.53-0.03*(u0-0.07)/0.88),P(u1,0.53-0.03*(u1-0.07)/0.88)],hs.a*0.9,3.5); });
  if(S.failsafe){ ctx.save(); ctx.fillStyle='#FF3B30'; ctx.shadowColor='#FF3B30'; ctx.shadowBlur=24; ctx.beginPath(); ctx.moveTo(...P(0.0,0.62)); ctx.lineTo(...P(0.1,0.64)); ctx.lineTo(...P(0.1,0.58)); ctx.lineTo(...P(0.0,0.56)); ctx.fill(); ctx.restore(); }
  A.hot[side].forEach(hs=>{ const u=0.51+hs.p*0.4; const [hx,hy]=P(u,0.515); const rg=ctx.createRadialGradient(hx,hy,1,hx,hy,cw*0.08); rg.addColorStop(0,`rgba(226,181,255,${0.5*hs.a*e.ledA})`); rg.addColorStop(1,'rgba(180,75,255,0)'); ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(hx,hy,cw*0.12,0,7); ctx.fill(); });
  ctx.restore();
  // ghost road user in front of the car (drawn unflipped)
  A.hot[side].forEach(hs=>{ let u=0.51+hs.p*0.4; if(side==='L') u=1-u; const gx=x0+u*cw; rider(ctx,gx,ground+h*0.02,ch*1.05,hs.kind,e.ghost*hs.ga,3,undefined,side==='L'?-1:1); });
}
function drawCarFront(ctx,w,h,ground,A,e,t){
  const cw=h*1.15, ch=h*0.62, cx=w/2; const P=(u,v)=>[cx+u*cw/2, ground-v*ch];
  let g=ctx.createLinearGradient(0,ground-ch,0,ground); g.addColorStop(0,e.car[0]); g.addColorStop(0.6,e.car[1]); g.addColorStop(1,'#3B3C42'); ctx.fillStyle=g;
  ctx.beginPath(); ctx.moveTo(...P(-0.98,0.12)); ctx.lineTo(...P(-1,0.45)); ctx.quadraticCurveTo(...P(-0.98,0.6),...P(-0.82,0.64)); ctx.lineTo(...P(-0.62,0.96)); ctx.lineTo(...P(0.62,0.96)); ctx.lineTo(...P(0.82,0.64)); ctx.quadraticCurveTo(...P(0.98,0.6),...P(1,0.45)); ctx.lineTo(...P(0.98,0.12)); ctx.closePath(); ctx.fill();
  g=ctx.createLinearGradient(0,ground-ch,0,ground-ch*0.62); g.addColorStop(0,'#2A2C33'); g.addColorStop(1,'#0D0E12'); ctx.fillStyle=g; ctx.beginPath(); ctx.moveTo(...P(-0.74,0.66)); ctx.lineTo(...P(-0.56,0.92)); ctx.lineTo(...P(0.56,0.92)); ctx.lineTo(...P(0.74,0.66)); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#0B0B0D'; [-0.78,0.78].forEach(u=>{ const [x,y]=P(u,0.02); ctx.fillRect(x-cw*0.06,y-ch*0.16,cw*0.12,ch*0.17); });
  ctx.fillStyle='#1A1B20'; ctx.beginPath(); ctx.moveTo(...P(-0.5,0.3)); ctx.lineTo(...P(0.5,0.3)); ctx.lineTo(...P(0.42,0.18)); ctx.lineTo(...P(-0.42,0.18)); ctx.fill();
  ctx.fillStyle='#F2F2F6'; [-1,1].forEach(s=>{ ctx.beginPath(); ctx.moveTo(...P(s*0.92,0.5)); ctx.lineTo(...P(s*0.62,0.52)); ctx.lineTo(...P(s*0.62,0.49)); ctx.lineTo(...P(s*0.92,0.46)); ctx.fill(); });
  const L1=P(-0.6,0.535), L2=P(0.6,0.535); ctx.strokeStyle='rgba(0,0,0,.35)'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(...L1); ctx.lineTo(...L2); ctx.stroke(); A.hot.F.forEach(hs=>{ const [q0,q1]=segOn(-0.6,0.6,hs.p*0.55,hs.len); glowLine(ctx,[P(q0,0.535),P(q1,0.535)],hs.a*0.9,3.5); });
  A.hot.F.forEach(hs=>{ const [hx,hy]=P(hs.p*0.55,0.535); const rg=ctx.createRadialGradient(hx,hy,1,hx,hy,cw*0.18); rg.addColorStop(0,`rgba(226,181,255,${0.5*hs.a*e.ledA})`); rg.addColorStop(1,'rgba(180,75,255,0)'); ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(hx,hy,cw*0.18,0,7); ctx.fill();
    rider(ctx, cx+ (hs.p>=0?1:-1)*cw*0.62 + hs.p*cw*0.2, ground+h*0.02, ch*0.95, hs.kind, e.ghost*hs.ga, 3); });
}

// ---------- driver POV (line-art cabin over the street) ----------
const povCv=document.getElementById('pov'); let povWheel=0;
// ---------- 3D street (Three.js) with 2D fallback ----------
let ST=null, ST_fail=false; const mirImg={L:document.createElement('canvas'),R:document.createElement('canvas')}; const mirCam={};
function st3(){ if(ST||ST_fail) return ST; try{ if(!window.SeenStreet3D) throw 0;
    ST=SeenStreet3D.create({env:opts.env, layout:{road:[LANE.bikeL,LANE.parkR], bike:[LANE.bikeL,LANE.bikeR], solid:[LANE.bikeR], dash:[LANE.carR], buildL:-10.5, buildR:10.5, y0:-60, y1:1100, sides:[{y0:SIDE_STREET.y0,y1:SIDE_STREET.y1,dir:-1,len:110}], zebra:[{y0:43.5,y1:46.5}]}});
    ST.movers=[]; ['L','R'].forEach(k=>{ mirImg[k].width=300; mirImg[k].height=250; mirCam[k]=new ST.T.PerspectiveCamera(30,300/250,0.3,300); });
  }catch(e){ ST=null; ST_fail=true; } return ST; }
function carPose(c,lx,ly){ const sn=Math.sin(c.theta), cs=Math.cos(c.theta); return [c.x+lx*cs+ly*sn, c.y-lx*sn+ly*cs]; }
function render3D(pw){ const st=st3(); if(!st) return null; const c=S.car;
  st.setEnv(opts.env); st.zebras.forEach(z=>z.visible=(preset==='pedYield'));
  // parked cars near the ego car, moving cars from the scenario
  const list=[]; if(preset!=='carBike') for(let y=Math.floor((c.y-20)/6.5)*6.5; y<c.y+110; y+=6.5){ if(Math.abs(y-43)<4 && preset==='pedYield') continue; if(y>SIDE_STREET.y0-3 && y<SIDE_STREET.y1+3 && false) continue; list.push({x:2.55,y}); } st.setParked(list);
  const cars=S.users.filter(u=>u.kind==='car'); while(st.movers.length<cars.length){ const m=st.makeCar(0x4b4e58); st.scene.add(m); st.movers.push(m); }
  st.movers.forEach((m,i)=>{ const u=cars[i]; m.visible=!!u; if(u){ m.position.set(u.x,0,-u.y); m.rotation.y=-Math.atan2(u.vx||0,u.vy||1); } });
  const f=[Math.sin(c.theta),Math.cos(c.theta)]; st.setFocus(c.x+f[0]*18,c.y+f[1]*18);
  const rw=Math.max(400,Math.min(1800,pw)), rh=Math.round(rw/2); st.setSize(rw,rh); const R=st.renderer, cam=st.camera;
  R.shadowMap.autoUpdate=false; R.shadowMap.needsUpdate=true;
  // side mirrors first, into the bottom-left corner, copied out
  R.setScissorTest(true);
  ['L','R'].forEach(side=>{ const mc=mirCam[side], sd=side==='L'?-1:1; const [mx,my]=carPose(c,sd*1.02,0.55); const [tx,ty]=carPose(c,sd*1.02+sd*0.22*20,0.55-20);
    mc.position.set(mx,1.05,-my); mc.lookAt(tx,0.9,-ty); R.setViewport(0,0,300,250); R.setScissor(0,0,300,250); R.render(st.scene,mc);
    const g=mirImg[side].getContext('2d'); g.save(); g.translate(300,0); g.scale(-1,1); g.drawImage(R.domElement,0,rh-250,300,250,0,0,300,250); g.restore(); });
  R.setScissorTest(false); R.setViewport(0,0,rw,rh);
  const k=rw/2576; st.setPinhole(rw,rh,980*k,1290*k,318*k); cam.position.set(c.x,1.25,-c.y); cam.lookAt(c.x+f[0],1.25,-(c.y+f[1]));
  return st.render(); }
// draw the 3D mirror image (already mirrored) into a rect, plus riders behind on that side
function mirror3D(ctx,side,x,y,w,h,flipped){ if(!ST) return false; const img=mirImg[side], mc=mirCam[side]; const IW=img.width, IH=img.height, sc=Math.max(w/IW,h/IH), dw=IW*sc, dh=IH*sc, ox=x+(w-dw)/2, oy=y+(h-dh)/2;
  ctx.save(); if(flipped){ ctx.translate(2*x+w,0); ctx.scale(-1,1); } ctx.drawImage(img,ox,oy,dw,dh);
  const c=S.car, V=ST.T.Vector3; const items=[];
  S.users.forEach(u=>{ if(u.kind==='car') return; const r=rel(c,u); if(r.ry>2.5||r.ry<-45) return; const b=new V(u.x,0,-u.y).project(mc), tp=new V(u.x,1.9,-u.y).project(mc); if(b.z>1||b.z<-1) return;
    const px=ox+(1-(b.x+1)/2)*dw, py=oy+(1-b.y)/2*dh, hp=Math.abs(((1-tp.y)/2*dh)-((1-b.y)/2*dh)); items.push({d:-r.ry,f:()=>rider(ctx,px,py,hp,u.kind,0.9,hp>40?1:0.5,opts.env==='night'?'#E2E0EA':'#2A2A30')}); });
  items.sort((a,b)=>b.d-a.d).forEach(i=>i.f()); ctx.restore(); return true; }

const BPAL={day:['#CFC7BA','#B9B1A5','#DAD5CC','#ADA79E','#C4BBAE'], night:['#2B2B35','#24242D','#31313B','#272730','#2E2D37'], rain:['#8E8D8C','#7F7E7E','#9A9896','#86837F','#93908C']};
const hash=n=>{ const x=Math.sin(n*127.1)*43758.5453; return x-Math.floor(x); };
function drawPov(){
  const {ctx,w}=fit(povCv), s=w/2576, e=ENV[opts.env], c=S.car, t=S.t;
  ctx.save(); ctx.scale(s,s);
  const CX=1290, HOR=318, F=980;
  const W2S=(x,y,z)=>{ const r=rel(c,{x,y}); if(r.ry<0.7) return null; return [CX+r.rx/r.ry*F, HOR+(1.25-(z||0))/r.ry*F]; };
  const poly=(pts,col,sub)=>{ const out=[]; sub=sub||14; for(let i=0;i<pts.length;i++){ const a=pts[i], b=pts[(i+1)%pts.length]; for(let k=0;k<sub;k++){ const q=k/sub; const p=W2S(a[0]+(b[0]-a[0])*q, a[1]+(b[1]-a[1])*q, (a[2]||0)+((b[2]||0)-(a[2]||0))*q); if(p) out.push(p); } }
    if(out.length<3) return; ctx.fillStyle=col; ctx.beginPath(); out.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])); ctx.closePath(); ctx.fill(); };
  const img3d=render3D(povCv.width);
  if(img3d){ ctx.drawImage(img3d,0,0,2576,1288);
    const its=[]; S.users.forEach(u=>{ if(u.kind==='car') return; const r=rel(c,u); if(r.ry<0.8) return; its.push({d:r.ry,f:()=>{ const p=W2S(u.x,u.y,0); if(!p) return; rider(ctx,p[0],p[1],1.9/r.ry*F,u.kind,1,0,opts.env==='night'?'#D9D7E0':'#24242A'); }}); });
    its.sort((a,b)=>b.d-a.d).forEach(i=>i.f());
    if(opts.env==='rain'){ ctx.fillStyle='rgba(225,235,250,.35)'; for(let i=0;i<120;i++){ const x=(i*211.7)%2576, y=(i*97.3+t*(25+(i%5)*12))%700; ctx.beginPath(); ctx.arc(x,y,3+(i%4)*2,0,7); ctx.fill(); } }
  } else {
  // ---------- street scene (higher fidelity) ----------
  const env=opts.env, night=env==='night', rain=env==='rain';
  const quad=(pts,col)=>{ const q=pts.map(p=>W2S(p[0],p[1],p[2]||0)); if(q.some(v=>!v)) return false; ctx.fillStyle=col; ctx.beginPath(); q.forEach((v,i)=>i?ctx.lineTo(v[0],v[1]):ctx.moveTo(v[0],v[1])); ctx.closePath(); ctx.fill(); return true; };
  const haze=(d)=>Math.min(0.55,Math.max(0,(d-12)/170));
  // sky with horizon haze and soft clouds
  let g=ctx.createLinearGradient(0,0,0,HOR+40); g.addColorStop(0,e.sky[0]); g.addColorStop(0.75,e.sky[1]); g.addColorStop(1,night?'#2A2630':shade(e.sky[1],18)); ctx.fillStyle=g; ctx.fillRect(0,0,2576,HOR+40);
  if(!night){ ctx.save(); ctx.globalAlpha=rain?.35:.22; ctx.fillStyle='#FFFFFF'; ctx.filter='blur(18px)'; [[420,90,260,34],[980,60,320,30],[1720,110,280,36],[2240,70,240,28]].forEach(([x,y,rx,ry])=>{ ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,7); ctx.fill(); }); ctx.restore(); }
  else { g=ctx.createLinearGradient(0,HOR-140,0,HOR+20); g.addColorStop(0,'rgba(255,170,90,0)'); g.addColorStop(1,'rgba(255,170,90,.12)'); ctx.fillStyle=g; ctx.fillRect(0,HOR-140,2576,160); }
  // ground: sidewalks
  const walk = night?'#23232B':rain?'#5B5D63':'#AEA9A0'; ctx.fillStyle=walk; ctx.fillRect(0,HOR,2576,1347-HOR);
  const y0=c.y-6, y1=c.y+160;
  // road surface with darker wheel tracks
  poly([[LANE.bikeL,y0],[LANE.parkR,y0],[LANE.parkR,y1],[LANE.bikeL,y1]], e.road, 30);
  poly([[-60,SIDE_STREET.y0],[LANE.bikeL,SIDE_STREET.y0],[LANE.bikeL,SIDE_STREET.y1],[-60,SIDE_STREET.y1]], e.road, 20);
  const track=night?'rgba(0,0,0,.22)':'rgba(0,0,0,.08)'; [[-1.3,-0.7],[0.4,1.0]].forEach(([xa,xb])=>poly([[xa,y0],[xb,y0],[xb,y1],[xa,y1]],track,30));
  if(rain){ poly([[LANE.bikeL,y0],[LANE.parkR,y0],[LANE.parkR,y1],[LANE.bikeL,y1]],'rgba(170,185,210,.10)',30); }
  // bike lane
  poly([[LANE.bikeL,y0],[LANE.bikeR,y0],[LANE.bikeR,y1],[LANE.bikeL,y1]], night?'rgba(70,120,90,.25)':'rgba(90,150,110,.38)', 30);
  const lineCol = night?'rgba(230,230,235,.55)':'rgba(250,250,250,.9)';
  poly([[LANE.bikeR-0.06,y0],[LANE.bikeR+0.06,y0],[LANE.bikeR+0.06,y1],[LANE.bikeR-0.06,y1]], lineCol, 30);
  for(let y=Math.floor(y0/3)*3; y<y1; y+=3) poly([[LANE.carR-0.07,y],[LANE.carR+0.07,y],[LANE.carR+0.07,y+1.5],[LANE.carR-0.07,y+1.5]], lineCol, 3);
  for(let y=Math.ceil((c.y+6)/18)*18; y<c.y+80; y+=18){ const p=W2S((LANE.bikeL+LANE.bikeR)/2,y,0); if(!p) continue; const r=rel(c,{x:0,y}); const sz=0.55/r.ry*F; ctx.save(); ctx.translate(p[0],p[1]); ctx.scale(1,Math.min(1,1.25/r.ry*1.6)); ctx.globalAlpha=night?.45:.8; glyph(ctx,0,-sz*0.3,sz,'cyclist',lineCol); ctx.restore(); }
  if(preset==='pedYield') for(let x=LANE.bikeL; x<LANE.parkR; x+=0.9) poly([[x,43.5],[x+0.5,43.5],[x+0.5,46.5],[x,46.5]], lineCol, 4);
  // curbs + paving joints
  const curb=night?'#3A3A44':'#C9C4BA'; [[LANE.bikeL-0.22,LANE.bikeL],[LANE.parkR,LANE.parkR+0.22]].forEach(([xa,xb])=>poly([[xa,y0,0.02],[xb,y0,0.02],[xb,y1,0.02],[xa,y1,0.02]],curb,30));
  ctx.strokeStyle=night?'rgba(255,255,255,.04)':'rgba(0,0,0,.07)'; ctx.lineWidth=2;
  for(let y=Math.ceil((c.y+1)/1.6)*1.6; y<c.y+40; y+=1.6) [[-10.5,LANE.bikeL-0.22],[LANE.parkR+0.22,10.5]].forEach(([xa,xb])=>{ if(xa<0 && y>SIDE_STREET.y0 && y<SIDE_STREET.y1) return; const p1=W2S(xa,y,0), p2=W2S(xb,y,0); if(p1&&p2){ ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.stroke(); } });
  // things that stand up, sorted far to near
  const items=[];
  const FAC={day:['#D9B98C','#C98E62','#E6D6B8','#B9775A','#D8C9A8','#C7A27A','#E2C49A'], rain:['#A89474','#9A7458','#B7AA92','#8E6250','#ADA28A','#A08562','#B49C7C'], night:['#3A332E','#3B2E2A','#3F3B36','#352A27','#3C3833','#3A3129','#403830']}[env];
  const SHUT=night?'#1E2620':'#4E6B4C';
  [-1,1].forEach(sd=>{ const bx=sd*10.5; for(let k=Math.floor((c.y-14)/14); k*14<c.y+160; k++){ const ya=k*14, yb=ya+14;
      if(sd<0 && yb>SIDE_STREET.y0-2 && ya<SIDE_STREET.y1+2) continue;
      const floors=4+Math.floor(hash(k*7+sd)*3), hgt=4.2+floors*3.1, col=FAC[Math.floor(hash(k*3+sd*5)*FAC.length)];
      const mid=rel(c,{x:bx,y:(ya+yb)/2}); if(mid.ry<-8) continue; const d=mid.ry;
      items.push({d:d+4, draw:()=>{
        // facade
        poly([[bx,ya,0],[bx,yb,0],[bx,yb,hgt],[bx,ya,hgt]], col, 6);
        // end wall + roof edge
        poly([[bx,ya,0],[bx+sd*12,ya,0],[bx+sd*12,ya,hgt],[bx,ya,hgt]], shade(col.length===7?col:'#888888',-28), 4);
        poly([[bx,ya,hgt-0.55],[bx,yb,hgt-0.55],[bx,yb,hgt],[bx,ya,hgt]], shade(col,24), 6);
        poly([[bx,ya,4.0],[bx,yb,4.0],[bx,yb,4.25],[bx,ya,4.25]], shade(col,-22), 6);
        if(d<120){
          // ground floor shops
          for(let u=0;u<3;u++){ const s0=ya+0.8+u*4.4, s1=s0+3.4; const glass=night?(hash(k*11+u+sd)>.4?'#E7B56E':'#16171C'):'#2A3038';
            quad([[bx,s0,0.2],[bx,s1,0.2],[bx,s1,3.1],[bx,s0,3.1]], glass);
            if(!night) quad([[bx,s0,0.2],[bx,s1,0.2],[bx,s1,3.1],[bx,s0,3.1]],'rgba(170,190,210,.18)');
            const aw=['#7A2E2A','#2E4A3A','#2F3A55','#6A5A3A'][Math.floor(hash(k*5+u*3+sd)*4)];
            quad([[bx,s0-0.1,3.15],[bx,s1+0.1,3.15],[bx-sd*0.9,s1+0.1,2.75],[bx-sd*0.9,s0-0.1,2.75]], night?shade(aw,-30):aw); }
          // upper floors: windows with shutters, every other building has balconies
          const bal=hash(k*13+sd)>.5;
          for(let f=0;f<floors;f++){ const z0=4.9+f*3.1, z1=z0+1.75; for(let wv=0;wv<4;wv++){ const w0=ya+1.2+wv*3.15, w1=w0+1.15;
            const lit=night&&hash(k*31+f*7+wv*3+sd)>.55;
            quad([[bx,w0,z0],[bx,w1,z0],[bx,w1,z1],[bx,w0,z1]], lit?'#F0BE78':(night?'#14161C':'#2B3139'));
            if(!lit && d<70){ quad([[bx,w0-0.42,z0],[bx,w0,z0],[bx,w0,z1],[bx,w0-0.42,z1]],SHUT); quad([[bx,w1,z0],[bx,w1+0.42,z0],[bx,w1+0.42,z1],[bx,w1,z1]],SHUT); }
            quad([[bx,w0-0.1,z1],[bx,w1+0.1,z1],[bx,w1+0.1,z1+0.22],[bx,w0-0.1,z1+0.22]], shade(col,20));
            if(bal&&f%2===0&&d<70) quad([[bx,w0-0.3,z0-0.1],[bx,w1+0.3,z0-0.1],[bx-sd*0.6,w1+0.3,z0-0.1],[bx-sd*0.6,w0-0.3,z0-0.1]], night?'#0E0F12':'#3A3B40'); } }
          // light falloff across the street side
          poly([[bx,ya,0],[bx,yb,0],[bx,yb,hgt],[bx,ya,hgt]], sd<0?'rgba(0,0,0,.06)':'rgba(255,240,220,.04)', 6);
        }
        const hz=haze(d); if(hz>0.01) poly([[bx,ya,0],[bx,yb,0],[bx,yb,hgt],[bx,ya,hgt]], night?`rgba(20,20,30,${hz})`:`rgba(205,212,222,${hz})`, 6);
      } }); } });
  // plane trees and street lamps on both sidewalks
  [-1,1].forEach(sd=>{ for(let y=Math.ceil((c.y-4)/9)*9; y<c.y+110; y+=9){ if(sd<0 && y>SIDE_STREET.y0-2 && y<SIDE_STREET.y1+2) continue; const tx=sd*8.2, r=rel(c,{x:tx,y}); if(r.ry<1.2) continue; const d=r.ry;
      items.push({d, draw:()=>{ const b=W2S(tx,y,0), t2=W2S(tx,y,3.0); if(!b||!t2) return; const sc=1/d*F;
        ctx.strokeStyle=night?'#15110E':'#5A4A3C'; ctx.lineWidth=Math.max(2,0.28*sc); ctx.beginPath(); ctx.moveTo(...b); ctx.lineTo(...t2); ctx.stroke();
        const cx=t2[0], cy=W2S(tx,y,4.6)[1], R=2.4*sc, base=night?'#0C110D':rain?'#2E3A2C':'#4C6A3E', hi=night?'#151C16':rain?'#3D4B39':'#6E8C52', hz=haze(d);
        ctx.fillStyle=base; [[0,0,1],[-.55,.15,.75],[.55,.2,.75],[0,-.45,.7]].forEach(([dx,dy,k])=>{ ctx.beginPath(); ctx.ellipse(cx+dx*R,cy+dy*R,R*k,R*k*.85,0,0,7); ctx.fill(); });
        ctx.fillStyle=hi; ctx.beginPath(); ctx.ellipse(cx-R*.25,cy-R*.35,R*.5,R*.4,0,0,7); ctx.fill();
        if(hz>0.01){ ctx.fillStyle=night?`rgba(20,20,30,${hz})`:`rgba(205,212,222,${hz})`; ctx.beginPath(); ctx.ellipse(cx,cy-R*.1,R*1.35,R*1.15,0,0,7); ctx.fill(); } } }); }
    for(let y=Math.ceil((c.y+2)/18)*18+4.5; y<c.y+120; y+=18){ const lx=sd*(sd<0?LANE.bikeL-0.6:LANE.parkR+0.6)*sd, r=rel(c,{x:lx,y}); if(r.ry<1.5) continue; const d=r.ry;
      items.push({d:d-0.1, draw:()=>{ const b=W2S(lx,y,0), t2=W2S(lx,y,6.2), arm=W2S(lx-sd*1.1,y,6.2); if(!b||!t2||!arm) return; const sc=1/d*F;
        ctx.strokeStyle=night?'#2A2A32':'#3B3D44'; ctx.lineWidth=Math.max(1.5,0.14*sc); ctx.beginPath(); ctx.moveTo(...b); ctx.lineTo(...t2); ctx.lineTo(...arm); ctx.stroke();
        ctx.fillStyle=night?'#FFE2A8':'#C9CCD2'; ctx.beginPath(); ctx.ellipse(arm[0],arm[1]+0.1*sc,0.35*sc,0.12*sc,0,0,7); ctx.fill();
        if(night||rain){ const gl=ctx.createRadialGradient(arm[0],arm[1],1,arm[0],arm[1],2.6*sc); gl.addColorStop(0,night?'rgba(255,210,140,.45)':'rgba(255,230,190,.18)'); gl.addColorStop(1,'rgba(255,210,140,0)'); ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(arm[0],arm[1],2.6*sc,0,7); ctx.fill();
          const gp=W2S(lx-sd*1.1,y,0); if(gp){ const pg=ctx.createRadialGradient(gp[0],gp[1],1,gp[0],gp[1],2.2*sc); pg.addColorStop(0,'rgba(255,200,130,.18)'); pg.addColorStop(1,'rgba(255,200,130,0)'); ctx.fillStyle=pg; ctx.save(); ctx.translate(gp[0],gp[1]); ctx.scale(1,0.3); ctx.translate(-gp[0],-gp[1]); ctx.beginPath(); ctx.arc(gp[0],gp[1],2.2*sc,0,7); ctx.fill(); ctx.restore(); } } } }); } });
  if(preset!=='carBike') for(let y=Math.floor((c.y-10)/6.5)*6.5; y<c.y+70; y+=6.5){ if(Math.abs(y-43)<4 && preset==='pedYield') continue; const yy=y; const r=rel(c,{x:2.55,y:yy}); if(r.ry<5.5) continue;
    items.push({d:r.ry, draw:()=>parkedCar(yy, Math.floor(hash(Math.round(yy*3))*6), false) }); }
  S.users.forEach(u=>{ const r=rel(c,u); if(r.ry<0.8) return; if(u.kind==='car'){ if(r.ry<4) return; items.push({d:r.ry, draw:()=>parkedCar(u.y,2,true) }); return; } items.push({d:r.ry, draw:()=>{ const p=W2S(u.x,u.y,0); if(!p) return; const hp=1.9/r.ry*F;
    rider(ctx,p[0],p[1],hp,u.kind,1,0,opts.env==='night'?'#D9D7E0':'#24242A'); } }); });
  function parkedCar(yy,ci,lit){ const night=opts.env==='night'; const COLS=night?['#2E3036','#3A2224','#222A38','#55575E','#26272B','#2C3428']:['#6C6F78','#8A2E2A','#2F3B52','#C9CBD0','#3A3C40','#4E5E48']; const col=COLS[ci%6];
    const xs=1.65, xe=3.45, yr=yy-2.2, yf=yy+2.2;
    // side facing the road
    poly([[xs,yr,0.28],[xs,yf,0.28],[xs,yf-0.15,0.95],[xs,yr+0.1,0.95]], shade(col,-10), 6);
    poly([[xs+0.12,yr+0.6,0.95],[xs+0.12,yf-0.9,0.95],[xs+0.2,yf-1.3,1.42],[xs+0.2,yr+0.95,1.42]], shade(col,-4), 6);
    poly([[xs+0.13,yr+0.8,1.0],[xs+0.13,yf-1.0,1.0],[xs+0.2,yf-1.35,1.36],[xs+0.2,yr+1.05,1.36]], night?'#0D0E12':'#1E232B', 6);
    [yr+0.75,yf-0.75].forEach(wy=>{ const p=W2S(xs,wy,0.33), q=W2S(xs,wy+0.36,0.33); if(p&&q){ const R=Math.abs(q[0]-p[0])+Math.abs(q[1]-p[1]); const rr2=Math.max(2,(W2S(xs,wy,0.66)||p)[1]-p[1]); ctx.fillStyle='#0B0B0D'; ctx.beginPath(); ctx.ellipse(p[0],p[1],Math.max(2,R*0.9),Math.abs(rr2),0,0,7); ctx.fill(); } });
    // rear face
    poly([[xs,yr,0.28],[xe,yr,0.28],[xe,yr+0.1,0.95],[xs,yr+0.1,0.95]], col, 4);
    poly([[xs+0.12,yr+0.6,0.95],[xe-0.12,yr+0.6,0.95],[xe-0.2,yr+0.95,1.42],[xs+0.2,yr+0.95,1.42]], shade(col,8), 4);
    poly([[xs+0.25,yr+0.7,1.0],[xe-0.25,yr+0.7,1.0],[xe-0.3,yr+0.95,1.34],[xs+0.3,yr+0.95,1.34]], night?'#0D0E12':'#262B33', 4);
    poly([[xs,yr,0.22],[xe,yr,0.22],[xe,yr,0.42],[xs,yr,0.42]], '#1A1B1F', 4);
    const tl=W2S(xs+0.05,yr+0.05,0.82), tr=W2S(xe-0.05,yr+0.05,0.82); if(tl&&tr){ const sz=Math.max(2,(tr[0]-tl[0])*0.16); ctx.save(); ctx.fillStyle=lit?'#FF3B30':'#B0302C'; if(lit||night){ ctx.shadowColor='#FF3B30'; ctx.shadowBlur=night?14:6; } ctx.fillRect(tl[0],tl[1],sz,sz*0.45); ctx.fillRect(tr[0]-sz,tr[1],sz,sz*0.45); ctx.restore(); } }
  items.sort((a,b)=>b.d-a.d).forEach(i=>i.draw());
  if(night){ ctx.fillStyle='rgba(5,6,15,.18)'; ctx.fillRect(0,0,2576,700); }
  if(rain){ ctx.fillStyle='rgba(225,235,250,.35)'; for(let i=0;i<120;i++){ const x=(i*211.7)%2576, y=(i*97.3+t*(25+(i%5)*12))%700; ctx.beginPath(); ctx.arc(x,y,3+(i%4)*2,0,7); ctx.fill(); } }

  }
  // --- cabin: photo of the real cockpit; windscreen, side windows and mirror glass are cut out ---
  const ck=cockpitImg(); 
  // rear-view mirror content (shows through the cut-out glass)
  ctx.fillStyle=lin2(ctx,0,140,0,236,[[0,e.sky[1]],[0.5,e.trees],[0.52,e.road],[1,e.road]]); ctx.fillRect(1120,136,350,104);
  const MG={L:{gx:28,gy:391,gw:172,gh:164,real:[62,20,26,46]}, R:{gx:2377,gy:393,gw:172,gh:162,real:[20,62,46,26]}}, CUE=[20,62,46,26];
  const Gof=sd=>{ const m=MG[sd]; return {gx:m.gx,gy:m.gy,gw:m.gw,gh:m.gh,radii:CUE,glassPath:()=>{ ctx.beginPath(); ctx.roundRect(m.gx,m.gy,m.gw,m.gh,m.real); },cuePath:()=>{ ctx.beginPath(); ctx.roundRect(m.gx,m.gy,m.gw,m.gh,CUE); }}; };
  ['L','R'].forEach(sd=>povMirror(ctx,sd,Gof(sd),e,t,'content'));
  if(ck) ctx.drawImage(ck,0,0,2576,1288);
  ['L','R'].forEach(sd=>povMirror(ctx,sd,Gof(sd),e,t,'cue'));
  // centre screen: navigation only
  ctx.save(); ctx.translate(1078,522); ctx.scale(384/376,177/180); ctx.translate(-1092,-526);
  ctx.save(); rr(ctx,1092,526,376,180,12); ctx.clip(); ctx.fillStyle='#12141A'; ctx.fillRect(1092,526,376,180);
  ctx.fillStyle='#F2F2F6'; ctx.font=`700 34px ${FONT}`; ctx.textAlign='left';
  const dist=c.theta<-0.8?'400 m':Math.max(0,Math.round((SIDE_STREET.y0-c.y)/10)*10)+' m'; ctx.fillText((c.theta<-0.8?'↑ ':'↰ ')+dist,1116,580);
  ctx.fillStyle='#A9A9B6'; ctx.font=`500 22px ${FONT}`; ctx.fillText(c.theta<-0.8?'Corso Magenta':'Via Dante',1118,612);
  ctx.strokeStyle='#5B6070'; ctx.lineWidth=6; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(1300,690); ctx.lineTo(1300,620); ctx.lineTo(c.theta<-0.8?1300:1250,c.theta<-0.8?560:600); ctx.stroke();
  ctx.strokeStyle=SEEN_HI; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(1300,690); ctx.lineTo(1300,650); ctx.stroke(); ctx.fillStyle=SEEN_HI; ctx.beginPath(); ctx.arc(1300,690,7,0,7); ctx.fill();
  ctx.fillStyle='#F2F2F6'; ctx.font=`600 18px ${FONT}`; ctx.textAlign='right'; ctx.fillText('8:30',1452,550); ctx.restore(); ctx.restore();
  // instrument panel in the cluster screen
  ctx.save(); ctx.beginPath(); ctx.roundRect(698,554,307,131,24); ctx.clip(); ctx.fillStyle='#050507'; ctx.fillRect(698,554,307,131);
  const ph=131, pw=ph*2.05; try{ ctx.drawImage(panelCv, 698+(307-pw)/2, 554, pw, ph); }catch(_){} ctx.restore();
  ctx.restore();
}
const COCKPIT=new Image(); COCKPIT.src=(window.SEEN_BASE||'')+'img/cockpit.webp'; const ckCache={};
function cockpitImg(){ if(!COCKPIT.complete||!COCKPIT.naturalWidth) return null; const env=opts.env; if(ckCache[env]) return ckCache[env];
  const cv=document.createElement('canvas'); cv.width=COCKPIT.naturalWidth; cv.height=COCKPIT.naturalHeight; const g=cv.getContext('2d'); g.drawImage(COCKPIT,0,0);
  const tone=env==='night'?'rgba(4,6,14,.55)':env==='rain'?'rgba(4,6,14,.2)':null; if(tone){ g.globalCompositeOperation='source-atop'; g.fillStyle=tone; g.fillRect(0,0,cv.width,cv.height); }
  return (ckCache[env]=cv); }
function lin2(ctx,x0,y0,x1,y1,stops){ const gg=ctx.createLinearGradient(x0,y0,x1,y1); stops.forEach(([o,cc])=>gg.addColorStop(o,cc)); return gg; }
function povMirror(ctx,side,G,e,t,phase){
  const c=S.car; if(phase!=='cue' && ST){ ctx.save(); G.glassPath(); ctx.clip(); mirror3D(ctx,side,G.gx,G.gy,G.gw,G.gh,false); ctx.restore(); }
  else if(phase!=='cue'){ ctx.save(); G.glassPath(); ctx.clip();
  const hor=G.gy+G.gh*0.45; let g=ctx.createLinearGradient(0,G.gy,0,hor); g.addColorStop(0,e.sky[0]); g.addColorStop(1,e.sky[1]); ctx.fillStyle=g; ctx.fillRect(G.gx,G.gy,G.gw,G.gh);
  ctx.fillStyle=e.trees; ctx.beginPath(); ctx.moveTo(G.gx,hor); TREES.forEach((v,i)=>ctx.lineTo(G.gx+G.gw*i/(TREES.length-1), hor-G.gh*(0.06+0.16*v*(i%2?1:0.7)))); ctx.lineTo(G.gx+G.gw,hor); ctx.fill();
  ctx.fillStyle=e.road; ctx.fillRect(G.gx,hor,G.gw,G.gh);
  const outer = side==='L' ? G.gx+G.gw*0.05 : G.gx+G.gw*0.95, vpx = side==='L'? G.gx+G.gw*0.72 : G.gx+G.gw*0.28;
  ctx.strokeStyle='rgba(255,255,255,.4)'; ctx.lineWidth=2; ctx.setLineDash([10,12]); ctx.beginPath(); ctx.moveTo(vpx,hor); ctx.lineTo((vpx+outer)/2,G.gy+G.gh); ctx.stroke(); ctx.setLineDash([]);
  S.users.forEach(u=>{ const r=rel(c,u); const sd=r.rx<0?'L':'R'; if(sd!==side || r.ry>2.5 || r.ry<-35) return; const back=Math.max(0.6,-r.ry+2.6), kk=Math.min(1,4/back);
    const px=vpx+(outer-vpx)*Math.min(1,kk*1.1), yb=hor+(G.gy+G.gh*1.05-hor)*kk; if(u.kind==='car') mirrorCar(ctx,px,yb,G.gh*0.5*kk+8); else rider(ctx,px,yb,G.gh*0.55*kk+8,u.kind,0.9,1,opts.env==='night'?'#E2E0EA':'#2A2A30'); });
  ctx.restore(); if(!phase){ ctx.strokeStyle='#1B1B20'; ctx.lineWidth=3; G.glassPath(); ctx.stroke(); } }
  if(phase==='content') return; const Gc=G.cuePath?Object.assign({},G,{glassPath:G.cuePath}):G;
  let best=null, bsd=false; S.users.forEach(u=>{ if(!u.info) return; const r=u.info.r; if(u.kind==='car'){ if(u.info.bsd && (r.rx<0?'L':'R')===side) bsd=true; return; } const sd=r.rx<0?'L':'R'; if(sd===side && r.ry<3 && (!best||u.level>best.level)) best=u; });
  let lv = best?best.level:0; if(S.failsafe && best && S.failsafe.u===best) lv=3;
  if(bsd) bsdIcon(ctx, side==='L'?G.gx+G.gw*0.16:G.gx+G.gw*0.84, G.gy+G.gh*0.2, G.gh*0.09, false);
  if(side==='L'){ ctx.save(); ctx.translate(2*G.gx+G.gw,0); ctx.scale(-1,1); mirrorCue(ctx,lv,best?best.kind:'cyclist',Gc,t,e); ctx.restore(); } else mirrorCue(ctx,lv,best?best.kind:'cyclist',Gc,t,e);
  if(c.sig===side && Math.floor(c.blink*2.4)%2===0){ ctx.fillStyle='#FFB020'; ctx.shadowColor='#FFB020'; ctx.shadowBlur=10; rr(ctx, side==='L'?G.gx+10:G.gx+G.gw-70, G.gy-16, 60, 9, 4); ctx.fill(); ctx.shadowBlur=0; }
}
function shade(hex,amt){ const n=parseInt(hex.slice(1),16); const f=v=>Math.max(0,Math.min(255,v+amt)); return `rgb(${f(n>>16)},${f((n>>8)&255)},${f(n&255)})`; }
