// Seen · shared Three.js street builder (Milan street, procedural). World units: metres.
// World axes: x = right, y = forward along the street, z = up. three.js axes: (x, z, -y).
window.SeenStreet3D = (function(){
  const T = window.THREE;
  const P = (x,y,z)=>new T.Vector3(x, z||0, -y);
  const hash = n=>{ const x=Math.sin(n*127.1+31.7)*43758.5453; return x-Math.floor(x); };
  const shadeHex=(hex,amt)=>{ const n=parseInt(hex.slice(1),16); const f=v=>Math.max(0,Math.min(255,v+amt)); return `rgb(${f(n>>16)},${f((n>>8)&255)},${f(n&255)})`; };
  const PALETTE=['#D9B98C','#C98E62','#E6D6B8','#B9775A','#D8C9A8','#C7A27A','#E2C49A','#BDB5A6'];
  const AWN=['#7A2E2A','#2E4A3A','#2F3A55','#6A5A3A','#5A2F45'];

  function canvasTex(w,h,draw,srgb=true){ const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h); const t=new T.CanvasTexture(c); if(srgb) t.colorSpace=T.SRGBColorSpace; t.anisotropy=4; return t; }

  // ---------- facade textures (map + emissive for lit windows) ----------
  const facadeCache={};
  function facadeTex(col,floors,seed){
    const key=col+floors+'_'+seed; if(facadeCache[key]) return facadeCache[key];
    const PX=24, Wm=14, Hm=4.6+floors*3.1+0.9, W=Wm*PX, H=Math.round(Hm*PX);
    const Y=m=>H-m*PX, X=m=>m*PX;
    const lit=[];
    const map=canvasTex(W,H,(g)=>{
      g.fillStyle=col; g.fillRect(0,0,W,H);
      for(let i=0;i<2200;i++){ g.fillStyle=`rgba(${hash(i+seed)>.5?255:0},${hash(i+seed)>.5?255:0},${hash(i+seed)>.5?255:0},${0.03*hash(i*3+seed)})`; g.fillRect(hash(i*7+seed)*W,hash(i*11+seed)*H,2,2); }
      const gr=g.createLinearGradient(0,0,0,H); gr.addColorStop(0,'rgba(0,0,0,0)'); gr.addColorStop(1,'rgba(0,0,0,.18)'); g.fillStyle=gr; g.fillRect(0,0,W,H);
      // rusticated ground floor
      g.fillStyle=shadeHex(col,-26); g.fillRect(0,Y(4.3),W,X(4.3)); g.strokeStyle='rgba(0,0,0,.18)'; g.lineWidth=1; for(let m=0.5;m<4.3;m+=0.5){ g.beginPath(); g.moveTo(0,Y(m)); g.lineTo(W,Y(m)); g.stroke(); }
      for(let u=0;u<3;u++){ const x0=0.8+u*4.4, x1=x0+3.4; const gg=g.createLinearGradient(0,Y(3.1),0,Y(0.2)); gg.addColorStop(0,'#1A1E24'); gg.addColorStop(1,'#323A44'); g.fillStyle=gg; g.fillRect(X(x0),Y(3.1),X(3.4),X(2.9));
        g.fillStyle='rgba(190,205,220,.18)'; g.beginPath(); g.moveTo(X(x0),Y(3.1)); g.lineTo(X(x0+1.2),Y(3.1)); g.lineTo(X(x0),Y(1.4)); g.fill();
        g.strokeStyle='#55504A'; g.lineWidth=3; g.strokeRect(X(x0),Y(3.1),X(3.4),X(2.9)); g.beginPath(); g.moveTo(X(x0+1.7),Y(3.1)); g.lineTo(X(x0+1.7),Y(0.2)); g.stroke();
        const aw=AWN[Math.floor(hash(seed*5+u)*AWN.length)]; g.fillStyle=aw; g.fillRect(X(x0-0.15),Y(3.75),X(3.7),X(0.6)); g.fillStyle='rgba(255,255,255,.18)'; for(let s=0;s<8;s+=2) g.fillRect(X(x0-0.15+s*0.46),Y(3.75),X(0.46),X(0.6));
        g.fillStyle='rgba(0,0,0,.25)'; g.fillRect(X(x0-0.15),Y(3.18),X(3.7),X(0.06));
        lit.push([x0,0.2,3.4,2.9,0.6]); }
      // string course
      g.fillStyle=shadeHex(col,22); g.fillRect(0,Y(4.55),W,X(0.25)); g.fillStyle='rgba(0,0,0,.2)'; g.fillRect(0,Y(4.3),W,2);
      const bal=hash(seed*13)>.45, shut=hash(seed*3)>.3?'#4E6B4C':'#6B5A3E';
      for(let f=0;f<floors;f++){ const z0=5.1+f*3.1, z1=z0+1.75;
        for(let k=0;k<4;k++){ const w0=1.3+k*3.15, w1=w0+1.15;
          g.fillStyle=shadeHex(col,18); g.fillRect(X(w0-0.12),Y(z1+0.12),X(1.39),X(1.99));
          const gg=g.createLinearGradient(0,Y(z1),0,Y(z0)); gg.addColorStop(0,'#3A4250'); gg.addColorStop(1,'#1D222A'); g.fillStyle=gg; g.fillRect(X(w0),Y(z1),X(1.15),X(1.75));
          g.strokeStyle='rgba(230,230,225,.65)'; g.lineWidth=2; g.beginPath(); g.moveTo(X(w0+0.575),Y(z1)); g.lineTo(X(w0+0.575),Y(z0)); g.moveTo(X(w0),Y(z0+1.1)); g.lineTo(X(w1),Y(z0+1.1)); g.stroke();
          const open=hash(seed*7+f*5+k)>.35;
          if(open){ g.fillStyle=shut; g.fillRect(X(w0-0.5),Y(z1),X(0.44),X(1.75)); g.fillRect(X(w1+0.06),Y(z1),X(0.44),X(1.75)); g.strokeStyle='rgba(0,0,0,.25)'; g.lineWidth=1; for(let s=0.12;s<1.75;s+=0.12){ g.beginPath(); g.moveTo(X(w0-0.5),Y(z0+s)); g.lineTo(X(w0-0.06),Y(z0+s)); g.moveTo(X(w1+0.06),Y(z0+s)); g.lineTo(X(w1+0.5),Y(z0+s)); g.stroke(); } }
          else { g.fillStyle=shut; g.fillRect(X(w0),Y(z1),X(1.15),X(1.75)); g.strokeStyle='rgba(0,0,0,.25)'; for(let s=0.12;s<1.75;s+=0.12){ g.beginPath(); g.moveTo(X(w0),Y(z0+s)); g.lineTo(X(w1),Y(z0+s)); g.stroke(); } }
          g.fillStyle=shadeHex(col,30); g.fillRect(X(w0-0.2),Y(z0),X(1.55),X(0.14));
          if(bal&&f%2===0){ g.fillStyle='rgba(30,30,34,.85)'; g.fillRect(X(w0-0.35),Y(z0+0.05),X(1.85),X(0.1)); for(let s=0;s<1.85;s+=0.12) g.fillRect(X(w0-0.35+s),Y(z0+0.95),2,X(0.9)); g.fillRect(X(w0-0.35),Y(z0+0.95),X(1.85),3); }
          if(hash(seed*31+f*7+k*3)>.5) lit.push([w0,z0,1.15,1.75,1]); } }
      // cornice
      const top=4.6+floors*3.1; g.fillStyle='rgba(0,0,0,.25)'; g.fillRect(0,Y(top+0.05),W,X(0.12)); g.fillStyle=shadeHex(col,28); g.fillRect(0,Y(top+0.9),W,X(0.8)); g.fillStyle=shadeHex(col,-10); for(let x=0.2;x<Wm;x+=0.5) g.fillRect(X(x),Y(top+0.25),X(0.2),X(0.18));
    });
    const emissive=canvasTex(W,H,(g)=>{ g.fillStyle='#000'; g.fillRect(0,0,W,H); lit.forEach(([x,z,w,h,k])=>{ g.fillStyle=k<1?'#E6A55C':'#F2BE7A'; g.fillRect(X(x),Y(z+h),X(w),X(h)); }); });
    return facadeCache[key]={map,emissive,Hm};
  }

  // ---------- small textures ----------
  const radialTex=(inner,outer)=>canvasTex(128,128,(g)=>{ const r=g.createRadialGradient(64,64,1,64,64,64); r.addColorStop(0,inner); r.addColorStop(1,outer); g.fillStyle=r; g.fillRect(0,0,128,128); });
  const asphaltTex=()=>{ const t=canvasTex(256,256,(g)=>{ g.fillStyle='#6E7075'; g.fillRect(0,0,256,256); for(let i=0;i<9000;i++){ const v=hash(i)*60+80; g.fillStyle=`rgba(${v},${v},${v+3},.22)`; g.fillRect(hash(i*3)*256,hash(i*7)*256,1.5,1.5); } for(let i=0;i<14;i++){ g.strokeStyle='rgba(30,30,32,.25)'; g.lineWidth=1; g.beginPath(); let x=hash(i*9)*256,y=hash(i*13)*256; g.moveTo(x,y); for(let k=0;k<6;k++){ x+=(hash(i*17+k)-.5)*40; y+=(hash(i*19+k)-.5)*40; g.lineTo(x,y); } g.stroke(); } }); t.wrapS=t.wrapT=T.RepeatWrapping; return t; };
  const pavingTex=()=>{ const t=canvasTex(256,256,(g)=>{ g.fillStyle='#B4AEA4'; g.fillRect(0,0,256,256); for(let y=0;y<256;y+=32) for(let x=0;x<256;x+=64){ const o=(y/32)%2?32:0, v=hash(x*3+y)*16-8; g.fillStyle=`rgb(${180+v},${174+v},${164+v})`; g.fillRect(x+o+1,y+1,62,30); } g.strokeStyle='rgba(0,0,0,.12)'; for(let y=0;y<256;y+=32){ g.beginPath(); g.moveTo(0,y); g.lineTo(256,y); g.stroke(); } }); t.wrapS=t.wrapT=T.RepeatWrapping; return t; };
  const bikeTex=()=>canvasTex(128,128,(g)=>{ g.strokeStyle='#fff'; g.fillStyle='#fff'; g.lineWidth=7; g.lineCap='round'; g.lineJoin='round'; g.beginPath(); g.arc(34,82,22,0,7); g.stroke(); g.beginPath(); g.arc(94,82,22,0,7); g.stroke(); g.beginPath(); g.moveTo(34,82); g.lineTo(54,50); g.lineTo(84,50); g.lineTo(94,82); g.moveTo(34,82); g.lineTo(64,82); g.lineTo(84,50); g.moveTo(54,50); g.lineTo(64,82); g.stroke(); g.beginPath(); g.arc(66,26,10,0,7); g.fill(); });
  const skyTex=(top,mid,bot)=>canvasTex(4,256,(g)=>{ const r=g.createLinearGradient(0,0,0,256); r.addColorStop(0,top); r.addColorStop(0.62,mid); r.addColorStop(1,bot); g.fillStyle=r; g.fillRect(0,0,4,256); });

  // ---------- a simple hatchback, local forward = world +y ----------
  const carGeo={};
  function carGeometries(){ if(carGeo.body) return carGeo;
    const s=new T.Shape(); s.moveTo(-1.98,0.33); s.lineTo(-2.03,0.78); s.quadraticCurveTo(-2.0,1.0,-1.82,1.04); s.lineTo(-1.62,1.08); s.lineTo(-1.42,1.5); s.lineTo(0.3,1.54); s.quadraticCurveTo(0.58,1.52,0.86,1.12); s.lineTo(1.72,0.98); s.quadraticCurveTo(2.0,0.95,2.03,0.68); s.lineTo(1.98,0.33); s.lineTo(1.62,0.33); s.absarc(1.3,0.33,0.34,0,Math.PI,false); s.lineTo(-0.98,0.33); s.absarc(-1.3,0.33,0.34,0,Math.PI,false); s.lineTo(-1.98,0.33);
    carGeo.body=new T.ExtrudeGeometry(s,{depth:1.62,bevelEnabled:true,bevelThickness:0.07,bevelSize:0.06,bevelSegments:3,curveSegments:10}); carGeo.body.translate(0,0,-0.81);
    const w=new T.Shape(); w.moveTo(-1.56,1.08); w.lineTo(-1.38,1.44); w.lineTo(0.28,1.48); w.quadraticCurveTo(0.5,1.46,0.78,1.1); w.lineTo(-1.56,1.08);
    carGeo.glass=new T.ExtrudeGeometry(w,{depth:1.76,bevelEnabled:false}); carGeo.glass.translate(0,0,-0.88);
    carGeo.wheel=new T.CylinderGeometry(0.31,0.31,0.22,22); carGeo.wheel.rotateX(Math.PI/2);
    carGeo.light=new T.BoxGeometry(0.06,0.13,0.32); carGeo.mirror=new T.BoxGeometry(0.22,0.14,0.2);
    return carGeo; }
  const glassMat=new T.MeshStandardMaterial({color:0x0d1015,roughness:0.08,metalness:0.7});
  const tyreMat=new T.MeshStandardMaterial({color:0x111113,roughness:0.85});
  const tailMat=new T.MeshStandardMaterial({color:0x5a0d0d,emissive:0xff2a20,emissiveIntensity:0.6});
  const headMat=new T.MeshStandardMaterial({color:0xdddddd,emissive:0xfff3dc,emissiveIntensity:0.3});
  function makeCar(color){ const G=carGeometries(); const grp=new T.Group(), inner=new T.Group(); inner.rotation.y=Math.PI/2; grp.add(inner);
    const bodyMat=new T.MeshStandardMaterial({color,metalness:0.45,roughness:0.32});
    const add=(geo,mat,x,y,z)=>{ const m=new T.Mesh(geo,mat); m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; inner.add(m); return m; };
    add(G.body,bodyMat,0,0,0); add(G.glass,glassMat,0,0,0);
    [[1.3,0.86],[1.3,-0.86],[-1.3,0.86],[-1.3,-0.86]].forEach(([x,z])=>add(G.wheel,tyreMat,x,0.31,z));
    [0.62,-0.62].forEach(z=>{ add(G.light,tailMat,-2.03,0.86,z); add(G.light,headMat,2.02,0.74,z); });
    [0.98,-0.98].forEach(z=>add(G.mirror,bodyMat,0.62,1.05,z));
    grp.userData.bodyMat=bodyMat; return grp; }

  // ---------- people: cyclist + pedestrian, forward = world +y (three -z), animated by distance travelled ----------
  const limbG=new T.CylinderGeometry(1,1,1,8); limbG.translate(0,0.5,0);
  function torusGeo(R,r,rs,ts){ const pos=[],nor=[],idx=[]; for(let j=0;j<=rs;j++) for(let i=0;i<=ts;i++){ const u=i/ts*Math.PI*2, v=j/rs*Math.PI*2, cx=Math.cos(u)*R, cy=Math.sin(u)*R;
      const x=(R+r*Math.cos(v))*Math.cos(u), y=(R+r*Math.cos(v))*Math.sin(u), z=r*Math.sin(v); pos.push(x,y,z); const nx=x-cx, ny=y-cy, nz=z, l=Math.hypot(nx,ny,nz)||1; nor.push(nx/l,ny/l,nz/l); }
    for(let j=1;j<=rs;j++) for(let i=1;i<=ts;i++){ const a=(ts+1)*j+i-1, b=(ts+1)*(j-1)+i-1, c=(ts+1)*(j-1)+i, d=(ts+1)*j+i; idx.push(a,b,d,b,c,d); }
    const g=new T.PlaneGeometry(1,1), BA=g.getAttribute('position').constructor; g.setAttribute('position',new BA(new Float32Array(pos),3)); g.setAttribute('normal',new BA(new Float32Array(nor),3)); g.deleteAttribute('uv'); g.setIndex(idx); g.computeBoundingSphere(); return g; }
  const ballG=new T.SphereGeometry(1,14,10), torsoG=new T.SphereGeometry(1,14,12), wheelG=torusGeo(0.34,0.022,6,28), tyreG=torusGeo(0.335,0.03,6,28);
  const std=(c,r)=>new T.MeshStandardMaterial({color:c,roughness:r??0.8});
  const SKIN=[0xE8BFA0,0xC99674,0x8D5B3E,0xF1D2BC,0x6B4430], SHIRT=[0x2B5D8C,0xB8442F,0xE0C340,0x3E6E47,0x7A3E7A,0xD9D9D9,0x1F1F24,0xC7703A], PANTS=[0x23262E,0x3A3F52,0x5A4A3A,0x2E3B2E,0x1A1C22], BIKE=[0x1E5BA8,0x111111,0xB3261E,0xE5E5E5,0x2F6B3A], HAIR=[0x2A1E16,0x5B3A22,0x111111,0xB8955A,0x7A7A7A];
  const pick=(a,k)=>a[Math.floor(hash(k)*a.length)%a.length];
  function limb(parent,mat,r){ const m=new T.Mesh(limbG,mat); m.userData.r=r; m.castShadow=true; parent.add(m); return m; }
  const _a=new T.Vector3(), _b=new T.Vector3(), _d=new T.Vector3(), _up=new T.Vector3(0,1,0);
  function seg(m,a,b){ _d.subVectors(b,a); const L=_d.length()||1e-3; m.position.copy(a); m.quaternion.setFromUnitVectors(_up,_d.multiplyScalar(1/L)); m.scale.set(m.userData.r,L,m.userData.r); }
  // two-bone leg/arm: hip a, foot c, lengths l1 l2, bend direction hint n (local vector)
  function ik(a,c,l1,l2,n){ const d=_b.subVectors(c,a); let L=d.length(); L=Math.min(L,l1+l2-1e-3); const x=(l1*l1-l2*l2+L*L)/(2*L), h=Math.sqrt(Math.max(0,l1*l1-x*x)); d.normalize();
    const perp=n.clone().sub(d.clone().multiplyScalar(n.dot(d))).normalize(); return a.clone().add(d.multiplyScalar(x)).add(perp.multiplyScalar(h)); }
  const V=(x,y,z)=>new T.Vector3(x,y,z);
  function makePerson(seed,cycling){
    const g=new T.Group(), skin=std(pick(SKIN,seed)), shirt=std(pick(SHIRT,seed*3+1)), pants=std(pick(PANTS,seed*5+2)), shoe=std(0x1b1b1f,0.6), hair=std(pick(HAIR,seed*7+3),0.9);
    const torso=new T.Mesh(torsoG,shirt); torso.castShadow=true; g.add(torso);
    const head=new T.Mesh(ballG,skin); head.scale.setScalar(0.105); head.castShadow=true; g.add(head);
    const cap=new T.Mesh(new T.SphereGeometry(1,14,8,0,Math.PI*2,0,Math.PI*0.55),cycling?std(pick([0xF2F2F2,0x111111,0xE34A2E,0x2D6CDF],seed*11),0.4):hair); cap.scale.setScalar(cycling?0.128:0.112); g.add(cap);
    const P={g,torso,head,cap,skin,shirt,pants,
      th:[limb(g,pants,0.075),limb(g,pants,0.075)], sh:[limb(g,pants,0.06),limb(g,pants,0.06)], ft:[limb(g,shoe,0.05),limb(g,shoe,0.05)],
      ua:[limb(g,shirt,0.05),limb(g,shirt,0.05)], fa:[limb(g,skin,0.04),limb(g,skin,0.04)]};
    if(!cycling){ const bag=hash(seed*13)>0.6; if(bag){ const b=new T.Mesh(new T.BoxGeometry(0.28,0.36,0.14),std(pick([0x3B2F28,0x1F2B3A,0x6B2E2E],seed),0.7)); b.castShadow=true; g.add(b); P.bag=b; } }
    return P; }
  function posePerson(P,hip,shoulder,headC,feet,hands,kneeHint,elbowHint){
    // torso capsule between hip and shoulder
    const mid=hip.clone().add(shoulder).multiplyScalar(0.5); _d.subVectors(shoulder,hip); const L=_d.length();
    P.torso.position.copy(mid); P.torso.quaternion.setFromUnitVectors(_up,_d.clone().normalize()); P.torso.scale.set(0.17,Math.max(0.01,L*0.62),0.12);
    P.head.position.copy(headC); P.cap.position.copy(headC).add(V(0,0.012,0.005));
    if(P.bag){ P.bag.position.copy(mid).add(V(0,0,0.15)); P.bag.quaternion.copy(P.torso.quaternion); }
    [0,1].forEach(i=>{ const sx=i?0.1:-0.1; const h=hip.clone().add(V(sx,0,0)), f=feet[i]; const k=ik(h,f,0.46,0.46,kneeHint); seg(P.th[i],h,k); seg(P.sh[i],k,f); seg(P.ft[i],f,f.clone().add(V(0,0.0,-0.2)));
      const sh=shoulder.clone().add(V(i?0.19:-0.19,-0.03,0)), hd=hands[i]; const e=ik(sh,hd,0.3,0.28,elbowHint); seg(P.ua[i],sh,e); seg(P.fa[i],e,hd); }); }
  function makeCyclist(seed){
    const g=new T.Group(), frameM=std(pick(BIKE,seed*17),0.35), dark=std(0x161618,0.5), metal=new T.MeshStandardMaterial({color:0xb9bcc2,metalness:0.8,roughness:0.3});
    const wheels=[]; [0.53,-0.53].forEach(z=>{ const w=new T.Group(); const rim=new T.Mesh(wheelG,metal), tyre=new T.Mesh(tyreG,dark); rim.rotation.y=Math.PI/2; tyre.rotation.y=Math.PI/2; tyre.castShadow=true; w.add(rim,tyre);
      for(let k=0;k<6;k++){ const sp=new T.Mesh(new T.BoxGeometry(0.006,0.66,0.006),metal); sp.rotation.x=k*Math.PI/6; w.add(sp); } w.position.set(0,0.35,z); g.add(w); wheels.push(w); });
    const P=(y,z)=>V(0,y,z), rear=P(0.35,0.53), front=P(0.35,-0.53), bb=P(0.3,0.06), seat=P(0.86,0.2), head=P(0.88,-0.38), bar=P(1.02,-0.44);
    [[rear,bb],[bb,seat],[seat,head],[bb,head],[rear,seat],[head,front]].forEach(([a,b])=>{ const m=limb(g,frameM,0.022); seg(m,a,b); });
    const stem=limb(g,dark,0.02); seg(stem,head,bar); const hb=limb(g,dark,0.016); seg(hb,bar.clone().add(V(-0.25,0,0)),bar.clone().add(V(0.25,0,0)));
    const saddle=new T.Mesh(new T.BoxGeometry(0.12,0.05,0.26),dark); saddle.position.copy(seat).add(V(0,0.03,0)); saddle.castShadow=true; g.add(saddle);
    const crank=[limb(g,metal,0.012),limb(g,metal,0.012)];
    const rider=makePerson(seed,true); g.add(rider.g);
    const lamp=new T.Mesh(new T.BoxGeometry(0.06,0.05,0.04),new T.MeshStandardMaterial({color:0xffffff,emissive:0xfff2cc,emissiveIntensity:1})); lamp.position.copy(bar).add(V(0,-0.04,-0.04)); g.add(lamp);
    const tail=new T.Mesh(new T.BoxGeometry(0.05,0.04,0.03),new T.MeshStandardMaterial({color:0x550000,emissive:0xff2020,emissiveIntensity:1.2})); tail.position.copy(seat).add(V(0,-0.08,0.12)); g.add(tail);
    return {g,kind:'cyclist',wheels,crank,rider,bb,seat,bar,phase:0}; }
  function poseCyclist(C,phase){ const a=phase; C.wheels.forEach(w=>w.rotation.x=-a*1.9);
    const feet=[0,1].map(i=>{ const q=a+i*Math.PI; return C.bb.clone().add(V(i?0.11:-0.11,Math.cos(q)*0.17,-Math.sin(q)*0.17)); });
    C.crank.forEach((m,i)=>seg(m,C.bb.clone().add(V(i?0.08:-0.08,0,0)),feet[i]));
    const hip=C.seat.clone().add(V(0,0.06,0.02)), sh=V(0,1.38,-0.22), hd=V(0,1.55,-0.33);
    posePerson(C.rider,hip,sh,hd,feet,[C.bar.clone().add(V(-0.22,0,0)),C.bar.clone().add(V(0.22,0,0))],V(0,0.3,-1),V(0,-0.4,0.6)); }
  function makePed(seed){ const P=makePerson(seed,false); return {g:P.g,kind:'pedestrian',P,phase:0,tall:0.94+hash(seed*19)*0.12}; }
  function posePed(W,phase,moving){ const s=moving?Math.sin(phase):0, k=W.tall, bob=moving?Math.abs(Math.cos(phase))*0.03:0;
    const hip=V(0,0.93*k+bob,0), sh=V(0,1.43*k+bob,-0.02), hd=V(0,1.6*k+bob,-0.03);
    const feet=[0,1].map(i=>{ const q=i?-s:s; return V(i?0.11:-0.11,0.05+Math.max(0,(i?-1:1)*Math.cos(phase))*(moving?0.07:0),-q*0.32); });
    const hands=[0,1].map(i=>{ const q=i?s:-s; return V(i?0.24:-0.24,0.88*k+bob,-q*0.22); });
    posePerson(W.P,hip,sh,hd,feet,hands,V(0,0,-1),V(0,0,1)); }
  function makePerson3D(kind,seed){ return kind==='cyclist'?makeCyclist(seed):makePed(seed); }
  function posePerson3D(M,dist,moving){ if(M.kind==='cyclist'){ M.phase=dist/0.75; poseCyclist(M,M.phase); } else { M.phase=dist/0.36; posePed(M,M.phase,moving); } }

  // ---------- night lighting: the participant's headlights + real light from the street lamps nearest the car ----------
  // Lamp heads, glows and pools are cheap fakes everywhere; only the ~8 lamps closest to the car get an actual point light.
  const glowTex=()=>radialTex('rgba(255,214,150,0.95)','rgba(255,214,150,0)');
  function nightRig(scene,lampPos){
    const heads=[-0.62,0.62].map(()=>{ const L=new T.SpotLight(0xfff2dc,0,80,0.24,0.6,0.9); L.castShadow=false; scene.add(L); scene.add(L.target); return L; });
    const NL=8, pts=[], glows=[], gt=glowTex();
    for(let i=0;i<NL;i++){ const L=new T.PointLight(0xffc77a,0,24,1.3); L.visible=false; scene.add(L); pts.push(L);
      const sp=new T.Sprite(new T.SpriteMaterial({map:gt,blending:T.AdditiveBlending,depthWrite:false,transparent:true,fog:false})); sp.scale.set(5,5,1); sp.visible=false; scene.add(sp); glows.push(sp); }
    let lampOn=false, headOn=false, lampK=1;
    return { set(env){ lampOn = env==='night'||env==='rain'; headOn = lampOn; lampK = env==='night'?1:0.45; },
      update(x,y,th){ const f=[Math.sin(th),Math.cos(th)], rt=[Math.cos(th),-Math.sin(th)];
        heads.forEach((L,i)=>{ const o=i?0.62:-0.62; L.intensity=headOn?(lampK>0.9?50:28):0; L.visible=headOn;
          L.position.set(x+f[0]*2.1+rt[0]*o, 0.72, -(y+f[1]*2.1+rt[1]*o)); L.target.position.set(x+f[0]*45+rt[0]*o*3, 0, -(y+f[1]*45+rt[1]*o*3)); L.target.updateMatrixWorld(); });
        if(!lampOn){ pts.forEach(L=>L.visible=false); glows.forEach(g=>g.visible=false); return; }
        const near=lampPos.map(p=>[p,(p[0]-x-f[0]*20)**2+(p[1]-y-f[1]*20)**2]).sort((a,b)=>a[1]-b[1]).slice(0,NL);
        pts.forEach((L,i)=>{ const p=near[i]&&near[i][0]; L.visible=!!p; if(p){ L.position.set(p[0],5.9,-p[1]); L.intensity=lampK*55; } });
        glows.forEach((g,i)=>{ const p=near[i]&&near[i][0]; g.visible=!!p; if(p){ g.position.set(p[0],6.0,-p[1]); g.material.opacity=lampK; } }); } }; }

  // ---------- city ----------
  function create(cfg){
    const L=cfg.layout, scene=new T.Scene();
    const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:false});
    renderer.outputColorSpace=T.SRGBColorSpace; renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=1.0;
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFSoftShadowMap; renderer.setPixelRatio(1);
    const camera=new T.PerspectiveCamera(50,2,0.3,450);
    const hemi=new T.HemisphereLight(0xcfe0f0,0x8f8478,1.2); scene.add(hemi);
    const sun=new T.DirectionalLight(0xfff1dc,2.4); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); const sc=sun.shadow.camera; sc.left=-45; sc.right=45; sc.top=45; sc.bottom=-45; sc.near=1; sc.far=160; sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.03; scene.add(sun); scene.add(sun.target);
    const facadeMats=[], lampGlows=[], pools=[];
    const [rx0,rx1]=L.road, y0=L.y0, y1=L.y1, sides=L.sides||[];
    const inSide=(y,m=0)=>sides.some(s=>y>s.y0-m && y<s.y1+m);
    const sideDir=(y,dir,m=0)=>sides.some(s=>(s.dir===0||s.dir===dir) && y>s.y0-m && y<s.y1+m);
    // ground
    const pav=pavingTex(); pav.repeat.set(160,160);
    const ground=new T.Mesh(new T.PlaneGeometry(640,640), new T.MeshStandardMaterial({map:pav,roughness:0.95,color:0xffffff})); ground.rotation.x=-Math.PI/2; ground.position.set((rx0+rx1)/2,0,-(y0+y1)/2); ground.receiveShadow=true; scene.add(ground);
    const asph=asphaltTex(); const roadMat=new T.MeshStandardMaterial({map:asph,roughness:0.92,metalness:0.0,color:0xffffff});
    const plane=(x0,x1,ya,yb,mat,h=0.01,rep)=>{ const g=new T.PlaneGeometry(x1-x0,yb-ya); const m=new T.Mesh(g,mat); m.rotation.x=-Math.PI/2; m.position.set((x0+x1)/2,h,-(ya+yb)/2); m.receiveShadow=true; scene.add(m); return m; };
    const roadRep=(x0,x1,ya,yb)=>{ const mat=roadMat.clone(); mat.map=asph.clone(); mat.map.needsUpdate=true; mat.map.repeat.set((x1-x0)/3,(yb-ya)/3); return plane(x0,x1,ya,yb,mat,0.012); };
    const roads=[roadRep(rx0,rx1,y0,y1)];
    sides.forEach(s=>{ if(s.dir<=0) roads.push(roadRep(rx0-s.len,rx0,s.y0,s.y1)); if(s.dir>=0) roads.push(roadRep(rx1,rx1+s.len,s.y0,s.y1)); });
    if(L.bike){ const bm=new T.MeshStandardMaterial({color:L.bikeColor||0x6f9c79,roughness:0.9,transparent:true,opacity:0.85}); plane(L.bike[0],L.bike[1],y0,y1,bm,0.016);
      const bt=bikeTex(), bmat=new T.MeshBasicMaterial({map:bt,transparent:true,opacity:0.85,depthWrite:false}); for(let y=Math.ceil(y0/18)*18+6;y<y1;y+=18){ if(inSide(y,2)) continue; const m=plane((L.bike[0]+L.bike[1])/2-0.55,(L.bike[0]+L.bike[1])/2+0.55,y-0.55,y+0.55,bmat,0.02); m.rotation.z=(L.bikeRot||0); } }
    const white=new T.MeshStandardMaterial({color:0xf2f2f2,roughness:0.7});
    (L.solid||[]).forEach(x=>plane(x-0.06,x+0.06,y0,y1,white,0.022));
    const dashG=new T.PlaneGeometry(0.13,1.6); dashG.rotateX(-Math.PI/2); const dashes=[]; (L.dash||[]).forEach(x=>{ for(let y=y0;y<y1;y+=3){ if(inSide(y,1)) continue; dashes.push([x,y+0.8]); } });
    const dashM=new T.InstancedMesh(dashG,white,Math.max(1,dashes.length)); const o3=new T.Object3D(); dashes.forEach(([x,y],i)=>{ o3.position.set(x,0.022,-y); o3.updateMatrix(); dashM.setMatrixAt(i,o3.matrix); }); dashM.receiveShadow=true; scene.add(dashM);
    const zebras=[]; (L.zebra||[]).forEach(z=>{ const grp=new T.Group(); for(let x=rx0+0.3;x<rx1-0.3;x+=1.0){ const g=new T.PlaneGeometry(0.5,z.y1-z.y0); const m=new T.Mesh(g,white); m.rotation.x=-Math.PI/2; m.position.set(x+0.25,0.024,-(z.y0+z.y1)/2); m.receiveShadow=true; grp.add(m); } scene.add(grp); zebras.push(grp); });
    // curbs
    const curbMat=new T.MeshStandardMaterial({color:0xcfc9bd,roughness:0.85});
    const curb=(x,ya,yb)=>{ if(yb-ya<0.2) return; const m=new T.Mesh(new T.BoxGeometry(0.22,0.14,yb-ya),curbMat); m.position.set(x,0.07,-(ya+yb)/2); m.receiveShadow=true; m.castShadow=true; scene.add(m); };
    [[rx0-0.11,-1],[rx1+0.11,1]].forEach(([x,dir])=>{ let ya=y0; const cuts=sides.filter(s=>s.dir===0||s.dir===dir).sort((a,b)=>a.y0-b.y0); cuts.forEach(s=>{ curb(x,ya,s.y0); ya=s.y1; }); curb(x,ya,y1); });
    // buildings
    const box=new T.BoxGeometry(1,1,1);
    function building(cx,cy,wAlong,depth,alongX,facing,col,floors,seed){ // facing: +x,-x,+y,-y (world)
      const ft=facadeTex(col,floors,seed%4), H=ft.Hm;
      const fm=new T.MeshStandardMaterial({map:ft.map,emissiveMap:ft.emissive,emissive:0xffffff,emissiveIntensity:0,roughness:0.92}); facadeMats.push(fm);
      const wall=new T.MeshStandardMaterial({color:new T.Color(col).multiplyScalar(0.82),roughness:0.95}), roof=new T.MeshStandardMaterial({color:0x5a4a42,roughness:0.9});
      // box faces: [+x,-x,+y(up),-y(down),+z(=world -y),-z(=world +y)]
      const mats=[wall,wall,roof,roof,wall,wall]; const idx={'+x':0,'-x':1,'-y':4,'+y':5}[facing]; mats[idx]=fm;
      const m=new T.Mesh(box,mats); if(alongX) m.scale.set(wAlong,H,depth); else m.scale.set(depth,H,wAlong); m.position.set(cx,H/2,-cy); m.castShadow=true; m.receiveShadow=true; scene.add(m); }
    let bi=0;
    [[L.buildL,-1],[L.buildR,1]].forEach(([bx,sd])=>{ for(let y=Math.floor(y0/14)*14; y<y1; y+=14){ if(sides.some(q=>(q.dir===0||q.dir===sd) && y<q.y1+2 && y+14>q.y0-2)) continue; const floors=4+Math.floor(hash(bi*7+sd)*3), col=PALETTE[Math.floor(hash(bi*3+sd*5)*PALETTE.length)];
      building(bx+sd*6,y+7,14,12,false,sd<0?'+x':'-x',col,floors,bi); bi++; } });
    sides.forEach(s=>{ [-1,1].forEach(dir=>{ if(s.dir!==0&&s.dir!==dir) return; const xs=dir<0?L.buildL:L.buildR; for(let k=0;k<(s.len/14|0);k++){ const x=xs+dir*(12+7+k*14); const floors=4+Math.floor(hash(bi*5)*3), col=PALETTE[Math.floor(hash(bi*11)*PALETTE.length)];
        building(x,s.y0-2-6,14,12,true,'+y',col,floors,bi); bi++; building(x,s.y1+2+6,14,12,true,'-y',PALETTE[Math.floor(hash(bi*11)*PALETTE.length)],4+Math.floor(hash(bi*5)*3),bi); bi++; } }); });
    // trees (instanced)
    const trees=[]; const tx=[rx0-(L.treeOff||2.2), rx1+(L.treeOff||2.2)];
    tx.forEach((x,i)=>{ const dir=i?1:-1; for(let y=Math.ceil(y0/9)*9+2; y<y1; y+=9){ if(sideDir(y,dir,3)) continue; trees.push([x,y]); } });
    sides.forEach(s=>[-1,1].forEach(dir=>{ if(s.dir!==0&&s.dir!==dir) return; for(let k=1;k<s.len/9;k++){ const x=(dir<0?rx0:rx1)+dir*(k*9+2); trees.push([x,s.y0-1.6]); trees.push([x,s.y1+1.6]); } }));
    const trunkG=new T.CylinderGeometry(0.13,0.2,3.4,7); trunkG.translate(0,1.7,0); const trunkM=new T.MeshStandardMaterial({color:0x6b5a48,roughness:0.95});
    const blobG=new T.IcosahedronGeometry(1.5,1); const leafM=new T.MeshStandardMaterial({color:0xffffff,roughness:0.9,flatShading:true});
    const trunks=new T.InstancedMesh(trunkG,trunkM,trees.length), blobs=new T.InstancedMesh(blobG,leafM,trees.length*5); trunks.castShadow=blobs.castShadow=true; trunks.receiveShadow=blobs.receiveShadow=true;
    const leafCols=[0x4f6f3c,0x5d7a43,0x445f34,0x6a8448];
    trees.forEach(([x,y],i)=>{ o3.position.set(x,0,-y); o3.rotation.set(0,0,0); o3.scale.set(1,1,1); o3.updateMatrix(); trunks.setMatrixAt(i,o3.matrix);
      [[0,4.6,0,1.25],[-0.9,4.1,0.3,0.95],[0.9,4.2,-0.2,1.0],[0.2,5.4,0.4,0.85],[-0.3,4.5,-0.9,0.9]].forEach(([dx,dy,dz,k],j)=>{ o3.position.set(x+dx,dy,-y+dz); o3.rotation.set(hash(i+j),hash(i*2+j),0); const kk=k*(0.85+hash(i*5+j)*0.3); o3.scale.set(kk,kk*0.85,kk); o3.updateMatrix(); blobs.setMatrixAt(i*5+j,o3.matrix); blobs.setColorAt(i*5+j,new T.Color(leafCols[(i+j)%4])); }); });
    scene.add(trunks,blobs);
    // street lamps
    const lampX=[rx0-0.55, rx1+0.55]; const poleG=new T.CylinderGeometry(0.07,0.09,6.3,8); poleG.translate(0,3.15,0); const armG=new T.BoxGeometry(1.2,0.08,0.08); const headG=new T.BoxGeometry(0.5,0.14,0.26);
    const poleM=new T.MeshStandardMaterial({color:0x2e3036,roughness:0.6,metalness:0.4}); const headM=new T.MeshStandardMaterial({color:0xd8dadf,emissive:0xffd9a0,emissiveIntensity:0});
    const glowT=radialTex('rgba(255,214,150,0.9)','rgba(255,214,150,0)'), poolT=canvasTex(128,128,(g)=>{ const r=g.createRadialGradient(64,64,1,64,64,64); r.addColorStop(0,'rgba(255,205,140,0.6)'); r.addColorStop(0.45,'rgba(255,205,140,0.22)'); r.addColorStop(0.85,'rgba(255,200,130,0)'); r.addColorStop(1,'rgba(255,200,130,0)'); g.fillStyle=r; g.fillRect(0,0,128,128); });
    const lamps=[], lampPos=[]; lampX.forEach((x,i)=>{ const dir=i?1:-1; for(let y=Math.ceil(y0/18)*18+4.5;y<y1;y+=18){ if(sideDir(y,dir,2)) continue; lamps.push([x,y,dir]); } });
    lamps.forEach(([x,y,dir])=>{ lampPos.push([x-dir*1.05,y]); const pole=new T.Mesh(poleG,poleM); pole.position.set(x,0,-y); pole.castShadow=true; scene.add(pole);
      const arm=new T.Mesh(armG,poleM); arm.position.set(x-dir*0.55,6.25,-y); scene.add(arm); const head=new T.Mesh(headG,headM); head.position.set(x-dir*1.05,6.15,-y); scene.add(head);
      const sp=new T.Sprite(new T.SpriteMaterial({map:glowT,blending:T.AdditiveBlending,depthWrite:false,transparent:true})); sp.position.set(x-dir*1.05,6.05,-y); sp.scale.set(4.2,4.2,1); sp.visible=false; scene.add(sp); lampGlows.push(sp);
      const pm=new T.Mesh(new T.PlaneGeometry(11,11), new T.MeshBasicMaterial({map:poolT,fog:false,blending:T.AdditiveBlending,depthWrite:false,transparent:true})); pm.rotation.x=-Math.PI/2; pm.position.set(x-dir*1.05,0.03,-y); pm.visible=false; scene.add(pm); pools.push(pm); });
    const rig=nightRig(scene,lampPos);
    // parked cars pool
    const parked=[]; const PC=[0x111215];
    function setParked(list){ while(parked.length<list.length){ const c=makeCar(PC[parked.length%PC.length]); scene.add(c); parked.push(c); }
      parked.forEach((c,i)=>{ const p=list[i]; c.visible=!!p; if(p){ c.position.set(p.x,0,-p.y); c.rotation.y=-(p.theta||0); } }); }
    // sky backgrounds + env maps
    const pmrem=new T.PMREMGenerator(renderer); const envCache={};
    function envFor(env,top,mid,bot){ if(envCache[env]) return envCache[env]; const s=new T.Scene(); const geo=new T.SphereGeometry(50,32,16); const mat=new T.MeshBasicMaterial({side:T.BackSide,map:skyTex(top,mid,bot)}); s.add(new T.Mesh(geo,mat)); const ground=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshBasicMaterial({color:bot})); ground.rotation.x=-Math.PI/2; ground.position.y=-2; s.add(ground);
      return envCache[env]=pmrem.fromScene(s,0.04).texture; }
    const ENVS={
      day:{sky:['#7E9BBE','#BFD0E0','#E6E4DE'],fog:0xD2D8DE,fogN:45,fogF:260,hemi:[0xcfe0f0,0x8f8478,1.15],sun:[0xfff1dc,2.6],shadow:true,win:0,lamp:false,road:[0.92,0],exp:1.0},
      night:{sky:['#07080F','#141726','#3A2E2C'],fog:0x15161D,fogN:25,fogF:180,hemi:[0x34406a,0x16120e,0.4],sun:[0x8fa4ff,0.18],shadow:false,win:1.8,lamp:true,road:[0.75,0.05],exp:1.1},
      rain:{sky:['#59626F','#8B949F','#A3A7AB'],fog:0x8D95A0,fogN:15,fogF:140,hemi:[0xa9b4c2,0x4a4a4a,1.0],sun:[0xd8e0ea,0.35],shadow:false,win:0.5,lamp:true,road:[0.25,0.25],exp:1.0},
    };
    let curEnv=null;
    function setEnv(env){ if(env===curEnv) return; curEnv=env; const E=ENVS[env];
      scene.background=skyTex(...E.sky); scene.fog=new T.Fog(E.fog,E.fogN,E.fogF); scene.environment=envFor(env,...E.sky); scene.environmentIntensity=env==='night'?0.25:0.6;
      hemi.color.set(E.hemi[0]); hemi.groundColor.set(E.hemi[1]); hemi.intensity=E.hemi[2]; sun.color.set(E.sun[0]); sun.intensity=E.sun[1]; sun.castShadow=E.shadow;
      facadeMats.forEach(m=>m.emissiveIntensity=E.win); headM.emissiveIntensity=E.lamp?7:0; headMat.emissiveIntensity=E.lamp?4:0.3; rig.set(env); lampGlows.forEach(s=>{ s.visible=E.lamp; s.material.opacity=env==='night'?1:0.45; }); pools.forEach(p=>{ p.visible=E.lamp; p.material.opacity=env==='night'?1:0.35; });
      roads.forEach(r=>{ r.material.roughness=E.road[0]; r.material.metalness=E.road[1]; }); tailMat.emissiveIntensity=env==='night'?1.6:0.6; renderer.toneMappingExposure=E.exp; }
    function setFocus(x,y){ sun.position.set(x+28,40,-y+16); sun.target.position.set(x,0,-y); sun.target.updateMatrixWorld(); }
    // pinhole camera with focal length f (px) and principal point (cx,cy) for an output of w×h px
    function setPinhole(w,h,f,cx,cy){ const fw=2*Math.max(cx,w-cx)+2, fh=2*Math.max(cy,h-cy)+2; camera.aspect=fw/fh; camera.fov=2*Math.atan(fh/2/f)*180/Math.PI; camera.setViewOffset(fw,fh,fw/2-cx,fh/2-cy,w,h); camera.updateProjectionMatrix(); }
    function setSize(w,h){ const c=renderer.domElement; if(c.width!==w||c.height!==h) renderer.setSize(w,h,false); }
    function project(x,y,z,w,h){ const v=P(x,y,z).project(camera); return [(v.x+1)/2*w,(1-v.y)/2*h,v.z]; }
    function render(){ renderer.render(scene,camera); return renderer.domElement; }
    setFocus((rx0+rx1)/2,(y0+y1)/2); setEnv(cfg.env||'day');
    return {T,scene,camera,renderer,setEnv,setFocus,setPinhole,setSize,render,project,setParked,makeCar,zebras,P,makePerson3D,posePerson3D,night:rig};
  }

  // ---------- finite city grid for participant driving ----------
  // Every road is a one-way avenue: [passing lane | ego lane | bike lane | parking] measured from its axis (the ego lane centre)
  // to the right of travel. Directions alternate road by road; static geometry is instanced per 240 m tile so it culls.
  function createGrid(cfg){
    const G=cfg.grid, Ln=cfg.lane, ROADS=cfg.roads, B=G.B, N=G.N, EXT=G.EXT, scene=new T.Scene();
    const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:false});
    renderer.outputColorSpace=T.SRGBColorSpace; renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=1.0;
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFShadowMap; renderer.setPixelRatio(1);
    const camera=new T.PerspectiveCamera(50,2,0.3,450);
    const hemi=new T.HemisphereLight(0xcfe0f0,0x8f8478,1.2); scene.add(hemi);
    const sun=new T.DirectionalLight(0xfff1dc,2.4); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); const sc=sun.shadow.camera; sc.left=-45; sc.right=45; sc.top=45; sc.bottom=-45; sc.near=1; sc.far=160; sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.03; scene.add(sun); scene.add(sun.target);
    const o3=new T.Object3D(); const TILE=320, batches={};
    const mat4=(x,y,z,rot,sx,sy,sz)=>{ o3.position.set(x,z,-y); o3.rotation.set(0,rot,0); o3.scale.set(sx,sy,sz); o3.updateMatrix(); return o3.matrix.clone(); };
    function inst(key,geo,mat,x,y,m,color,opts){ const k=Math.floor(x/TILE)+','+Math.floor(y/TILE)+'|'+key; let b=batches[k]; if(!b) b=batches[k]={geo,mat,list:[],colors:[],opts:opts||{}}; b.list.push(m); if(color!==undefined) b.colors.push(color); }
    // road frame: origin on the ego-lane line (centre + EGO to the right of travel), s forward, l to the right
    const fv=R=>R.t==='v'?[0,R.d]:[R.d,0], rv=R=>R.t==='v'?[R.d,0]:[0,-R.d], cv=R=>R.t==='v'?[R.k*B,0]:[0,R.k*B];
    const ov=R=>{ const c=cv(R), r=rv(R); return [c[0]+r[0]*Ln.ego, c[1]+r[1]*Ln.ego]; };
    const P=(R,s,l)=>{ const f=fv(R),r=rv(R),o=ov(R); return [o[0]+f[0]*s+r[0]*l, o[1]+f[1]*s+r[1]*l]; };
    const rotOf=R=>{ const f=fv(R); return -Math.atan2(f[0],f[1]); };
    const flat=new T.PlaneGeometry(1,1); flat.rotateX(-Math.PI/2);
    const white=new T.MeshStandardMaterial({color:0xf2f2f2,roughness:0.7}), green=new T.MeshStandardMaterial({color:0x6f9c79,roughness:0.9});
    const bmat=new T.MeshBasicMaterial({map:bikeTex(),transparent:true,opacity:0.85,depthWrite:false});
    const curbMat=new T.MeshStandardMaterial({color:0xcfc9bd,roughness:0.85}), unitBox=new T.BoxGeometry(1,1,1);
    const span=(N-1)*B, pav=pavingTex(); pav.repeat.set(220,220);
    const ground=new T.Mesh(new T.PlaneGeometry(span+700,span+700), new T.MeshStandardMaterial({map:pav,roughness:0.95})); ground.rotation.x=-Math.PI/2; ground.position.set(span/2,0,-span/2); ground.receiveShadow=true; scene.add(ground);
    const asph=asphaltTex(); const roadMats=[];
    function asphalt(x0,x1,y0,y1,h){ const mat=new T.MeshStandardMaterial({map:asph.clone(),roughness:0.92,color:0xffffff}); mat.map.needsUpdate=true; mat.map.repeat.set((x1-x0)/3,(y1-y0)/3); roadMats.push(mat);
      const m=new T.Mesh(new T.PlaneGeometry(x1-x0,y1-y0),mat); m.rotation.x=-Math.PI/2; m.position.set((x0+x1)/2,h,-(y0+y1)/2); m.receiveShadow=true; scene.add(m); }
    const half=(Ln.road[1]-Ln.road[0])/2;
    // the physical roads are given with d=+1, so s is simply the coordinate along the road's axis
    const bandsOn=R=>ROADS.filter(Q=>Q.t!==R.t).map(Q=>[Q.k*B-half,Q.k*B+half]).sort((a,b)=>a[0]-b[0]);
    const buildRoads=()=>ROADS.forEach(R=>{ const bands=bandsOn(R), rot=rotOf(R);
      if(R.t==='v') asphalt(R.k*B-half,R.k*B+half,-EXT,span+EXT,0.012);
      else { const cuts=[[-EXT-1,-EXT],...bands,[span+EXT,span+EXT+1]]; for(let i=0;i<cuts.length-1;i++){ const a=cuts[i][1], b=cuts[i+1][0]; if(b>a) asphalt(a,b,R.k*B-half,R.k*B+half,0.012); } }
      const cuts=[[-EXT-1,-EXT],...bands,[span+EXT,span+EXT+1]];
      for(let i=0;i<cuts.length-1;i++){ const sa=cuts[i][1], sb=cuts[i+1][0], len=sb-sa, sm=(sa+sb)/2; if(len<2) continue;
        const put=(key,geo,mat,l,w,h,y,ln,s,opts,rr)=>{ const p=P(R,s===undefined?sm:s,l); inst(key,geo,mat,p[0],p[1],mat4(p[0],p[1],y,rot+(rr||0),w,h,ln===undefined?len:ln),undefined,opts); };
        Ln.bikes.forEach(([a,b],bi2)=>{ put('bike',flat,green,(a+b)/2,b-a,1,0.016,undefined,undefined,{recv:1});
          for(let s=sa+6;s<sb-3;s+=18) put('bsym',flat,bmat,(a+b)/2,1.1,1,0.02,1.1,s,undefined,bi2?Math.PI:0); });
        Ln.solid.forEach(l=>put('line',flat,white,l,0.12,1,0.022,undefined,undefined,{recv:1}));
        for(let s=sa+1;s<sb-1.6;s+=3) put('dash',flat,white,Ln.centre,0.14,1,0.022,1.6,s+0.8,{recv:1});
        [Ln.road[0]-0.11,Ln.road[1]+0.11].forEach(l=>put('curb',unitBox,curbMat,l,0.22,0.14,0.07,undefined,undefined,{cast:1,recv:1}));
        Ln.parks.forEach(([l,dir])=>{ for(let s=sa+5;s<sb-4;s+=6.5){ const p=P(R,s,l); parkedCar(p[0],p[1],rot+(dir<0?Math.PI:0)); } });
        [Ln.road[0]-2.2,Ln.road[1]+2.2].forEach(l=>{ for(let s=sa+4;s<sb-3;s+=12){ const p=P(R,s,l); tree(p[0],p[1]); } });
        [[Ln.road[0]-0.55,-1],[Ln.road[1]+0.55,1]].forEach(([l,sd])=>{ for(let s=sa+8;s<sb-4;s+=26){ const p=P(R,s,l), q=P(R,s,l-sd*1.05); lamp(p[0],p[1],q[0],q[1],rot+(sd>0?Math.PI/2:-Math.PI/2)); } });
      }
      // dead ends: a wall of buildings across both road ends
      [[-EXT,1],[span+EXT,-1]].forEach(([s0,face])=>{ const l0=Ln.road[0]-Ln.walk, l1=Ln.road[1]+Ln.walk, n=Math.max(2,Math.round((l1-l0)/12)), w=(l1-l0)/n, f=fv(R);
        for(let q=0;q<n;q++){ const p=P(R,s0,l0+w*(q+0.5)); bld(p[0],p[1],f[0]*face,f[1]*face,w); } });
    });
    // parked cars: instanced parts of a template car
    const tpl=makeCar(0x111215); tpl.updateMatrixWorld(true); const parts=[]; tpl.traverse(m=>{ if(m.isMesh) parts.push({geo:m.geometry,mat:m.material,local:m.matrixWorld.clone()}); });
    function parkedCar(x,y,rot){ const M=mat4(x,y,0,rot,1,1,1); parts.forEach(pt=>inst('car'+pt.geo.uuid+pt.mat.uuid,pt.geo,pt.mat,x,y,M.clone().multiply(pt.local),undefined,{cast:1,recv:1})); }
    // trees
    const trunkG=new T.CylinderGeometry(0.13,0.2,3.4,7); trunkG.translate(0,1.7,0); const trunkM=new T.MeshStandardMaterial({color:0x6b5a48,roughness:0.95});
    const blobG=new T.IcosahedronGeometry(1.5,1); const leafM=new T.MeshStandardMaterial({color:0xffffff,roughness:0.9,flatShading:true}); const leafCols=[0x4f6f3c,0x5d7a43,0x445f34,0x6a8448]; let ti=0;
    function tree(x,y){ ti++; inst('trunk',trunkG,trunkM,x,y,mat4(x,y,0,0,1,1,1),undefined,{cast:1});
      [[0,4.5,0,1.35],[-0.8,4.0,0.3,1.0],[0.7,4.3,-0.3,1.05]].forEach(([dx,dz,dy,k],j)=>{ const kk=k*(0.85+hash(ti*5+j)*0.3); o3.position.set(x+dx,dz,-(y+dy)); o3.rotation.set(hash(ti+j),hash(ti*2+j),0); o3.scale.set(kk,kk*0.85,kk); o3.updateMatrix();
        inst('leaf',blobG,leafM,x,y,o3.matrix.clone(),new T.Color(leafCols[(ti+j)%4]),{cast:1,recv:1}); }); }
    // lamps (glow pools only at night / rain)
    const poleG=new T.CylinderGeometry(0.07,0.09,6.3,8); poleG.translate(0,3.15,0); const armG=new T.BoxGeometry(0.08,0.08,1.2), headG=new T.BoxGeometry(0.26,0.14,0.5);
    const poleM=new T.MeshStandardMaterial({color:0x2e3036,roughness:0.6,metalness:0.4}), headM=new T.MeshStandardMaterial({color:0xd8dadf,emissive:0xffd9a0,emissiveIntensity:0});
    const poolT=canvasTex(128,128,(g)=>{ const r=g.createRadialGradient(64,64,1,64,64,64); r.addColorStop(0,'rgba(255,205,140,0.6)'); r.addColorStop(0.45,'rgba(255,205,140,0.22)'); r.addColorStop(0.85,'rgba(255,200,130,0)'); r.addColorStop(1,'rgba(255,200,130,0)'); g.fillStyle=r; g.fillRect(0,0,128,128); });
    const poolM=new T.MeshBasicMaterial({map:poolT,fog:false,blending:T.AdditiveBlending,depthWrite:false,transparent:true});
    const lampPos=[];
    function lamp(x,y,hx,hy,rot){ lampPos.push([hx,hy]); inst('pole',poleG,poleM,x,y,mat4(x,y,0,0,1,1,1),undefined,{cast:1});
      inst('arm',armG,poleM,x,y,mat4((x+hx)/2,(y+hy)/2,6.25,rot,1,1,1)); inst('lhead',headG,headM,x,y,mat4(hx,hy,6.15,rot,1,1,1)); inst('pool',flat,poolM,x,y,mat4(hx,hy,0.03,0,11,1,11),undefined,{pool:1}); }
    // buildings around every block (instanced per facade variant)
    const avX=k=>[k*B-half,k*B+half], stY=k=>[k*B-half,k*B+half];
    const SW=Ln.walk, facadeMats=[], combos={}; let bi=0;
    function comboMats(col,floors,seed){ const k=col+floors+seed; if(combos[k]) return combos[k]; const ft=facadeTex(col,floors,seed);
      const fm=new T.MeshStandardMaterial({map:ft.map,emissiveMap:ft.emissive,emissive:0xffffff,emissiveIntensity:0,roughness:0.92}); facadeMats.push(fm);
      const wall=new T.MeshStandardMaterial({color:new T.Color(col).multiplyScalar(0.82),roughness:0.95}), roof=new T.MeshStandardMaterial({color:0x5a4a42,roughness:0.9});
      return combos[k]={mats:[wall,wall,roof,roof,fm,wall],H:ft.Hm,key:'b'+k}; }
    function bld(x,y,fx,fy,w){ bi++; const v=Math.floor(hash(bi*3)*8), col=PALETTE[v], floors=4+(v%3), C=comboMats(col,floors,v%2);
      const rot=Math.atan2(fx,-fy); inst(C.key,unitBox,C.mats,x,y,mat4(x-fx*6,y-fy*6,C.H/2,rot,w,C.H,12),undefined,{cast:1,recv:1}); }
    for(let i=-1;i<N;i++) for(let j=-1;j<N;j++){
      const x0=i>=0?avX(i)[1]+SW:-EXT-12, x1=i+1<N?avX(i+1)[0]-SW:span+EXT+12, y0=j>=0?stY(j)[1]+SW:-EXT-12, y1=j+1<N?stY(j+1)[0]-SW:span+EXT+12;
      const row=(a,b,cb)=>{ const n=Math.max(1,Math.floor((b-a)/14)), w=(b-a)/n; for(let q=0;q<n;q++) cb(a+w*(q+0.5),w); };
      if(j>=0) row(x0,x1,(x,w)=>bld(x,y0,0,-1,w)); if(j+1<N) row(x0,x1,(x,w)=>bld(x,y1,0,1,w));
      if(i>=0) row(y0+12,y1-12,(y,w)=>bld(x0,y,-1,0,w)); if(i+1<N) row(y0+12,y1-12,(y,w)=>bld(x1,y,1,0,w)); }
    buildRoads();
    // build the instanced meshes
    const pools=[], rig=nightRig(scene,lampPos);
    Object.values(batches).forEach(b=>{ const m=new T.InstancedMesh(b.geo,b.mat,b.list.length); b.list.forEach((M,i)=>m.setMatrixAt(i,M)); if(b.colors.length) b.colors.forEach((c,i)=>m.setColorAt(i,c));
      m.castShadow=!!b.opts.cast; m.receiveShadow=!!b.opts.recv; m.computeBoundingSphere(); if(b.opts.pool){ m.visible=false; pools.push(m); } scene.add(m); });
    // sky + env (same looks as the scripted street)
    const pmrem=new T.PMREMGenerator(renderer); const envCache={};
    function envFor(env,top,mid,bot){ if(envCache[env]) return envCache[env]; const s=new T.Scene(); s.add(new T.Mesh(new T.SphereGeometry(50,32,16),new T.MeshBasicMaterial({side:T.BackSide,map:skyTex(top,mid,bot)}))); return envCache[env]=pmrem.fromScene(s,0.04).texture; }
    const ENVS={
      day:{sky:['#7E9BBE','#BFD0E0','#E6E4DE'],fog:0xD2D8DE,fogN:45,fogF:260,hemi:[0xcfe0f0,0x8f8478,1.15],sun:[0xfff1dc,2.6],shadow:true,win:0,lamp:false,road:[0.92,0],exp:1.0},
      night:{sky:['#07080F','#141726','#3A2E2C'],fog:0x15161D,fogN:25,fogF:180,hemi:[0x34406a,0x16120e,0.4],sun:[0x8fa4ff,0.18],shadow:false,win:1.8,lamp:true,road:[0.75,0.05],exp:1.1},
      rain:{sky:['#59626F','#8B949F','#A3A7AB'],fog:0x8D95A0,fogN:15,fogF:140,hemi:[0xa9b4c2,0x4a4a4a,1.0],sun:[0xd8e0ea,0.35],shadow:false,win:0.5,lamp:true,road:[0.25,0.25],exp:1.0},
    };
    let curEnv=null;
    function setEnv(env){ if(env===curEnv) return; curEnv=env; const E=ENVS[env];
      scene.background=skyTex(...E.sky); scene.fog=new T.Fog(E.fog,E.fogN,E.fogF); scene.environment=envFor(env,...E.sky); scene.environmentIntensity=env==='night'?0.25:0.6;
      hemi.color.set(E.hemi[0]); hemi.groundColor.set(E.hemi[1]); hemi.intensity=E.hemi[2]; sun.color.set(E.sun[0]); sun.intensity=E.sun[1]; sun.castShadow=E.shadow;
      facadeMats.forEach(m=>m.emissiveIntensity=E.win); headM.emissiveIntensity=E.lamp?7:0; headMat.emissiveIntensity=E.lamp?4:0.3; rig.set(env); pools.forEach(p=>p.visible=E.lamp); poolM.opacity=env==='night'?1:0.35;
      roadMats.forEach(m=>{ m.roughness=E.road[0]; m.metalness=E.road[1]; }); tailMat.emissiveIntensity=env==='night'?1.6:0.6; renderer.toneMappingExposure=E.exp; }
    function setFocus(x,y){ sun.position.set(x+28,40,-y+16); sun.target.position.set(x,0,-y); sun.target.updateMatrixWorld(); }
    function setPinhole(w,h,f,cx,cy){ const fw=2*Math.max(cx,w-cx)+2, fh=2*Math.max(cy,h-cy)+2; camera.aspect=fw/fh; camera.fov=2*Math.atan(fh/2/f)*180/Math.PI; camera.setViewOffset(fw,fh,fw/2-cx,fh/2-cy,w,h); camera.updateProjectionMatrix(); }
    function setSize(w,h){ const c=renderer.domElement; if(c.width!==w||c.height!==h) renderer.setSize(w,h,false); }
    function project(x,y,z,w,h){ const v=new T.Vector3(x,z||0,-y).project(camera); return [(v.x+1)/2*w,(1-v.y)/2*h,v.z]; }
    function render(){ renderer.render(scene,camera); return renderer.domElement; }
    setFocus(span/2,span/2); setEnv(cfg.env||'day');
    return {T,scene,camera,renderer,setEnv,setFocus,setPinhole,setSize,render,project,setParked:()=>{},makeCar,zebras:[],makePerson3D,posePerson3D,night:rig,instCount:Object.keys(batches).length};
  }
  return {create,createGrid,makeCar,makePerson3D,posePerson3D};
})();
