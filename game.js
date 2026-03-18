/* ================================================================
   PABRIK GULA NIRMALA — v7 GAME ENGINE
   Studio Gelap Interactive
   Major overhaul: dual enemies, 3D audio, note system, expanded
   horror, sanity mechanics, win screen, settings, better AI
================================================================ */
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer }      from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }          from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }     from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass }          from 'three/addons/postprocessing/ShaderPass.js';

/* ================================================================
   POST-PROCESS SHADER — Film grain + CA + sanity warp + pulse
================================================================ */
const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime:    { value: 0 },
    uCA:      { value: 0.0012 },
    uGrain:   { value: 0.028 },
    uVig:     { value: 0.32 },
    uWarp:    { value: 0.0 },
    uScan:    { value: 0.030 },
    uPulse:   { value: 0.0 },
    uTint:    { value: new THREE.Vector3(1,1,1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime,uCA,uGrain,uVig,uWarp,uScan,uPulse;
    uniform vec3 uTint;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    void main(){
      vec2 uv=vUv;
      if(uWarp>0.001){
        float wx=sin(uv.y*22.0+uTime*2.1)*uWarp*0.038;
        float wy=cos(uv.x*18.0+uTime*1.6)*uWarp*0.022;
        uv+=vec2(wx,wy); uv=clamp(uv,0.,1.);
      }
      vec2 center=uv-0.5;
      float dist=length(center);
      vec2 aberr=normalize(center)*uCA*dist*dist*9.0;
      float r=texture2D(tDiffuse,uv+aberr).r;
      float g=texture2D(tDiffuse,uv).g;
      float b=texture2D(tDiffuse,uv-aberr).b;
      float grain=(hash(uv+fract(uTime*0.07173))-0.5)*uGrain;
      float vig=1.0-uVig*pow(dist*2.0,2.8); vig=clamp(vig,0.,1.);
      float scan=1.0-uScan*step(0.5,fract(vUv.y*500.0));
      float pulse=1.0-uPulse*pow(dist*2.2,2.2);
      gl_FragColor=vec4(
        (r+grain)*vig*scan*uTint.r*pulse,
        (g+grain)*vig*scan*uTint.g*pulse,
        (b+grain)*vig*scan*uTint.b*pulse,
        1.0);
    }
  `
};

/* ================================================================
   PBR TEXTURE GENERATOR
================================================================ */
const TEXS = {};
function makeTex(type, sz=256) {
  const mkC = () => { const c=document.createElement('canvas'); c.width=c.height=sz; return c.getContext('2d',{willReadFrequently:true}); };
  const ctxC=mkC(), ctxN=mkC(), ctxR=mkC();
  const imgC=ctxC.createImageData(sz,sz), imgN=ctxN.createImageData(sz,sz), imgR=ctxR.createImageData(sz,sz);
  const buf=new Float32Array(sz*sz);
  for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){
    buf[y*sz+x]=(Math.sin(x*0.09)+Math.cos(y*0.09))*0.18+(Math.sin(x*0.23+y*0.17))*0.14+(Math.sin(x*0.61)*Math.cos(y*0.55))*0.10+(Math.sin(x*1.45+0.7)*Math.sin(y*1.38))*0.06+Math.random()*0.52;
  }
  for(let y=1;y<sz-1;y++) for(let x=1;x<sz-1;x++){
    const i=y*sz+x, by=i*4, v=buf[i];
    const dx=buf[i+1]-buf[i-1], dy=buf[(y+1)*sz+x]-buf[(y-1)*sz+x];
    imgN.data[by]=128+dx*200; imgN.data[by+1]=128+dy*200; imgN.data[by+2]=255; imgN.data[by+3]=255;
    let cr=0,cg=0,cb2=0,rough=200;
    if(type==='concrete'){const c2=v*165+50;cr=c2*0.87;cg=c2*0.89;cb2=c2*0.83;rough=v>0.80?30:210;}
    else if(type==='metal'){const rust=v>0.52;if(rust){cr=112-v*40;cg=46-v*18;cb2=16;rough=248;}else{cr=52;cg=55;cb2=64;rough=72;}}
    else if(type==='hazard'){const s=((x+y)%56)<28;cr=s?215:14;cg=s?148:14;cb2=14;rough=130;}
    else if(type==='wood'){const ring=Math.sin(Math.hypot(x-sz/2,y-sz/2)*0.28+v*2.5);const c2=58+ring*26+v*36;cr=c2+22;cg=c2+8;cb2=Math.max(0,c2-18);rough=185+ring*25;}
    else if(type==='rubber'){const c2=v*22;cr=cg=cb2=c2;rough=248;}
    else if(type==='tile'){const grout=(x%18<1)||(y%18<1);const c2=grout?28:(v*38+148+((Math.floor(x/18)+Math.floor(y/18))%2)*12);cr=c2;cg=c2*0.96;cb2=c2*0.91;rough=grout?245:75;}
    else if(type==='plaster'){const c2=v*80+155;cr=c2*0.92;cg=c2*0.90;cb2=c2*0.87;rough=230;}
    else if(type==='grime'){const c2=v*35+10;cr=c2*0.95;cg=c2*0.80;cb2=c2*0.65;rough=245;}
    imgC.data[by]=Math.max(0,Math.min(255,cr)); imgC.data[by+1]=Math.max(0,Math.min(255,cg));
    imgC.data[by+2]=Math.max(0,Math.min(255,cb2)); imgC.data[by+3]=255;
    imgR.data[by]=imgR.data[by+1]=imgR.data[by+2]=Math.max(0,Math.min(255,rough)); imgR.data[by+3]=255;
  }
  ctxC.putImageData(imgC,0,0); ctxN.putImageData(imgN,0,0); ctxR.putImageData(imgR,0,0);
  const wrapTex=(ctx,rep=8)=>{ const t=new THREE.CanvasTexture(ctx.canvas); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rep,rep); t.anisotropy=8; t.colorSpace=THREE.SRGBColorSpace; return t; };
  return {c:wrapTex(ctxC),n:wrapTex(ctxN),r:wrapTex(ctxR)};
}

/* ================================================================
   RENDERER
================================================================ */
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance', logarithmicDepthBuffer:true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.insertBefore(renderer.domElement, document.body.firstChild);
renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:1';

/* ================================================================
   SCENE & CAMERAS
================================================================ */
const scene   = new THREE.Scene();
scene.background = new THREE.Color(0x020508);
scene.fog = new THREE.FogExp2(0x030710, 0.0095);

const camGame = new THREE.PerspectiveCamera(74, innerWidth/innerHeight, 0.12, 150);
camGame.position.set(0, 1.75, 55);

const camCut  = new THREE.PerspectiveCamera(68, innerWidth/innerHeight, 0.12, 150);

/* ================================================================
   POST-PROCESSING
================================================================ */
const composer   = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camGame);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight), 0.55, 0.42, 0.88);
composer.addPass(bloom);
const filmPass = new ShaderPass(FilmShader);
composer.addPass(filmPass);

function setActiveCamera(cam) { renderPass.camera = cam; }
setActiveCamera(camGame);

/* ================================================================
   LIGHTING
================================================================ */
const hemi = new THREE.HemisphereLight(0x152235, 0x050809, 0.85);
scene.add(hemi);

// Main flashlight
const flash = new THREE.SpotLight(0xfff6e0, 2800, 80, Math.PI/3.6, 0.70, 1.3);
flash.castShadow = true;
flash.shadow.mapSize.set(1024,1024);
flash.shadow.bias = -0.0012;
const flashTarget = new THREE.Object3D();
scene.add(flash, flashTarget);
flash.target = flashTarget;

// Ambient fill (very dim)
const ambFill = new THREE.PointLight(0x080810, 12, 40, 2);
ambFill.position.set(0, 10, 0);
scene.add(ambFill);

/* ================================================================
   GAME STATE
================================================================ */
const G = {
  flashOn:     true,
  flashBatt:   100,
  stamina:     100,
  sanity:      100,
  hp:          100,
  crouching:   false,
  inv:         [null, null, null, null],
  missionDone: false,
  horrorOn:    false,
  horrorT:     0,
  escaped:     false,
  _caughtOnce: false,
  _hmsg:       false,
  _hmsg2:      false,
  _hmsg3:      false,
  startTime:   Date.now(),
  stepsTotal:  0,
  notesFound:  0,
  keys: { w:false, a:false, s:false, d:false, shift:false, c:false },
  vel:  new THREE.Vector2(0,0),
  bobAngle: 0,
  lastFoot: 0,
  enemyNear: false,
  lastDamageT: 0,
  // Settings
  sfxVol: 0.38,
  mouseSens: 0.8,
};

/* ================================================================
   WORLD STORAGE
================================================================ */
const colBoxes  = [];
const actorList = [];
const pickList  = [];
const lampList  = [];
const fanList   = [];
const convList  = [];
const steamList = [];
const doorList  = [];
const MATS = {};

function regCol(mesh) { mesh.updateMatrixWorld(true); colBoxes.push(new THREE.Box3().setFromObject(mesh)); }
function box(geo, mat, px,py,pz, rx=0,ry=0,rz=0, opts={}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(px,py,pz); m.rotation.set(rx,ry,rz);
  if(opts.shadow!==false){m.castShadow=true;m.receiveShadow=true;}
  scene.add(m);
  if(opts.col!==false) regCol(m);
  return m;
}
function cyl(rT,rB,h,seg,mat,px,py,pz,rx=0,ry=0,rz=0){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(rT,rB,h,seg),mat);
  m.position.set(px,py,pz); m.rotation.set(rx,ry,rz);
  m.castShadow=m.receiveShadow=true; scene.add(m); return m;
}

/* ================================================================
   NOTES DATA
================================================================ */
const NOTES = {
  shift_note: {
    title: 'Catatan Shift Malam — Budi R.',
    body: `12 Oktober 1998 — Shift: 22:00–06:00

Jam 23:14 — Generator utama kehilangan daya.
Penyebab tidak diketahui. Semua panel mati serentak.

Jam 00:08 — Suara aneh dari lorong bawah tanah.
Seperti langkah kaki. Tapi tidak ada orang di sana.

Jam 01:22 — Pak Wiranto tidak kembali setelah
mengecek boiler No.4. Mencari, tidak ditemukan.

Jam 01:37 — Memanggil bantuan. Sambungan terputus.

Ini bukan yang pertama kali. Ini sudah ketiga.

— Jangan pergi ke bawah tanah. —`
  },
  warning_note: {
    title: 'Peringatan Internal — Manajemen',
    body: `RAHASIA — TIDAK UNTUK DISEBARKAN

Kepada: Supervisor Malam
Dari:   Direktur Operasional

Per tanggal 1 Oktober 1998, tiga insiden telah
terjadi di shift malam. Identitas korban masih
dalam investigasi internal.

Jangan hubungi polisi. Jangan buat laporan resmi.
Pabrik harus tetap beroperasi.

Jika bertemu "sesuatu" di dalam:
→ Jangan berlari. Ia melihat gerakan.
→ Jangan bicara. Ia mendengar suara.
→ Jangan berdiri diam. Ia mencium ketakutan.

Tidak ada protokol untuk situasi ini.
Semoga berhasil.`
  },
  engineer_note: {
    title: 'Log Insinyur — H. Santoso',
    body: `Catatan teknis — Boiler Komplek Barat

Gula yang terlalu lama difermentasi menghasilkan
gas yang tidak ada dalam spesifikasi awal pabrik.
Gas ini bersifat halusinogen pada konsentrasi
tertentu. Ini mungkin menjelaskan "penampakan."

Namun ada yang tidak bisa saya jelaskan:
rekaman CCTV sebelum mati menunjukkan sesuatu
yang tidak memiliki bayangan berjalan melewati
lorong utama. Panjang langkah: 2,8 meter.

Saya tidak mau tahu lebih lanjut.
Saya mengundurkan diri efektif besok.

Jika kamu membaca ini — pergi sekarang.`
  },
  final_warning: {
    title: 'Pesan Terakhir',
    body: `..kepada siapapun yang masuk setelah aku..

Generatornya sudah mati. Tapi Ia tidak mati.
Aku melihatnya di sana, menunggu di kegelapan.

Aku sudah mencoba nyalakan generator.
Pintunya terkunci dari dalam setelah aku masuk.

Ia tidak membunuhmu langsung.
Ia hanya.. menunggu. Menontonmu.
Sampai pikiranmu sendiri yang menghancurkanmu.

Jangan biarkan cahaya mati.
Jangan biarkan dirimu sendirian terlalu lama.

Aku tidak bisa keluar.
Semoga kamu bisa.

— R.`
  }
};

/* ================================================================
   WORLD BUILD
================================================================ */
function buildWorld() {
  // ── Material factory ──
  const mm=(type,rep,extras={})=>{
    const t=TEXS[type];
    const c=t.c.clone();c.repeat.set(rep,rep);c.wrapS=c.wrapT=THREE.RepeatWrapping;
    const n=t.n.clone();n.repeat.set(rep,rep);n.wrapS=n.wrapT=THREE.RepeatWrapping;
    const r=t.r.clone();r.repeat.set(rep,rep);r.wrapS=r.wrapT=THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({map:c,normalMap:n,roughnessMap:r,normalScale:new THREE.Vector2(1.6,1.6),...extras});
  };
  MATS.concr   = mm('concrete',14);
  MATS.wall    = mm('concrete',10,{normalScale:new THREE.Vector2(2.2,2.2),color:0x888888});
  MATS.plaster = mm('plaster',8,{color:0xaaaaaa});
  MATS.metal   = mm('metal',8,{metalness:0.88});
  MATS.metalD  = mm('metal',6,{metalness:0.92,color:0x282828});
  MATS.haz     = mm('hazard',3,{metalness:0.3,roughness:0.5});
  MATS.wood    = mm('wood',5);
  MATS.rubber  = mm('rubber',6,{roughness:1.0});
  MATS.tile    = mm('tile',14);
  MATS.grime   = mm('grime',8);
  MATS.RED     = new THREE.MeshBasicMaterial({color:0xff0000});
  MATS.GRN     = new THREE.MeshBasicMaterial({color:0x00cc00});
  MATS.AMB     = new THREE.MeshBasicMaterial({color:0xffaa00});
  MATS.DARK    = new THREE.MeshStandardMaterial({color:0x080810,metalness:0.9,roughness:0.2});
  MATS.PANEL   = new THREE.MeshStandardMaterial({color:0x0a180a,metalness:0.9,roughness:0.2});
  MATS.GLASS   = new THREE.MeshStandardMaterial({color:0x334455,transparent:true,opacity:0.35,roughness:0.1,metalness:0.5});

  // ── FLOOR ──
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(220,220),MATS.concr);
  floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);
  const tileZ=new THREE.Mesh(new THREE.PlaneGeometry(95,95),MATS.tile);
  tileZ.rotation.x=-Math.PI/2; tileZ.position.y=0.005; tileZ.receiveShadow=true; scene.add(tileZ);
  // Grime patches
  [[22,-35],[−18,60],[-60,20],[70,-50]].forEach(([gx,gz])=>{
    const g=new THREE.Mesh(new THREE.PlaneGeometry(18+Math.random()*12,14+Math.random()*8),MATS.grime);
    g.rotation.x=-Math.PI/2; g.position.set(gx,0.008,gz); g.rotation.z=Math.random()*Math.PI; scene.add(g);
  });

  // ── CEILING ──
  const ceilMat=mm('concrete',20,{color:0x303030});
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(220,220),ceilMat);
  ceil.rotation.x=Math.PI/2; ceil.position.y=22; ceil.receiveShadow=true; scene.add(ceil);
  for(let tx=-60;tx<=60;tx+=20){
    const b=new THREE.Mesh(new THREE.BoxGeometry(1.1,1.8,220),MATS.metal);
    b.position.set(tx,22.6,0); b.castShadow=true; scene.add(b);
  }
  for(let tz=-80;tz<=80;tz+=20){
    const b=new THREE.Mesh(new THREE.BoxGeometry(220,0.9,1.0),MATS.metal);
    b.position.set(0,22.2,tz); b.castShadow=true; scene.add(b);
  }

  // ── OUTER WALLS ──
  [[0,11,-100,0,0,0],[0,11,100,0,Math.PI,0],[-100,11,0,0,Math.PI/2,0],[100,11,0,0,-Math.PI/2,0]]
    .forEach(([px,py,pz,rx,ry,rz])=>box(new THREE.BoxGeometry(220,22,1.8),MATS.wall,px,py,pz,rx,ry,rz));

  // ── INTERIOR PARTITION WALLS ──
  [{s:[1.5,22,44],p:[-22,11,-8],r:[0,0,0]},{s:[1.5,22,44],p:[22,11,-8],r:[0,0,0]},
   {s:[88,22,1.5],p:[-6,11,-58],r:[0,0,0]},{s:[1.5,22,40],p:[-48,11,-12],r:[0,0,0]},
   // Additional corridors v7
   {s:[1.5,22,30],p:[48,11,28],r:[0,0,0]},{s:[40,22,1.5],p:[60,11,55],r:[0,0,0]},
   {s:[1.5,14,22],p:[-62,7,18],r:[0,0,0]},
  ].forEach(({s,p,r})=>box(new THREE.BoxGeometry(...s),MATS.wall,...p,...r));

  // Window openings (decorative glass panes in walls)
  [[-80,8,-30],[-80,8,10],[-80,8,50],[80,8,-30],[80,8,10]].forEach(([wx,wy,wz])=>{
    const w=new THREE.Mesh(new THREE.BoxGeometry(0.12,3.5,5),MATS.GLASS);
    w.position.set(wx,wy,wz); scene.add(w);
  });

  // ── BOILER UNITS — 6 large ──
  const boilers=[[-48,-22],[-48,22],[0,-22],[0,22],[48,-22],[48,22]];
  boilers.forEach(([bx,bz])=>{
    cyl(7.5,7.5,26,20,MATS.metal,bx,13,bz);
    cyl(7.5,0,6,16,MATS.metal,bx,27,bz);
    cyl(5.5,7.5,4,16,MATS.metal,bx,2,bz);
    [5,12,20].forEach(ry=>cyl(7.7,7.7,1.0,20,MATS.haz,bx,ry,bz));
    for(let a=0;a<8;a++){
      const ang=(a/8)*Math.PI*2;
      const bolt=new THREE.Mesh(new THREE.SphereGeometry(0.18,5,5),MATS.metal);
      bolt.position.set(bx+Math.cos(ang)*7.7,13,bz+Math.sin(ang)*7.7); scene.add(bolt);
    }
    cyl(0.85,0.85,0.22,10,MATS.metalD,bx+7.7,15,bz,0,0,Math.PI/2);
    const needle=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.45,0.02),MATS.RED);
    needle.position.set(bx+7.92,15,bz); needle.rotation.y=Math.PI/2; scene.add(needle);
    [0,Math.PI/2,Math.PI,Math.PI*1.5].forEach(ang=>{
      cyl(0.32,0.32,4,8,MATS.metal,bx+Math.cos(ang)*8.5,13,bz+Math.sin(ang)*8.5,0,0,Math.PI/2-ang);
    });
    // Fan
    const fanGrp=new THREE.Group(); fanGrp.position.set(bx,20,bz+9);
    const fanRing=new THREE.Mesh(new THREE.CylinderGeometry(4,4,0.5,14),MATS.metal);
    fanRing.rotation.x=Math.PI/2; fanGrp.add(fanRing);
    const bladeGrp=new THREE.Group();
    for(let b2=0;b2<4;b2++){
      const blade=new THREE.Mesh(new THREE.PlaneGeometry(7.5,2.0),MATS.metal);
      blade.rotation.z=(Math.PI/2)*b2; blade.rotation.y=Math.PI/4; bladeGrp.add(blade);
    }
    fanGrp.add(bladeGrp); scene.add(fanGrp); fanList.push(bladeGrp);
    const colProxy=new THREE.Mesh(new THREE.BoxGeometry(16,28,16));
    colProxy.position.set(bx,13,bz); scene.add(colProxy); regCol(colProxy); colProxy.visible=false;
    const glow=new THREE.PointLight(0x441100,60,20,2.5); glow.position.set(bx,1.5,bz); scene.add(glow);
  });

  // ── OVERHEAD PIPE NETWORK ──
  [-65,-40,0,40,65].forEach(pz=>{
    const p=new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.32,210,8),MATS.metal);
    p.position.set(0,19.5,pz); p.rotation.z=Math.PI/2; p.castShadow=true; scene.add(p);
  });
  [-65,-35,0,35,65].forEach(px=>{
    const p=new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.32,210,8),MATS.metal);
    p.position.set(px,19.5,0); p.rotation.x=Math.PI/2; p.castShadow=true; scene.add(p);
  });
  for(let px=-75;px<=75;px+=25) for(let pz=-75;pz<=75;pz+=25){
    const h=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,3.5,4),MATS.metal);
    h.position.set(px,21.2,pz); scene.add(h);
    const jn=new THREE.Mesh(new THREE.SphereGeometry(0.42,6,6),MATS.metal);
    jn.position.set(px,19.5,pz); scene.add(jn);
  }

  // Steam vents
  [[30,-48],[-30,-48],[-62,8],[62,-12],[0,75],[-75,40]].forEach(([sx,sz])=>{
    cyl(0.48,0.48,10,8,MATS.metal,sx,10,sz);
    const grp=new THREE.Group(); grp.position.set(sx,16,sz);
    for(let i=0;i<7;i++){
      const puff=new THREE.Mesh(new THREE.SphereGeometry(0.5+i*0.25,5,5),
        new THREE.MeshBasicMaterial({color:0x999999,transparent:true,opacity:0.10-i*0.012}));
      puff.position.y=i*0.7; grp.add(puff);
    }
    scene.add(grp); steamList.push({grp,phase:Math.random()*6.28});
  });

  // ── CONVEYOR BELT SYSTEM ──
  [{cz:4,dir:1},{cz:-4,dir:-1}].forEach(({cz,dir})=>{
    const len=75;
    const frame=new THREE.Mesh(new THREE.BoxGeometry(len,0.35,4.2),MATS.metal);
    frame.position.set(-8,2.1,cz); frame.castShadow=frame.receiveShadow=true; scene.add(frame);
    const belt=new THREE.Mesh(new THREE.BoxGeometry(len,0.18,3.9),MATS.rubber);
    belt.position.set(-8,2.32,cz); scene.add(belt); convList.push({mesh:belt,dir});
    for(let lx=-8-len/2+6;lx<-8+len/2;lx+=12){
      [-1.6,1.6].forEach(lz2=>{
        const leg=new THREE.Mesh(new THREE.BoxGeometry(0.28,2.1,0.28),MATS.metal);
        leg.position.set(lx,1.05,cz+lz2); leg.castShadow=true; scene.add(leg);
      });
    }
    for(let rx=-8-len/2+4;rx<-8+len/2;rx+=5) cyl(0.35,0.35,4.0,8,MATS.metal,rx,2.32,cz,Math.PI/2,0,0);
    [-22,-8,6,20].forEach(ox=>{
      const crate=new THREE.Mesh(new THREE.BoxGeometry(2.6,2.0,2.6),MATS.wood);
      crate.position.set(ox,3.42,cz); crate.castShadow=true; scene.add(crate);
    });
  });

  // ── PILLARS ──
  for(let px=-80;px<=80;px+=40) for(let pz=-80;pz<=80;pz+=40){
    if(Math.abs(px)<18&&Math.abs(pz)<18) continue;
    box(new THREE.BoxGeometry(2.6,22,2.6),MATS.concr,px,11,pz);
    [0.3,21.8].forEach(py=>{
      const cap=new THREE.Mesh(new THREE.BoxGeometry(3.8,0.55,3.8),MATS.metal);
      cap.position.set(px,py,pz); scene.add(cap);
    });
    const stripe=new THREE.Mesh(new THREE.BoxGeometry(2.7,1.3,2.7),MATS.haz);
    stripe.position.set(px,0.65,pz); scene.add(stripe);
  }

  // ── STORAGE SHELVING ──
  [-90,90].forEach(wallX=>{
    const side=wallX<0?1:-1;
    for(let sz2=-70;sz2<=70;sz2+=14){
      [-4,4].forEach(sOff=>{
        const up=new THREE.Mesh(new THREE.BoxGeometry(0.22,11,0.22),MATS.metal);
        up.position.set(wallX+side*4,5.5,sz2+sOff); scene.add(up);
      });
      [1.2,3.8,6.4,9.0].forEach(sy=>{
        const shelf=new THREE.Mesh(new THREE.BoxGeometry(9,0.12,2.6),MATS.wood);
        shelf.position.set(wallX+side*4,sy,sz2); scene.add(shelf);
        for(let k=0;k<3;k++){
          const itx=wallX+side*4+(Math.random()-0.5)*5, ity=sy+0.12;
          if(Math.random()>0.4){
            const jar=new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.30,0.82,8),
              new THREE.MeshStandardMaterial({color:0x99bbcc,transparent:true,opacity:0.65,roughness:0.15}));
            jar.position.set(itx,ity+0.42,sz2+(Math.random()-0.5)*0.8); jar.castShadow=true; scene.add(jar);
          } else {
            const bx2=new THREE.Mesh(new THREE.BoxGeometry(0.85,0.65+Math.random()*0.4,0.7),MATS.wood);
            bx2.position.set(itx,ity+0.35,sz2+(Math.random()-0.5)*0.8); scene.add(bx2);
          }
        }
      });
      const sc=new THREE.Mesh(new THREE.BoxGeometry(9,11,3));
      sc.position.set(wallX+side*4,5.5,sz2); scene.add(sc); regCol(sc); sc.visible=false;
    }
  });

  // ── SUGAR VATS ──
  [[-45,55],[-45,-55],[45,55],[45,-55]].forEach(([vx,vz])=>{
    cyl(5.2,6.5,10.5,18,MATS.metal,vx,5.25,vz);
    cyl(5.4,5.4,0.38,18,MATS.haz,vx,10.8,vz);
    cyl(6.8,6.8,0.45,18,MATS.metal,vx,0.5,vz);
    cyl(0.22,0.22,10,6,MATS.metal,vx,5,vz);
    [0,2,4].forEach((sa,i)=>{
      const arm=new THREE.Mesh(new THREE.BoxGeometry(9.5,0.15,0.15),MATS.metal);
      arm.position.set(vx,2+i*2,vz); arm.rotation.y=(i*Math.PI)/1.5; scene.add(arm);
    });
    cyl(0.42,0.42,5.5,8,MATS.metal,vx+7.2,2,vz,0,0,Math.PI/5);
    const wheel=new THREE.Mesh(new THREE.TorusGeometry(0.9,0.1,6,14),MATS.metal);
    wheel.position.set(vx+7.0,2,vz); wheel.rotation.y=Math.PI/2; scene.add(wheel);
    for(let a=0;a<8;a++){
      const ang=(a/8)*Math.PI*2;
      const post=new THREE.Mesh(new THREE.BoxGeometry(0.1,2.2,0.1),MATS.metal);
      post.position.set(vx+Math.cos(ang)*6.2,12,vz+Math.sin(ang)*6.2); scene.add(post);
    }
    cyl(6.2,6.2,0.07,28,MATS.haz,vx,13.1,vz);
    const vc=new THREE.Mesh(new THREE.BoxGeometry(14,11,14));
    vc.position.set(vx,5,vz); scene.add(vc); regCol(vc); vc.visible=false;
  });

  // ── BARREL CLUSTERS ──
  const barColors=[0x1a2a48,0x48181a,0x182a18,0x382808,0x28183a];
  [[65,-58,9],[-65,58,7],[72,28,6],[-72,-28,8],[2,-85,11],[2,85,9]].forEach(([cx,cz,n])=>{
    for(let i=0;i<n;i++){
      const bx2=cx+(Math.random()-0.5)*14, bz2=cz+(Math.random()-0.5)*14;
      const barrel=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.3,3.3,12),
        new THREE.MeshStandardMaterial({color:barColors[i%barColors.length],roughness:0.78,metalness:0.6}));
      barrel.position.set(bx2,1.65,bz2); barrel.castShadow=barrel.receiveShadow=true; scene.add(barrel);
      barrel.updateMatrixWorld(true); colBoxes.push(new THREE.Box3().setFromObject(barrel));
      [0.7,2.6].forEach(by=>cyl(1.32,1.32,0.16,12,MATS.metal,bx2,by,bz2));
    }
  });

  // ── ELEVATED WALKWAY + STAIRCASE ──
  const platform=new THREE.Mesh(new THREE.BoxGeometry(22,0.35,55),MATS.metal);
  platform.position.set(74,7.3,-28); scene.add(platform); regCol(platform);
  for(let rz=-53;rz<=53;rz+=3.5){
    const rp=new THREE.Mesh(new THREE.BoxGeometry(0.1,2.6,0.1),MATS.metal);
    rp.position.set(63.2,8.6,rz-28); scene.add(rp);
  }
  const rail=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.08,55),MATS.haz);
  rail.position.set(63.2,9.9,-28); scene.add(rail);
  for(let s=0;s<9;s++) box(new THREE.BoxGeometry(6,0.28,1.5),MATS.concr,63.5,s*0.82,18-s*1.25);

  // Second walkway (west side) — v7 new
  const platform2=new THREE.Mesh(new THREE.BoxGeometry(22,0.35,40),MATS.metal);
  platform2.position.set(-74,5.5,30); scene.add(platform2); regCol(platform2);
  for(let s2=0;s2<7;s2++) box(new THREE.BoxGeometry(5,0.28,1.5),MATS.concr,-63,s2*0.78,4-s2*1.1);

  // ── CONTROL ROOM ──
  box(new THREE.BoxGeometry(28,20,1.5),MATS.wall,-72,10,-68);
  box(new THREE.BoxGeometry(1.5,20,28),MATS.wall,-58,10,-68);
  [-72,-72,-72].forEach((dx,i)=>{
    const dz=-56-i*5;
    box(new THREE.BoxGeometry(6,0.18,2.4),MATS.wood,dx,3.1,dz);
    [[-2.8,-1],[-2.8,1],[2.8,-1],[2.8,1]].forEach(([lx,lz])=>{
      const leg=new THREE.Mesh(new THREE.BoxGeometry(0.22,3.1,0.22),MATS.metal);
      leg.position.set(dx+lx,1.55,dz+lz); scene.add(leg);
    });
    const mon=new THREE.Mesh(new THREE.BoxGeometry(2.2,1.7,0.1),MATS.DARK);
    mon.position.set(dx,4.15,dz-0.8); mon.rotation.y=Math.PI/2; scene.add(mon);
    const scr=new THREE.Mesh(new THREE.PlaneGeometry(1.95,1.45),new THREE.MeshBasicMaterial({color:0x000800}));
    scr.position.set(dx-0.06,4.15,dz-0.8); scr.rotation.y=Math.PI/2; scene.add(scr);
  });
  box(new THREE.BoxGeometry(2.8,5,0.7),MATS.DARK,-66,3.5,-68.6);
  for(let li=0;li<8;li++){
    const led=new THREE.Mesh(new THREE.SphereGeometry(0.1,5,5),li<4?MATS.RED:new THREE.MeshBasicMaterial({color:0x002200}));
    led.position.set(-64.6,2.3+li*0.36,-68.6); scene.add(led);
  }

  // ── OVERHEAD CRANE ──
  const craneBeam=new THREE.Mesh(new THREE.BoxGeometry(110,0.75,1.1),MATS.metal);
  craneBeam.position.set(0,21,-16); scene.add(craneBeam);
  [-35,0,35].forEach(hx=>{
    const trolley=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.9,2.2),MATS.metal);
    trolley.position.set(hx,20.6,-16); scene.add(trolley);
    const chain=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.055,7,4),MATS.metal);
    chain.position.set(hx,17,-16); scene.add(chain);
    const hook=new THREE.Mesh(new THREE.TorusGeometry(0.38,0.1,6,8,Math.PI),MATS.metal);
    hook.position.set(hx,13.5,-16); hook.rotation.z=Math.PI/2; scene.add(hook);
  });

  // ── GROTESQUE MACHINERY ──
  for(let gi=0;gi<5;gi++){
    const gx=-80+gi*22, gz=-90;
    box(new THREE.BoxGeometry(4+Math.random()*3,3+Math.random()*2,2),MATS.metal,gx,1.8,gz);
    for(let ri=0;ri<3;ri++){
      cyl(0.45+Math.random()*0.25,0.45,0.9+Math.random()*1.4,8,MATS.metal,
        gx+(Math.random()-0.5)*3,1.5+Math.random()*1.5,gz+1.5);
    }
  }

  // ── DEBRIS & CLUTTER ──
  [[32,-82,14],[-32,82,12],[80,50,10],[-80,-50,13],[20,30,8],[-40,-70,9]].forEach(([cx,cz,n])=>{
    for(let i=0;i<n;i++){
      const dx=cx+(Math.random()-0.5)*16, dz2=cz+(Math.random()-0.5)*16;
      const t=Math.random();
      let m;
      if(t<0.35) m=new THREE.Mesh(new THREE.BoxGeometry(0.4+Math.random()*0.5,0.18+Math.random()*0.35,0.4+Math.random()*0.5),MATS.metal);
      else if(t<0.65) m=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.22,0.3+Math.random()*0.4,6),MATS.metal);
      else m=new THREE.Mesh(new THREE.BoxGeometry(0.28+Math.random()*0.4,0.08,0.7+Math.random()*0.4),MATS.wood);
      m.position.set(dx,0.18,dz2); m.rotation.y=Math.random()*Math.PI; m.castShadow=true; scene.add(m);
    }
  });

  // ── SPRINKLER HEADS ──
  for(let fx=-80;fx<=80;fx+=18) for(let fz=-80;fz<=80;fz+=18){
    const head=new THREE.Mesh(new THREE.CylinderGeometry(0.10,0.07,0.28,6),MATS.metal);
    head.position.set(fx,21.5,fz); scene.add(head);
  }

  // ── PICKUP ITEMS ──
  [
    {pos:[12,0.5,28],   type:'battery', name:'Baterai Senter (+40%)'},
    {pos:[-28,0.5,10],  type:'note',    name:'Catatan Shift Malam',    noteKey:'shift_note'},
    {pos:[42,7.5,10],   type:'battery', name:'Baterai Senter (+40%)'},
    {pos:[-48,0.5,-38], type:'keycard', name:'Kartu Akses [LV-B]'},
    {pos:[65,0.5,-72],  type:'note',    name:'Peringatan Internal',     noteKey:'warning_note'},
    {pos:[-72,0.5,-42], type:'note',    name:'Log Insinyur Santoso',    noteKey:'engineer_note'},
    {pos:[22,0.5,72],   type:'medkit',  name:'Kotak P3K (+35 HP)'},
    {pos:[-35,0.5,80],  type:'note',    name:'Pesan Terakhir',          noteKey:'final_warning'},
    {pos:[0,7.8,-16],   type:'battery', name:'Baterai Senter (+40%)'},
  ].forEach(({pos,type,name,noteKey})=>{
    const col = type==='battery'?0xffee22 : type==='note'?0xf5f0e0 : type==='keycard'?0x22aaff : 0xff5555;
    const geo = type==='battery'?new THREE.BoxGeometry(0.28,0.58,0.18)
              : type==='note'   ?new THREE.BoxGeometry(0.38,0.02,0.52)
              : type==='medkit' ?new THREE.BoxGeometry(0.55,0.35,0.55)
              :                  new THREE.BoxGeometry(0.52,0.07,0.33);
    const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:col,roughness:0.5,metalness:0.2,emissive:col,emissiveIntensity:0.25}));
    mesh.position.set(...pos); mesh.castShadow=true; scene.add(mesh);
    const gl=new THREE.PointLight(col,0.8,3.5,2.5);
    gl.position.set(pos[0],pos[1]+0.5,pos[2]); scene.add(gl);
    mesh.userData={type,name,isActor:true,isPickup:true,noteKey};
    actorList.push(mesh);
    pickList.push({mesh,light:gl});
  });

  // ── LOCKED DOOR ──
  const door=box(new THREE.BoxGeometry(4,10,0.7),MATS.metal,-22,5,-60.5);
  door.userData={isActor:true,name:'Pintu [TERKUNCI — Kartu Akses Level B]',isDoor:true,locked:true};
  actorList.push(door); doorList.push(door);
  // Security panel next to door
  const secPanel=new THREE.Mesh(new THREE.BoxGeometry(0.8,1.4,0.1),MATS.DARK);
  secPanel.position.set(-19.5,3.5,-60.5); scene.add(secPanel);
  const secLight=new THREE.Mesh(new THREE.SphereGeometry(0.12,6,6),MATS.RED);
  secLight.position.set(-19.5,4.4,-60.5); scene.add(secLight);

  // ── GENERATOR PANEL — MISSION OBJECTIVE ──
  const panel=box(new THREE.BoxGeometry(3.2,5.2,0.9),MATS.PANEL,-62,3,-60);
  const panelScr=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.7),MATS.RED);
  panelScr.position.set(-61.54,3.8,-60); panelScr.rotation.y=Math.PI/2; scene.add(panelScr);
  for(let li=0;li<8;li++){
    const led=new THREE.Mesh(new THREE.SphereGeometry(0.11,5,5),
      new THREE.MeshBasicMaterial({color:li<4?0xff0000:0x002200}));
    led.position.set(-61.54,1.5+li*0.35,-60+(li%3-1)*0.4); scene.add(led);
  }
  // Objective glow
  const objGlow=new THREE.PointLight(0xff2200,8,12,2);
  objGlow.position.set(-62,3,-60); scene.add(objGlow);
  panel.userData={isActor:true,name:'Panel Generator Utama [PWR-01]',isPanel:true,panelScr,objGlow};
  actorList.push(panel);

  // Exit door (after generator activated)
  const exitDoor=box(new THREE.BoxGeometry(5,10,0.8),MATS.metal,0,5,99);
  exitDoor.userData={isActor:true,name:'Pintu Keluar [TERKUNCI]',isExit:true,locked:true};
  actorList.push(exitDoor);
  const exitSign=new THREE.Mesh(new THREE.BoxGeometry(3,0.8,0.1),new THREE.MeshBasicMaterial({color:0x002200}));
  exitSign.position.set(0,10.5,99); scene.add(exitSign);
  const exitLight=new THREE.PointLight(0x00aa00,0,8,2);
  exitLight.position.set(0,8,98); scene.add(exitLight);
  panel.userData.exitLight=exitLight; panel.userData.exitDoor=exitDoor; panel.userData.exitSign=exitSign;

  // ── CEILING LAMPS ──
  for(let lx=-60;lx<=60;lx+=18) for(let lz=-60;lz<=60;lz+=18){
    const fix=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.38,0.75),
      new THREE.MeshStandardMaterial({color:0xddddcc,metalness:0.5}));
    fix.position.set(lx,21.8,lz); scene.add(fix);
    const bulb=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.22,0.55,8),
      new THREE.MeshBasicMaterial({color:0xffffee}));
    bulb.position.set(lx,21.4,lz); scene.add(bulb);
    const pt=new THREE.PointLight(0xf8e8c0,0,50,1.5);
    pt.position.set(lx,20.5,lz); scene.add(pt);
    lampList.push({pt,bulb,fix});
  }
  // Emergency red lights
  [[-65,8,-65],[65,8,-65],[-65,8,65],[65,8,65],[-65,8,0],[65,8,0]].forEach(([ex,ey,ez])=>{
    const el=new THREE.PointLight(0x880000,45,40,2.2);
    el.position.set(ex,ey,ez); scene.add(el);
    const eb=new THREE.Mesh(new THREE.SphereGeometry(0.24,6,5),MATS.RED);
    eb.position.copy(el.position); scene.add(eb);
  });
}

/* ================================================================
   ENEMY SYSTEM — DUAL ENEMIES with improved AI
   "Penjaga" = guardian (patrol/alert/chase/search/stalk)
   "Bayangan" = shadow (stalker, faster, harder to detect)
================================================================ */
function makeEnemyMesh(col, eyeCol, scale=1) {
  const grp=new THREE.Group();
  const bodyMat=new THREE.MeshStandardMaterial({color:col,roughness:0.9,metalness:0.1});
  const addPart=(geo,ox,oy,oz)=>{const m=new THREE.Mesh(geo,bodyMat);m.position.set(ox,oy,oz);m.castShadow=true;grp.add(m);return m;};
  addPart(new THREE.BoxGeometry(0.7*scale,1.4*scale,0.4*scale),0,1.2*scale,0);
  addPart(new THREE.SphereGeometry(0.36*scale,9,9),0,2.5*scale,0);
  [-0.55*scale,0.55*scale].forEach(ox=>addPart(new THREE.BoxGeometry(0.18*scale,1.2*scale,0.2*scale),ox,1.1*scale,0));
  [-0.13*scale,0.13*scale].forEach(ox=>{
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.07*scale,6,6),new THREE.MeshBasicMaterial({color:eyeCol}));
    eye.position.set(ox,2.56*scale,0.35*scale); grp.add(eye);
  });
  const eyeL=new THREE.PointLight(eyeCol,0.5,10,2.2);
  eyeL.position.set(0,2.5*scale,0.4*scale); grp.add(eyeL);
  return {grp,eyeL};
}

const ENEMIES = [
  {
    id:'penjaga',
    pos:     new THREE.Vector3(-48,1.8,-80),
    dir:     new THREE.Vector3(0,0,1),
    state:   'patrol',
    stateT:  0,
    speed:   {patrol:2.8,alert:4.8,chase:7.5,search:3.2,stalk:5.0},
    fov:     {patrol:Math.PI*0.5,alert:Math.PI*0.65,chase:Math.PI*0.85,search:Math.PI*0.6,stalk:Math.PI*0.55},
    sightRange: 30,
    patrol: [
      new THREE.Vector3(-48,1.8,-80),new THREE.Vector3(48,1.8,-80),
      new THREE.Vector3(48,1.8,80),new THREE.Vector3(-48,1.8,80),
      new THREE.Vector3(-80,1.8,0),new THREE.Vector3(0,1.8,0),
    ],
    patrolIdx:0,
    lastSeen: new THREE.Vector3(),
    mesh:null, eyeL:null,
    eyeCol: 0xff1100,
    col:    0x080810,
    scale:  1.0,
    dmgPerSec: 18,
    searchRandomOffset: new THREE.Vector3(),
    searchT: 0,
  },
  {
    id:'bayangan',
    pos:     new THREE.Vector3(72,1.8,72),
    dir:     new THREE.Vector3(-1,0,0),
    state:   'stalk',
    stateT:  0,
    speed:   {patrol:3.5,alert:6.0,chase:9.5,search:4.0,stalk:5.5},
    fov:     {patrol:Math.PI*0.45,alert:Math.PI*0.7,chase:Math.PI*0.9,search:Math.PI*0.5,stalk:Math.PI*0.4},
    sightRange: 22,
    patrol: [
      new THREE.Vector3(72,1.8,72),new THREE.Vector3(-72,1.8,72),
      new THREE.Vector3(-72,1.8,-72),new THREE.Vector3(72,1.8,-72),
    ],
    patrolIdx:0,
    lastSeen: new THREE.Vector3(),
    mesh:null, eyeL:null,
    eyeCol: 0x4400ff,
    col:    0x020208,
    scale:  1.15,
    dmgPerSec: 22,
    searchRandomOffset: new THREE.Vector3(),
    searchT: 0,
  }
];

function buildEnemies() {
  ENEMIES.forEach(e=>{
    const {grp,eyeL}=makeEnemyMesh(e.col,e.eyeCol,e.scale);
    grp.position.copy(e.pos); scene.add(grp);
    e.mesh=grp; e.eyeL=eyeL;
  });
}

function canEnemySeePlayer(e) {
  const toP=camGame.position.clone().sub(e.pos);
  const dist=toP.length();
  if(dist>e.sightRange) return false;
  const fov=e.fov[e.state]||Math.PI*0.55;
  const angle=toP.normalize().angleTo(e.dir);
  return angle<fov;
}

function updateEnemy(e, dt) {
  if(!e.mesh) return;
  const dToPlayer=e.pos.distanceTo(camGame.position);
  const sees=canEnemySeePlayer(e);
  e.stateT+=dt;

  // State machine
  switch(e.state){
    case 'patrol':
      if(sees||dToPlayer<8){e.state='alert';e.stateT=0;}
      break;
    case 'stalk': // Bayangan skulks at medium range
      if(sees&&dToPlayer<18){e.state='chase';e.stateT=0;}
      else if(dToPlayer<25&&!sees&&e.stateT>4){e.state='alert';e.stateT=0;}
      if(e.stateT>12){e.state='patrol';e.stateT=0;} // give up stalking
      break;
    case 'alert':
      if(!sees&&e.stateT>3.0){e.state='search';e.stateT=0;}
      else if(dToPlayer<14){e.state='chase';e.stateT=0;}
      break;
    case 'chase':
      if(!sees&&e.stateT>6){e.state='search';e.stateT=0;}
      break;
    case 'search':
      if(sees){e.state='chase';e.stateT=0;}
      else if(e.stateT>10){e.state='patrol';e.stateT=0;}
      break;
  }

  // Movement
  let target, speed;
  switch(e.state){
    case 'patrol':{
      const pt=e.patrol[e.patrolIdx];
      if(e.pos.distanceTo(pt)<2){e.patrolIdx=(e.patrolIdx+1)%e.patrol.length;}
      target=pt; speed=e.speed.patrol; break;
    }
    case 'stalk':{
      // Stay at medium distance, circle player
      const toPlayer=camGame.position.clone().sub(e.pos);
      const dist2=toPlayer.length();
      if(dist2>35){target=camGame.position;} // close in if too far
      else {
        // Orbit
        const perp=new THREE.Vector3(-toPlayer.z,0,toPlayer.x).normalize();
        target=e.pos.clone().add(perp.multiplyScalar(12)).add(toPlayer.normalize().multiplyScalar(2));
      }
      speed=e.speed.stalk; break;
    }
    case 'alert':
      e.lastSeen.copy(camGame.position); target=e.lastSeen; speed=e.speed.alert; break;
    case 'chase':
      e.lastSeen.copy(camGame.position); target=camGame.position; speed=e.speed.chase; break;
    case 'search':{
      e.searchT+=dt;
      if(e.searchT>2.5){
        e.searchT=0;
        e.searchRandomOffset.set((Math.random()-0.5)*22,0,(Math.random()-0.5)*22);
      }
      target=e.lastSeen.clone().add(e.searchRandomOffset); speed=e.speed.search; break;
    }
  }

  // Steer
  const moveDir=target.clone().sub(e.pos).setY(0);
  if(moveDir.length()>0.1){
    moveDir.normalize();
    e.dir.lerp(moveDir,Math.min(1,4.5*dt)); e.dir.normalize();
    e.pos.addScaledVector(e.dir,speed*dt);
    e.pos.y=1.8;
    e.mesh.position.copy(e.pos);
    e.mesh.rotation.y=Math.atan2(e.dir.x,e.dir.z);
    // Bob animation
    e.mesh.position.y=1.8+Math.sin(Date.now()*0.006*speed)*0.06;
  }

  // Eye light by state
  const intensities={patrol:0.35,stalk:0.2,alert:1.4,chase:3.2,search:0.7};
  e.eyeL.intensity=intensities[e.state]||0.35;
  e.eyeL.color.setHex(e.state==='chase'?e.eyeCol:e.eyeCol);

  // Sanity drain (positional)
  if(dToPlayer<25) G.sanity=Math.max(0,G.sanity-(dToPlayer<10?16:dToPlayer<18?8:4)*dt);

  // HP damage on contact
  const now=performance.now()/1000;
  if(dToPlayer<1.6&&now-G.lastDamageT>0.5){
    G.lastDamageT=now;
    G.hp=Math.max(0,G.hp-e.dmgPerSec*0.5);
    flashDamage();
    if(G.hp<=0&&!G._caughtOnce) triggerDeath('kamu ditangkap');
  }

  // Proximity ring update (use closest enemy)
  return {dToPlayer, state:e.state, sees};
}

/* ================================================================
   CONTROLS
================================================================ */
const plc=new PointerLockControls(camGame,document.body);
scene.add(plc.getObject());

window.addEventListener('keydown',e=>{
  switch(e.code){
    case 'KeyW': G.keys.w=true;break; case 'KeyS': G.keys.s=true;break;
    case 'KeyA': G.keys.a=true;break; case 'KeyD': G.keys.d=true;break;
    case 'ShiftLeft':case 'ShiftRight': G.keys.shift=true;break;
    case 'KeyC': G.keys.c=true;G.crouching=true;break;
    case 'KeyF': toggleFlash();break;
    case 'KeyE': doInteract();break;
    case 'Escape': if(document.getElementById('screen-note').style.display==='flex') closeNote();break;
    case 'Tab': e.preventDefault(); break;
  }
});
window.addEventListener('keyup',e=>{
  switch(e.code){
    case 'KeyW': G.keys.w=false;break; case 'KeyS': G.keys.s=false;break;
    case 'KeyA': G.keys.a=false;break; case 'KeyD': G.keys.d=false;break;
    case 'ShiftLeft':case 'ShiftRight': G.keys.shift=false;break;
    case 'KeyC': G.keys.c=false;G.crouching=false;break;
  }
});

function toggleFlash(){
  if(G.flashBatt<=0) return;
  G.flashOn=!G.flashOn;
  flash.intensity=G.flashOn?2800:0;
  const txt=document.getElementById('fl-txt');
  txt.textContent=G.flashOn?'ON':'OFF';
  txt.className=G.flashOn?'on':'off';
  if(actx) playClick();
}

/* ================================================================
   PHYSICS & MOVEMENT
================================================================ */
const _fwd=new THREE.Vector3(), _rgt=new THREE.Vector3(), _up=new THREE.Vector3(0,1,0);

function updateMovement(dt) {
  const friction=Math.exp(-10*dt);
  G.vel.x*=friction; G.vel.y*=friction;
  camGame.getWorldDirection(_fwd); _fwd.y=0; _fwd.normalize();
  _rgt.crossVectors(_fwd,_up).normalize();

  const fw=Number(G.keys.w)-Number(G.keys.s);
  const rt=Number(G.keys.d)-Number(G.keys.a);
  const moving=(fw!==0||rt!==0);
  const sprinting=G.keys.shift&&G.stamina>0&&moving&&!G.crouching;
  const speed=G.crouching?5:sprinting?34:15;

  if(moving){
    const len=Math.hypot(fw,rt)||1;
    G.vel.x+=(rt/len)*speed*dt; G.vel.y+=(fw/len)*speed*dt;
  }

  if(sprinting) G.stamina=Math.max(0,G.stamina-22*dt);
  else          G.stamina=Math.min(100,G.stamina+11*dt);
  document.getElementById('fill-stam').style.width=G.stamina+'%';

  const targetY=G.crouching?0.95:1.75;
  camGame.position.y+=(targetY-camGame.position.y)*Math.min(1,8*dt);

  const prevX=camGame.position.x, prevZ=camGame.position.z;
  camGame.position.x+=(_rgt.x*G.vel.x+_fwd.x*G.vel.y)*dt;
  camGame.position.z+=(_rgt.z*G.vel.x+_fwd.z*G.vel.y)*dt;

  // AABB collision
  const pb=new THREE.Box3().setFromCenterAndSize(camGame.position,new THREE.Vector3(1.1,2.8,1.1));
  let hitX=false,hitZ=false;
  for(const cb of colBoxes){
    if(!pb.intersectsBox(cb)) continue;
    const ovX=Math.min(cb.max.x-pb.min.x,pb.max.x-cb.min.x);
    const ovZ=Math.min(cb.max.z-pb.min.z,pb.max.z-cb.min.z);
    if(ovX<ovZ) hitX=true; else hitZ=true;
  }
  if(hitX){camGame.position.x=prevX;G.vel.x=0;}
  if(hitZ){camGame.position.z=prevZ;G.vel.y=0;}

  // Bob
  const spd2=Math.hypot(G.vel.x,G.vel.y);
  if(spd2>1.0&&plc.isLocked){
    const bobF=sprinting?13:8;
    const bobA=G.crouching?0.012:sprinting?0.072:0.036;
    G.bobAngle+=bobF*dt;
    camGame.position.y=targetY+Math.sin(G.bobAngle)*bobA;
    if(Math.sin(G.bobAngle)<-0.9){
      playFootstep();
      G.stepsTotal++;
    }
  }

  // Flashlight
  flash.position.copy(camGame.position);
  camGame.getWorldDirection(_fwd);
  flashTarget.position.copy(camGame.position).addScaledVector(_fwd,35);
  ambFill.position.copy(camGame.position).setY(8);

  // Battery drain
  if(G.flashOn){
    G.flashBatt=Math.max(0,G.flashBatt-0.26*dt);
    if(G.flashBatt<=0){
      G.flashOn=false; flash.intensity=0;
      const txt=document.getElementById('fl-txt');
      txt.textContent='MATI'; txt.className='dead';
      showNotify('[SENTER] Baterai habis!','warn');
    }
  }
  document.getElementById('fill-fl').style.width=G.flashBatt+'%';

  // HUD compass
  updateCompass();

  // Clamp to world
  camGame.position.x=Math.max(-98,Math.min(98,camGame.position.x));
  camGame.position.z=Math.max(-98,Math.min(98,camGame.position.z));
}

function updateCompass() {
  camGame.getWorldDirection(_fwd);
  const angle=Math.atan2(_fwd.x,_fwd.z)*(180/Math.PI);
  const dirs=['S','SSE','SE','ESE','E','ENE','NE','NNE','U','NNU','NB','BNU','B','BNS','BS','SSB'];
  const idx=Math.round((angle+180)/22.5)%16;
  const simple=['S','SE','E','NE','U','NB','B','BS'];
  const si=Math.round((angle+180)/45)%8;
  const tape=`${simple[si]} — ${Math.round(angle+180)}°`;
  document.getElementById('compass-tape').textContent=tape;
}

/* ================================================================
   INTERACTION
================================================================ */
const ray=new THREE.Raycaster(undefined,undefined,0,7.5);
let nearActor=null;

function updateInteraction(){
  ray.setFromCamera({x:0,y:0},camGame);
  const hits=ray.intersectObjects(actorList,false);
  const el=document.getElementById('hint');
  const xh=document.getElementById('xh');
  nearActor=null;
  if(hits.length>0){
    const obj=hits[0].object;
    if(obj.userData.isActor){
      nearActor=obj;
      document.getElementById('hint-name').textContent=obj.userData.name;
      el.style.display='block'; xh.classList.add('hot'); return;
    }
  }
  el.style.display='none'; xh.classList.remove('hot');
}

function doInteract(){
  if(document.getElementById('screen-note').style.display==='flex'){closeNote();return;}
  if(!nearActor) return;
  const ud=nearActor.userData;
  if(ud.isPickup)       pickupItem(nearActor);
  else if(ud.isPanel)   activateGenerator(ud);
  else if(ud.isDoor)    tryOpenDoor(nearActor,ud);
  else if(ud.isExit)    tryExit(ud);
}

function pickupItem(mesh){
  const slot=G.inv.findIndex(v=>v===null);
  if(slot===-1){showNotify('Inventori penuh!','warn');return;}
  G.inv[slot]=mesh.userData.type;
  const slotEl=document.getElementById('sl'+slot);
  slotEl.textContent=mesh.userData.name.substring(0,7);
  slotEl.classList.add('full');
  scene.remove(mesh);
  const pi=pickList.find(p=>p.mesh===mesh);
  if(pi) scene.remove(pi.light);
  actorList.splice(actorList.indexOf(mesh),1);
  nearActor=null;

  if(mesh.userData.type==='battery'){
    G.flashBatt=Math.min(100,G.flashBatt+40);
    showNotify('[BAT] Baterai +40%');
    playBeep(880,0.15);
  } else if(mesh.userData.type==='note'){
    G.notesFound++;
    openNote(mesh.userData.noteKey);
    playBeep(660,0.12);
  } else if(mesh.userData.type==='keycard'){
    showNotify('[KEY] Kartu Akses Level B ditemukan');
    playBeep(1100,0.18);
  } else if(mesh.userData.type==='medkit'){
    G.hp=Math.min(100,G.hp+35);
    showNotify('[MED] HP +35');
    playBeep(550,0.12);
    setTimeout(()=>playBeep(770,0.1),180);
  }
}

function tryOpenDoor(mesh,ud){
  const hasKey=G.inv.includes('keycard');
  if(hasKey){
    ud.locked=false; ud.name='Pintu [TERBUKA]';
    scene.remove(mesh);
    actorList.splice(actorList.indexOf(mesh),1);
    showNotify('[DOOR] Pintu dibuka dengan Kartu Akses');
    playBeep(440,0.1); setTimeout(()=>playBeep(550,0.1),150);
  } else {
    showNotify('[DOOR] Terkunci — butuh Kartu Akses Level B','warn');
  }
}

function tryExit(ud){
  if(!G.missionDone){showNotify('[EXIT] Pintu terkunci. Aktifkan generator dulu!','warn');return;}
  G.escaped=true;
  triggerWin();
}

/* ================================================================
   NOTE READER
================================================================ */
function openNote(key){
  const note=NOTES[key]; if(!note) return;
  const ns=document.getElementById('screen-note');
  document.getElementById('note-title').textContent=note.title;
  document.getElementById('note-body').textContent=note.body;
  ns.style.display='flex';
  plc.unlock();
}
function closeNote(){
  document.getElementById('screen-note').style.display='none';
}

/* ================================================================
   GENERATOR ACTIVATION
================================================================ */
function activateGenerator(ud){
  if(G.missionDone) return;
  G.missionDone=true;
  if(ud.panelScr) ud.panelScr.material=MATS.GRN;
  if(ud.objGlow){scene.remove(ud.objGlow);}

  // Staggered lamp flicker-on
  lampList.forEach(({pt,bulb},i)=>{
    setTimeout(()=>{
      let flk=0;
      const iv=setInterval(()=>{
        pt.intensity=Math.random()>0.35?280:0;
        if(++flk>9){clearInterval(iv);pt.intensity=280;}
      },65);
    },i*18);
  });

  hemi.intensity=0.5;
  bloom.strength=1.05;

  // Exit door unlocks
  if(ud.exitLight) ud.exitLight.intensity=40;
  if(ud.exitSign){ud.exitSign.material=new THREE.MeshBasicMaterial({color:0x003300});}
  if(ud.exitDoor){ud.exitDoor.userData.name='Pintu Keluar [BUKA]';}

  document.getElementById('hq-txt').textContent='[PWR] Generator aktif! Tekanan UAP KRITIS. EVAKUASI SEGERA!';
  document.getElementById('hq-txt').classList.add('urgent');
  document.getElementById('hq-sub').textContent='→ Menuju Pintu Keluar di ujung utara pabrik';

  showNotify('[PWR] Generator Dinyalakan! EVAKUASI!');
  playBeep(880,0.2); setTimeout(()=>playBeep(1100,0.3),280); setTimeout(()=>playBeep(1320,0.4),580);

  // Start horror escalation after 3s
  setTimeout(()=>{G.horrorOn=true;},3000);
  // Enemy speed boost
  ENEMIES.forEach(e=>{Object.keys(e.speed).forEach(k=>e.speed[k]*=1.35);});
}

/* ================================================================
   WIN SCREEN
================================================================ */
function triggerWin(){
  G.escaped=true;
  document.getElementById('screen-game').style.display='none';
  const ws=document.getElementById('screen-win');
  ws.style.display='flex';
  const elapsed=Math.floor((Date.now()-G.startTime)/1000);
  const mins=Math.floor(elapsed/60), secs=elapsed%60;
  document.getElementById('win-time').textContent=`${mins}m ${secs}s`;
  document.getElementById('win-notes').textContent=`${G.notesFound}/4`;
  document.getElementById('win-steps').textContent=G.stepsTotal;
  playBeep(440,0.3); setTimeout(()=>playBeep(550,0.3),400); setTimeout(()=>playBeep(660,0.5),800);
}

/* ================================================================
   HORROR SEQUENCE — escalating madness
================================================================ */
function updateHorror(dt){
  if(!G.horrorOn) return;
  G.horrorT+=dt;
  const t=G.horrorT;

  filmPass.uniforms.uCA.value    = 0.0012+t*0.010;
  filmPass.uniforms.uGrain.value = 0.028+t*0.009;
  filmPass.uniforms.uWarp.value  = Math.min(2.0,t*0.20);
  bloom.strength = 0.55+t*0.25;

  // Red tint escalates
  filmPass.uniforms.uTint.value.set(1,1.0-t*0.028,1.0-t*0.038);

  document.getElementById('ov-red').style.background=`rgba(130,0,0,${Math.min(0.65,t*0.058)})`;
  document.getElementById('ov-blood').style.background=`radial-gradient(ellipse at center,transparent 35%,rgba(80,0,0,${Math.min(0.5,t*0.04)}) 100%)`;

  // Camera shake
  if(plc.isLocked){
    const shake=t*0.10;
    camGame.position.x+=Math.sin(t*7.1+1.1)*shake;
    camGame.position.y=1.75+Math.sin(t*11.3+2.3)*shake*0.5;
  }

  // Flickering hemisphere
  if(t>2) hemi.intensity=Math.random()>0.78?0.0:0.5;

  const msgEl=document.getElementById('ov-msg');
  if(t>2&&!G._hmsg){
    G._hmsg=true;
    msgEl.textContent='TIDAK ADA YANG BISA MENOLONGMU...';
    msgEl.style.display='block'; msgEl.classList.add('glitch');
    playScreech();
  }
  if(t>6&&!G._hmsg2){
    G._hmsg2=true; msgEl.textContent='DIA TAHU KAU DI SINI.'; playScreech();
  }
  if(t>10&&!G._hmsg3){
    G._hmsg3=true; msgEl.textContent='LARI.\nLARI SEKARANG.'; playScreech();
  }

  // Game over if too long in horror and no escape
  if(t>18&&!G.escaped&&!G._caughtOnce){
    triggerDeath('terjebak dalam kegelapan');
  }
}

/* ================================================================
   SANITY SYSTEM — expanded effects
================================================================ */
function updateSanity(dt){
  if(!G.flashOn) G.sanity=Math.max(0,G.sanity-0.8*dt);
  else           G.sanity=Math.min(100,G.sanity+0.10*dt);

  // Slow natural recovery in light areas
  if(G.flashOn&&G.sanity>0) G.sanity=Math.min(100,G.sanity+0.05*dt);

  const pct=G.sanity/100;
  document.getElementById('fill-san').style.width=G.sanity+'%';
  document.getElementById('fill-san').style.background=pct>0.6?'#4a7c59':pct>0.3?'#a07030':'#c0392b';

  if(!G.horrorOn){
    filmPass.uniforms.uCA.value    = 0.0012+(1-pct)*0.0045;
    filmPass.uniforms.uWarp.value  = Math.max(0,(0.5-pct)*2.8);
    filmPass.uniforms.uGrain.value = 0.028+(1-pct)*0.014;
    // Low sanity tint (slight desaturate+red)
    const r=1+(1-pct)*0.08, gb=1-(1-pct)*0.05;
    filmPass.uniforms.uTint.value.set(r,gb,gb);
  }
  if(G.horrorOn) return;

  // Sanity events
  if(pct<0.35&&Math.random()<0.005) playScreech();
  if(pct<0.2&&Math.random()<0.008){
    // Phantom whisper direction visual
    const side=Math.random()>0.5?1:-1;
    filmPass.uniforms.uWarp.value=3.0;
    setTimeout(()=>{if(!G.horrorOn)filmPass.uniforms.uWarp.value=Math.max(0,(0.5-pct)*2.8);},180);
  }

  // HP update
  document.getElementById('fill-hp').style.width=G.hp+'%';
  const hpFill=document.getElementById('fill-hp');
  if(G.hp<30) hpFill.classList.add('low'); else hpFill.classList.remove('low');
}

/* ================================================================
   CAUGHT / DEATH
================================================================ */
function flashDamage(){
  document.getElementById('ov-red').style.background='rgba(200,0,0,0.35)';
  setTimeout(()=>{if(!G.horrorOn)document.getElementById('ov-red').style.background='rgba(120,0,0,0)';},180);
}

function triggerDeath(cause){
  if(G._caughtOnce) return; G._caughtOnce=true;
  plc.unlock();
  document.getElementById('screen-game').style.display='none';
  const ds=document.getElementById('screen-death');
  ds.style.display='flex';
  document.getElementById('death-cause').textContent=cause.toUpperCase();
  playScreech();
  setTimeout(()=>playScreech(),500);
}

/* ================================================================
   MINIMAP
================================================================ */
const mmCvs=document.getElementById('mm');
const mmCtx=mmCvs.getContext('2d');

function drawMinimap(){
  const W=150,H=110;
  mmCtx.fillStyle='rgba(0,0,0,.92)'; mmCtx.fillRect(0,0,W,H);
  const scale=W/220;
  const wx=x=>W/2+x*scale, wz=z=>H/2+z*scale;
  mmCtx.strokeStyle='#0d0d0d'; mmCtx.lineWidth=1; mmCtx.strokeRect(1,1,W-2,H-2);

  // Wall hints (very faint)
  mmCtx.strokeStyle='rgba(40,40,40,0.5)'; mmCtx.lineWidth=0.5;
  mmCtx.strokeRect(wx(-22),0,1,H); mmCtx.strokeRect(wx(22),0,1,H);

  // Objective marker (pulse)
  if(!G.missionDone){
    const t=Date.now()*0.003;
    const alpha=0.5+Math.sin(t)*0.3;
    mmCtx.fillStyle=`rgba(230,126,34,${alpha})`;
    mmCtx.beginPath(); mmCtx.arc(wx(-62),wz(-60),3.5,0,Math.PI*2); mmCtx.fill();
    // Orange dot = generator
    mmCtx.strokeStyle=`rgba(230,126,34,${alpha*0.4})`;
    mmCtx.beginPath(); mmCtx.arc(wx(-62),wz(-60),6,0,Math.PI*2); mmCtx.stroke();
  }
  // Exit marker
  if(G.missionDone){
    mmCtx.fillStyle='rgba(39,174,96,0.6)';
    mmCtx.beginPath(); mmCtx.arc(wx(0),wz(99),3,0,Math.PI*2); mmCtx.fill();
  }

  // Enemy dots
  ENEMIES.forEach(e=>{
    if(!e.mesh) return;
    const isChase=e.state==='chase';
    const isAlert=e.state==='alert'||e.state==='stalk';
    mmCtx.fillStyle=isChase?'#ff1100':isAlert?'#882200':'#330000';
    mmCtx.beginPath(); mmCtx.arc(wx(e.pos.x),wz(e.pos.z),isChase?3:2,0,Math.PI*2); mmCtx.fill();
  });

  // Player
  const px=wx(camGame.position.x), pz=wz(camGame.position.z);
  camGame.getWorldDirection(_fwd);
  mmCtx.strokeStyle='rgba(255,255,255,0.3)'; mmCtx.lineWidth=1;
  mmCtx.beginPath(); mmCtx.moveTo(px,pz); mmCtx.lineTo(px+_fwd.x*10,pz+_fwd.z*10); mmCtx.stroke();
  mmCtx.fillStyle='#fff'; mmCtx.beginPath(); mmCtx.arc(px,pz,2.8,0,Math.PI*2); mmCtx.fill();
}

/* ================================================================
   AUDIO ENGINE — expanded procedural audio
================================================================ */
let actx=null, master=null, droneGain=null;

function initAudio(){
  actx=new(window.AudioContext||window.webkitAudioContext)();
  master=actx.createGain(); master.gain.value=G.sfxVol;
  const comp=actx.createDynamicsCompressor();
  const rev=actx.createConvolver();
  const irl=actx.sampleRate*2.2;
  const irb=actx.createBuffer(2,irl,actx.sampleRate);
  for(let ch=0;ch<2;ch++){const d=irb.getChannelData(ch);for(let i=0;i<irl;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/irl,2.0);}
  rev.buffer=irb;
  master.connect(comp); comp.connect(rev); rev.connect(actx.destination); comp.connect(actx.destination);

  // Sub-drone
  const drone=actx.createOscillator(); drone.type='sawtooth'; drone.frequency.value=38;
  const lp=actx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=115;
  const lfo=actx.createOscillator(); lfo.frequency.value=0.06;
  const lfog=actx.createGain(); lfog.gain.value=340;
  lfo.connect(lfog); lfog.connect(lp.frequency);
  droneGain=actx.createGain(); droneGain.gain.value=0.28;
  drone.connect(lp); lp.connect(droneGain); droneGain.connect(master); drone.start(); lfo.start();

  // Steam hiss (bandpass noise)
  const buf=actx.createBuffer(1,actx.sampleRate*4,actx.sampleRate);
  const bd=buf.getChannelData(0); for(let i=0;i<buf.length;i++) bd[i]=(Math.random()*2-1)*0.18;
  const noise=actx.createBufferSource(); noise.buffer=buf; noise.loop=true;
  const hp=actx.createBiquadFilter(); hp.type='bandpass'; hp.frequency.value=2800; hp.Q.value=0.35;
  const hg=actx.createGain(); hg.gain.value=0.14; noise.connect(hp); hp.connect(hg); hg.connect(master); noise.start();

  // High freq hum (industrial)
  const hum=actx.createOscillator(); hum.type='sine'; hum.frequency.value=120;
  const humg=actx.createGain(); humg.gain.value=0.04;
  hum.connect(humg); humg.connect(master); hum.start();

  // Random metal creaks
  function creak(){
    setTimeout(()=>{
      if(!actx) return;
      const b=actx.createBuffer(1,actx.sampleRate*0.5,actx.sampleRate);
      const d=b.getChannelData(0);
      for(let i=0;i<b.length;i++) d[i]=(Math.random()*2-1)*Math.exp(-i/(actx.sampleRate*0.1))*0.30;
      const s=actx.createBufferSource(); s.buffer=b;
      const f=actx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=350;
      const g=actx.createGain(); g.gain.value=0.5;
      s.connect(f); f.connect(g); g.connect(master); s.start(); creak();
    },5000+Math.random()*15000);
  }
  creak();

  // Random distant thuds
  function thud(){
    setTimeout(()=>{
      if(!actx) return;
      const o=actx.createOscillator(); o.type='sine';
      o.frequency.setValueAtTime(68,actx.currentTime);
      o.frequency.exponentialRampToValueAtTime(16,actx.currentTime+0.5);
      const g=actx.createGain();
      g.gain.setValueAtTime(0.45,actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,actx.currentTime+0.52);
      o.connect(g); g.connect(master); o.start(); o.stop(actx.currentTime+0.55); thud();
    },8000+Math.random()*20000);
  }
  thud();

  // Drip sound
  function drip(){
    setTimeout(()=>{
      if(!actx) return;
      const o=actx.createOscillator(); o.type='sine'; o.frequency.value=800+Math.random()*400;
      const g=actx.createGain();
      g.gain.setValueAtTime(0.05,actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,actx.currentTime+0.12);
      o.connect(g); g.connect(master); o.start(); o.stop(actx.currentTime+0.13); drip();
    },3000+Math.random()*8000);
  }
  drip();
}

function playFootstep(){
  if(!actx) return;
  const now=performance.now();
  const interval=G.keys.shift?255:G.crouching?610:440;
  if(now-G.lastFoot<interval) return;
  G.lastFoot=now;
  const b=actx.createBuffer(1,actx.sampleRate*0.12,actx.sampleRate);
  const d=b.getChannelData(0);
  for(let i=0;i<b.length;i++) d[i]=(Math.random()*2-1)*Math.exp(-i/(actx.sampleRate*0.022));
  const s=actx.createBufferSource(); s.buffer=b;
  s.playbackRate.value=0.60+Math.random()*0.40;
  const f=actx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=G.crouching?160:240;
  const g=actx.createGain(); g.gain.value=G.crouching?0.25:0.80;
  s.connect(f); f.connect(g); g.connect(master); s.start();
}

function playBeep(freq,dur){
  if(!actx) return;
  const o=actx.createOscillator(); o.type='square'; o.frequency.value=freq;
  const g=actx.createGain();
  g.gain.setValueAtTime(0.12,actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001,actx.currentTime+dur);
  o.connect(g); g.connect(master); o.start(); o.stop(actx.currentTime+dur);
}

function playClick(){
  if(!actx) return;
  const o=actx.createOscillator(); o.type='square'; o.frequency.value=1200;
  const g=actx.createGain();
  g.gain.setValueAtTime(0.05,actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001,actx.currentTime+0.03);
  o.connect(g); g.connect(master); o.start(); o.stop(actx.currentTime+0.04);
}

function playScreech(){
  if(!actx) return;
  const b=actx.createBuffer(1,actx.sampleRate*0.55,actx.sampleRate);
  const d=b.getChannelData(0);
  for(let i=0;i<b.length;i++){
    const t=i/actx.sampleRate;
    d[i]=Math.sin(t*2200*Math.PI+Math.sin(t*48)*3.0)*(Math.random()*0.30)*(1-t*1.8);
  }
  const s=actx.createBufferSource(); s.buffer=b;
  const g=actx.createGain(); g.gain.value=0.42;
  s.connect(g); g.connect(master); s.start();
}

/* ================================================================
   CUTSCENE SYSTEM
================================================================ */
const CS_SUBS=[
  {t:0,   d:4.5, text:'Jawa Tengah, 12 Oktober 1998. Pukul 01:37 WIB.'},
  {t:4.5, d:4.2, text:'Pabrik Gula Nirmala mati total tanpa peringatan.'},
  {t:8.7, d:4.0, text:'"Masuk. Nyalakan generatornya. Jangan kembali sebelum selesai."'},
  {t:12.7,d:4.2, text:'Kamu tidak tahu bahwa bukan listrik yang mati pertama kali.'},
  {t:16.9,d:2.2, text:'Sesuatu menunggu di sana. Sejak lama.'},
  {t:19.1,d:2.5, text:'Dan ia tau kamu akan datang.'},
];
const CS_PATH=[
  {t:0,  pos:new THREE.Vector3(0,14,110),   look:new THREE.Vector3(0,8,0)},
  {t:4,  pos:new THREE.Vector3(-55,11,62),  look:new THREE.Vector3(-40,6,0)},
  {t:7,  pos:new THREE.Vector3(-50,4,-38),  look:new THREE.Vector3(-50,4,0)},
  {t:10, pos:new THREE.Vector3(0,18,0),     look:new THREE.Vector3(0,0,-55)},
  {t:13, pos:new THREE.Vector3(22,3,-50),   look:new THREE.Vector3(-62,3,-60)},
  {t:16, pos:new THREE.Vector3(-40,2,22),   look:new THREE.Vector3(0,2,0)},
  {t:19, pos:new THREE.Vector3(70,8,-28),   look:new THREE.Vector3(0,5,0)},
  {t:22, pos:new THREE.Vector3(0,1.75,52),  look:new THREE.Vector3(0,1.75,38)},
  {t:23, pos:new THREE.Vector3(0,1.75,52),  look:new THREE.Vector3(0,1.75,38)},
];
const CS_DURATION=22;

let csActive=false, csDone=false, csStart=null;
const csCvs=document.getElementById('cut-canvas');
const csCtx=csCvs.getContext('2d');

function startCutscene(onEnd){
  csCvs.width=innerWidth; csCvs.height=innerHeight;
  csActive=true; csDone=false; csStart=null;
  document.getElementById('screen-cut').style.display='block';
  setActiveCamera(camCut);
  document.getElementById('cut-tc').classList.add('rec');
  document.getElementById('cut-chapter').style.opacity=1;
  document.getElementById('cut-chapter').textContent='PROLOG';

  document.getElementById('cut-skip').onclick=()=>endCutscene(onEnd);

  function drawOverlay(){
    if(!csActive) return;
    csCvs.width=innerWidth; csCvs.height=innerHeight;
    const W=csCvs.width,H=csCvs.height;
    const id=csCtx.createImageData(W,H);
    for(let i=0;i<id.data.length;i+=4){
      const g2=(Math.random()-0.5)*28;
      id.data[i]=id.data[i+1]=id.data[i+2]=128+g2; id.data[i+3]=14;
    }
    csCtx.putImageData(id,0,0);
    requestAnimationFrame(drawOverlay);
  }
  requestAnimationFrame(drawOverlay);
}

function updateCutscene(elapsed){
  if(!csActive||csDone) return;
  if(csStart===null) csStart=elapsed;
  const t=elapsed-csStart;

  // Camera path
  const path=CS_PATH;
  let seg=0;
  for(let i=0;i<path.length-1;i++){if(t>=path[i].t) seg=i;}
  const s0=path[seg], s1=path[Math.min(seg+1,path.length-1)];
  const dur=Math.max(0.001,s1.t-s0.t);
  const raw=Math.max(0,Math.min(1,(t-s0.t)/dur));
  const a=raw*raw*(3-2*raw);
  camCut.position.lerpVectors(s0.pos,s1.pos,a);
  const lk=s0.look.clone().lerp(s1.look,a);
  camCut.lookAt(lk);

  // Subtitles
  const sub=CS_SUBS.find(s=>t>=s.t&&t<s.t+s.d);
  const subEl=document.getElementById('cut-sub');
  if(sub){
    const ft=Math.min(1,(t-sub.t)/0.6)*Math.min(1,(sub.t+sub.d-t)/0.6);
    subEl.style.opacity=ft; subEl.textContent=sub.text;
  } else {subEl.style.opacity=0;}

  // Location + chapter
  const locEl=document.getElementById('cut-loc');
  if(t<6){locEl.style.opacity=Math.min(1,(t-0.5)/0.9);locEl.textContent='PABRIK GULA NIRMALA · JAWA TENGAH · 1998';}
  else locEl.style.opacity=Math.max(0,1-(t-6)/0.6);

  document.getElementById('cut-tc').textContent=`01:37:${Math.floor(t%60).toString().padStart(2,'0')}`;

  if(t>=CS_DURATION) endCutscene(()=>plc.lock());
}

function endCutscene(onEnd){
  if(csDone) return; csDone=true; csActive=false;
  document.getElementById('screen-cut').style.display='none';
  setActiveCamera(camGame);
  if(onEnd) onEnd();
}

/* ================================================================
   MENU BACKGROUND — cinematic 2D animated silhouette
================================================================ */
function runMenuBg(){
  const cvs=document.getElementById('menu-canvas');
  const ctx=cvs.getContext('2d');
  let t=0, raf=null;
  function draw(){
    if(document.getElementById('screen-menu').style.display==='none'){if(raf)cancelAnimationFrame(raf);return;}
    cvs.width=innerWidth; cvs.height=innerHeight;
    const W=cvs.width,H=cvs.height; t+=0.016;

    // Background gradient
    const bgGrad=ctx.createLinearGradient(0,0,0,H);
    bgGrad.addColorStop(0,'#000000');
    bgGrad.addColorStop(0.5,'#020104');
    bgGrad.addColorStop(1,'#000000');
    ctx.fillStyle=bgGrad; ctx.fillRect(0,0,W,H);

    // Stars (slow drift)
    for(let s=0;s<90;s++){
      const sx=(s*139.5+t*1.8)%W;
      const sy=(s*93.1)%H;
      const alpha=Math.sin(t*0.8+s)*0.05+0.05;
      ctx.fillStyle=`rgba(255,255,255,${alpha})`; ctx.fillRect(sx,sy,1,1);
    }

    // Moon
    const mg=ctx.createRadialGradient(W*0.78,H*0.14,0,W*0.78,H*0.14,W*0.06);
    mg.addColorStop(0,`rgba(180,20,20,${0.9+Math.sin(t*0.45)*0.08})`);
    mg.addColorStop(0.45,'rgba(80,4,4,.4)'); mg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=mg; ctx.beginPath(); ctx.arc(W*0.78,H*0.14,W*0.06,0,Math.PI*2); ctx.fill();

    // Clouds (very dark)
    for(let ci=0;ci<5;ci++){
      const cx2=((ci*220+t*12)%W)*1.0;
      const cy=H*0.18+Math.sin(t*0.3+ci)*H*0.03;
      const cg=ctx.createRadialGradient(cx2,cy,0,cx2,cy,W*0.12);
      cg.addColorStop(0,'rgba(4,2,2,0.3)'); cg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=cg; ctx.beginPath(); ctx.ellipse(cx2,cy,W*0.12,H*0.05,0,0,Math.PI*2); ctx.fill();
    }

    // Factory floor
    ctx.fillStyle='#040408'; ctx.fillRect(W*0.05,H*0.42,W*0.90,H);

    // Chimneys
    [[0.11,0.11,0.055,0.45],[0.20,0.16,0.04,0.42],[0.65,0.09,0.065,0.48],[0.77,0.13,0.04,0.43],[0.40,0.18,0.038,0.40],[0.52,0.14,0.042,0.42]].forEach(([cx2,cy,cw,ch])=>{
      ctx.fillStyle='#030306'; ctx.fillRect(W*cx2,H*cy,W*cw,H*ch);
      // Smoke puff
      const smk=Math.abs(Math.sin(t*0.22+cx2*12))*0.18;
      const sg=ctx.createRadialGradient(W*(cx2+cw/2),H*(cy-0.025),0,W*(cx2+cw/2),H*(cy-0.025),W*0.045);
      sg.addColorStop(0,`rgba(12,10,10,${smk})`); sg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(W*(cx2+cw/2),H*(cy-0.025),W*0.045,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#030306';
    });

    // Window flickers
    for(let wi=0;wi<12;wi++) for(let wj=0;wj<4;wj++){
      const flick=Math.sin(t*6.8+wi*2.2+wj*1.1)>0.85&&Math.sin(t*3.1+wi)>0.72;
      const amber_flick=Math.sin(t*4.0+wi*1.5+wj*0.9)>0.9;
      if(flick){ctx.fillStyle=amber_flick?`rgba(255,175,55,${0.12+Math.sin(t+wi)*0.04})`:`rgba(180,50,10,${0.08+Math.sin(t*1.2+wi)*0.03})`;}
      else {ctx.fillStyle='rgba(0,0,0,0)';}
      ctx.fillRect(W*(0.11+wi*0.065),H*(0.48+wj*0.09),W*0.035,H*0.05);
    }

    // Foreground silhouette details
    ctx.fillStyle='#000'; ctx.fillRect(0,H*0.62,W*0.1,H*0.4); ctx.fillRect(W*0.9,H*0.60,W,H*0.4);

    // Red base glow (breathing)
    const rl=Math.abs(Math.sin(t*0.65))*0.09;
    const rg=ctx.createRadialGradient(W/2,H*0.80,0,W/2,H*0.80,W*0.48);
    rg.addColorStop(0,`rgba(150,0,0,${rl})`); rg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=rg; ctx.fillRect(0,H*0.45,W,H);

    // Film grain
    const gd=ctx.createImageData(W,H);
    for(let gi=0;gi<gd.data.length;gi+=4){const g2=(Math.random()-0.5)*16;gd.data[gi]=gd.data[gi+1]=gd.data[gi+2]=128+g2;gd.data[gi+3]=8;}
    ctx.putImageData(gd,0,0);

    raf=requestAnimationFrame(draw);
  }
  draw();
}

/* ================================================================
   NOTIFY / UI HELPERS
================================================================ */
function showNotify(msg, type=''){
  const el=document.getElementById('notif');
  el.textContent=msg; el.style.display='block';
  el.className=type;
  clearTimeout(showNotify._t);
  showNotify._t=setTimeout(()=>el.style.display='none',3500);
}

/* ================================================================
   LOADING SEQUENCE
================================================================ */
const STAGES=[
  'Menginisialisasi WebGL renderer...','Mengompilasi GLSL shaders...',
  'Generating PBR — Beton Kotor...','Generating PBR — Logam Berkarat...',
  'Generating PBR — Hazard Stripes...','Generating PBR — Kayu Lapuk...',
  'Generating PBR — Karet Industri...','Generating PBR — Keramik Lantai...',
  'Generating PBR — Plester Dinding...','Generating PBR — Kotoran Pabrik...',
  'Membangun lantai & langit-langit...','Membangun dinding & sekat...',
  'Membangun boiler & mesin besar...','Membangun sistem pipa overhead...',
  'Membangun conveyor belt...','Membangun pilar struktural...',
  'Membangun rak & storage...','Membangun vat gula & tangki...',
  'Membangun tong drum & kluster...','Membangun walkway & tangga...',
  'Membangun ruang kontrol...','Menempatkan dekorasi & clutter...',
  'Menempatkan item & catatan...','Mengkonfigurasi sistem lampu...',
  'Membangun AI musuh — Penjaga...','Membangun AI musuh — Bayangan...',
  'Mengkonfigurasi collision system...','Mengompilasi post-processing...',
  'Selesai — Jangan masuk ke dalam.'
];

async function boot(){
  const barEl=document.getElementById('ld-bar');
  const pctEl=document.getElementById('ld-pct');
  const msgEl=document.getElementById('ld-msg');
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const setP=(p,i)=>{
    barEl.style.width=p+'%'; pctEl.textContent=Math.floor(p)+'%';
    if(i!=null) msgEl.textContent=STAGES[Math.min(i,STAGES.length-1)];
  };

  setP(0,0); await delay(200);
  setP(3,1); await delay(160);

  const texTypes=['concrete','metal','hazard','wood','rubber','tile','plaster','grime'];
  for(let ti=0;ti<texTypes.length;ti++){
    TEXS[texTypes[ti]]=makeTex(texTypes[ti],256);
    setP(5+(ti/texTypes.length)*28,2+ti); await delay(50);
  }

  setP(38,10); await delay(50);
  buildWorld();
  setP(72,24); await delay(80);
  buildEnemies(); setP(82,25); await delay(60);
  setP(88,26); await delay(60);
  setP(95,27); await delay(70);
  setP(100,28); await delay(600);

  document.getElementById('screen-load').style.display='none';
  document.getElementById('screen-menu').style.display='flex';
  runMenuBg();
  startRenderLoop();
}

/* ================================================================
   POINTER LOCK
================================================================ */
document.getElementById('btn-play').addEventListener('click',()=>{
  document.getElementById('screen-menu').style.display='none';
  startCutscene(()=>plc.lock());
});

document.getElementById('btn-settings').addEventListener('click',()=>{
  document.getElementById('settings-panel').style.display='flex';
});
document.getElementById('settings-close').addEventListener('click',()=>{
  document.getElementById('settings-panel').style.display='none';
  // apply settings
  G.sfxVol=parseFloat(document.getElementById('sfx-vol').value);
  G.mouseSens=parseFloat(document.getElementById('mouse-sens').value);
  if(master) master.gain.value=G.sfxVol;
});

document.getElementById('death-restart').addEventListener('click',()=>location.reload());
document.getElementById('win-restart').addEventListener('click',()=>location.reload());
document.getElementById('note-close').addEventListener('click',closeNote);

plc.addEventListener('lock',()=>{
  if(!actx) initAudio();
  document.getElementById('screen-game').style.display='block';
  document.getElementById('screen-menu').style.display='none';
  G.startTime=G.startTime||Date.now();
});
plc.addEventListener('unlock',()=>{
  if(!G.missionDone&&!G.horrorOn&&!G._caughtOnce&&!G.escaped){
    if(document.getElementById('screen-note').style.display!=='flex'){
      document.getElementById('screen-game').style.display='none';
      document.getElementById('screen-menu').style.display='flex';
      runMenuBg();
    }
  }
});

/* ================================================================
   MAIN RENDER LOOP
================================================================ */
const clock=new THREE.Clock();

function startRenderLoop(){
  function loop(){
    requestAnimationFrame(loop);
    const dt=Math.min(clock.getDelta(),0.05);
    const elapsed=clock.getElapsedTime();

    if(csActive) updateCutscene(elapsed);

    if(plc.isLocked){
      updateMovement(dt);
      updateInteraction();

      // Update both enemies, track closest threat
      let closestDist=9999, worstState='patrol';
      ENEMIES.forEach(e=>{
        const res=updateEnemy(e,dt);
        if(res.dToPlayer<closestDist){closestDist=res.dToPlayer;worstState=res.state;}
      });

      // Enemy HUD + proximity ring
      const epEl=document.getElementById('ep');
      const heEl=document.getElementById('henemy');
      if(worstState==='chase'){epEl.className='chase';heEl.className='chase';heEl.textContent='DIA MENGEJARMU';}
      else if(worstState==='alert'||worstState==='stalk'){epEl.className='alert';heEl.className='alert';heEl.textContent='WASPADA';}
      else{epEl.className='';heEl.className='';heEl.textContent='';}

      updateSanity(dt);
      updateHorror(dt);
      drawMinimap();

      // Animate fans
      fanList.forEach((fb,i)=>{fb.rotation.z+=(3.1+i*0.12)*dt;});

      // Animate conveyors
      convList.forEach(cv=>{if(cv.mesh.material.map) cv.mesh.material.map.offset.x+=cv.dir*0.35*dt;});

      // Animate steam
      steamList.forEach(({grp,phase})=>{
        grp.children.forEach((puff,i)=>{
          puff.position.y=((elapsed*0.38+phase+i*0.5)%4.0)*0.8;
          puff.material.opacity=Math.max(0,0.10-puff.position.y*0.022);
          puff.scale.setScalar(1.0+puff.position.y*0.28);
        });
      });

      // Pulse film shader on enemy proximity
      filmPass.uniforms.uPulse.value=closestDist<15?Math.max(0,1-closestDist/15)*0.3:0;
    }

    filmPass.uniforms.uTime.value=elapsed;
    composer.render();
  }
  loop();
}

/* ================================================================
   RESIZE
================================================================ */
window.addEventListener('resize',()=>{
  const W=innerWidth,H=innerHeight;
  camGame.aspect=W/H; camGame.updateProjectionMatrix();
  camCut.aspect=W/H;  camCut.updateProjectionMatrix();
  renderer.setSize(W,H); composer.setSize(W,H);
});

// BOOT
boot();
