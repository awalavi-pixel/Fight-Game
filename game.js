'use strict';

// ─── CANVAS SETUP ────────────────────────────────────────────────────────────
const canvas  = document.getElementById('gameCanvas');
const ctx     = canvas.getContext('2d');
const GAME_W  = 900;
const GAME_H  = 450;
const GROUND  = 360; // y where feet land

canvas.width  = GAME_W;
canvas.height = GAME_H;

function resizeCanvas() {
  const wrap = document.getElementById('canvasWrapper');
  const scaleX = wrap.clientWidth  / GAME_W;
  const scaleY = wrap.clientHeight / GAME_H;
  const s = Math.min(scaleX, scaleY) || 1;
  canvas.style.width  = Math.floor(GAME_W * s) + 'px';
  canvas.style.height = Math.floor(GAME_H * s) + 'px';
}
window.addEventListener('resize', resizeCanvas);
// Also resize whenever screen layout changes
const resizeObs = new ResizeObserver(resizeCanvas);
resizeObs.observe(document.getElementById('canvasWrapper'));

// ─── AUDIO ───────────────────────────────────────────────────────────────────
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
function tone(freq, type, dur, vol = 0.25, delay = 0) {
  try {
    ensureAudio();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = type; o.frequency.value = freq;
    const t = audioCtx.currentTime + delay;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur);
  } catch(e) {}
}
function noise(dur, vol = 0.2, bpFreq = 800, delay = 0) {
  try {
    ensureAudio();
    const sr = audioCtx.sampleRate;
    const buf = audioCtx.createBuffer(1, sr * dur, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource();
    const flt = audioCtx.createBiquadFilter();
    const g   = audioCtx.createGain();
    flt.type = 'bandpass'; flt.frequency.value = bpFreq;
    src.buffer = buf; src.connect(flt); flt.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime + delay;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.start(t); src.stop(t + dur);
  } catch(e) {}
}
const SFX = {
  punch:   () => { noise(0.07, 0.5, 1400); tone(100, 'square', 0.05, 0.1); },
  kick:    () => { noise(0.12, 0.55, 600); tone(70, 'sawtooth', 0.08, 0.18); },
  special: () => {
    noise(0.25, 0.3, 400);
    [220,440,880,1200].forEach((f,i) => tone(f,'sine',0.15,0.3,i*0.05));
  },
  hit:     () => { noise(0.1, 0.6, 1000); tone(55, 'square', 0.05, 0.25); },
  block:   () => { tone(350, 'square', 0.05, 0.2); noise(0.04, 0.1, 2500); },
  jump:    () => { tone(350, 'sine', 0.1, 0.12); tone(500, 'sine', 0.07, 0.1, 0.05); },
  victory: () => [523,659,784,1047].forEach((f,i) => tone(f,'sine',0.4,0.4,i*0.13)),
  ko:      () => { tone(180,'sawtooth',0.1,0.4); tone(80,'square',0.4,0.5,0.15); },
  round:   () => { tone(660,'sawtooth',0.08,0.3); tone(880,'sawtooth',0.12,0.35,0.1); }
};

// ─── INPUT ───────────────────────────────────────────────────────────────────
const Keys = {};
document.addEventListener('keydown', e => {
  Keys[e.code] = true;
  if (e.code === 'Escape') togglePause();
  if (e.code === 'Enter') {
    const menu = document.getElementById('startMenu');
    if (menu.classList.contains('active')) startGame();
  }
});
document.addEventListener('keyup', e => { Keys[e.code] = false; });

// ─── MATH ────────────────────────────────────────────────────────────────────
const clamp  = (v,lo,hi) => Math.max(lo, Math.min(hi, v));
const lerp   = (a,b,t)   => a + (b-a)*t;
const rand   = (lo,hi)   => lo + Math.random()*(hi-lo);
const randi  = (lo,hi)   => Math.floor(rand(lo, hi+1));

// ─── PARTICLES ───────────────────────────────────────────────────────────────
const particles = [];

function spawnSparks(x, y, dir, count = 12) {
  for (let i = 0; i < count; i++) {
    const a = rand(-Math.PI/3, Math.PI/3) + (dir > 0 ? 0 : Math.PI);
    const s = rand(3, 9);
    particles.push({
      x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s - rand(1,3),
      r: rand(2,5), life: rand(15,28), maxLife: 28,
      color: ['#fff','#ffe844','#ff8800'][i%3],
      grav: 0.25
    });
  }
}
function spawnSpecialFX(x, y) {
  for (let i = 0; i < 28; i++) {
    const a = (i/28)*Math.PI*2;
    particles.push({
      x, y, vx: Math.cos(a)*rand(5,12), vy: Math.sin(a)*rand(5,12),
      r: rand(3,8), life: rand(20,45), maxLife: 45,
      color: ['#cc44ff','#ff44cc','#44aaff','#fff'][i%4],
      grav: 0.08
    });
  }
}
function spawnDust(x, y, dir) {
  for (let i = 0; i < 4; i++) {
    particles.push({
      x: x + rand(-10,10), y: y + rand(-4,2),
      vx: -dir * rand(0.5,2.5), vy: rand(-1.5, 0.3),
      r: rand(5,12), life: rand(18,32), maxLife: 32,
      color: '#c8a888', grav: -0.04
    });
  }
}
function updateParticles() {
  for (let i = particles.length-1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.life--;
    if (p.life <= 0) particles.splice(i,1);
  }
}
function drawParticles() {
  particles.forEach(p => {
    const a = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowBlur  = p.r * 2.5;
    ctx.shadowColor = p.color;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * a, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  });
}

// ─── SCREEN SHAKE ────────────────────────────────────────────────────────────
let shakeDur = 0, shakeMag = 0;
function shake(dur, mag) { shakeDur = Math.max(shakeDur,dur); shakeMag = Math.max(shakeMag,mag); }

let hitStop = 0;
function triggerHitStop(f) { hitStop = Math.max(hitStop, f); }

// ─── FIGHTER ─────────────────────────────────────────────────────────────────
const FW = 56, FH = 95;  // fighter width, height

class Fighter {
  constructor(cfg) {
    Object.assign(this, {
      id: cfg.id, isAI: cfg.isAI||false,
      name: cfg.name, pal: cfg.pal,
      startX: cfg.x,
      x: cfg.x, y: GROUND - FH,
      vx: 0, vy: 0,
      facing: cfg.facing||1,
      onGround: true,
      maxHp: 200, hp: 200, dispHp: 200, damHp: 200,
      special: 0,
      state: 'idle',
      stateTimer: 0,
      atkType: null,
      atkCD: 0, specCD: 0,
      blocking: false,
      kbx: 0,
      hitFlash: 0,
      invincible: 0,
      animT: 0,
    });
  }

  get cx() { return this.x + FW/2; }
  get cy() { return this.y + FH/2; }
  get foot() { return this.y + FH; }
  get hitbox() { return { x:this.x+6, y:this.y, w:FW-12, h:FH }; }
  get atkbox() {
    if (!this.atkType) return null;
    const reach = {punch:60, kick:78, special:130}[this.atkType]||60;
    const yOff  = {punch:20, kick:45, special:30}[this.atkType]||20;
    const h     = {punch:30, kick:35, special:55}[this.atkType]||30;
    const bx = this.facing===1 ? this.x+FW-4 : this.x-reach+4;
    return { x:bx, y:this.y+yOff, w:reach, h };
  }

  reset(x) {
    this.x=x; this.y=GROUND-FH; this.vx=0; this.vy=0;
    this.hp=this.maxHp; this.dispHp=this.maxHp; this.damHp=this.maxHp;
    this.special=0; this.state='idle'; this.atkType=null;
    this.atkCD=0; this.specCD=0; this.blocking=false;
    this.kbx=0; this.hitFlash=0; this.invincible=0; this.animT=0;
    this.onGround=true;
  }

  takeDmg(dmg, kb, blocked) {
    if (this.invincible>0) return false;
    if (blocked) {
      this.hp = Math.max(0, this.hp - Math.floor(dmg*0.15));
      SFX.block(); this.kbx = kb*0.4; return false;
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.special = Math.min(100, this.special + dmg*0.45);
    this.hitFlash=8; this.kbx=kb; this.invincible=10;
    if (this.hp>0) { this.state='hit'; this.stateTimer=18; }
    else           { this.state='death'; this.stateTimer=140; }
    return true;
  }

  update(opp) {
    this.animT++;
    if (this.atkCD>0)   this.atkCD--;
    if (this.specCD>0)  this.specCD--;
    if (this.hitFlash>0) this.hitFlash--;
    if (this.invincible>0) this.invincible--;
    if (this.stateTimer>0) this.stateTimer--;

    // knockback
    this.kbx *= 0.72;
    this.x   += this.kbx;

    // gravity
    if (!this.onGround) this.vy += 0.85;
    this.y += this.vy;
    if (this.y + FH >= GROUND) {
      this.y = GROUND - FH; this.vy = 0; this.onGround = true;
    }

    // walls
    this.x = clamp(this.x, 8, GAME_W - FW - 8);

    // frozen states
    if (this.state==='death' || this.state==='victory') { this.vx=0; return; }
    if (this.state==='hit') { if (this.stateTimer<=0) this.state='idle'; return; }
    if (this.state==='attack') { if (this.stateTimer<=0){ this.state='idle'; this.atkType=null; } return; }

    this.vx = 0; this.blocking = false;
    if (this.isAI) this._ai(opp);
    else           this._player(opp);
    this.x += this.vx;

    // auto-face
    if (this.state!=='attack') {
      const dx = opp.cx - this.cx;
      if (Math.abs(dx)>2) this.facing = dx>0?1:-1;
    }

    // smooth HP
    this.dispHp = lerp(this.dispHp, this.hp, 0.12);
    if (this.hp < this.damHp) this.damHp = lerp(this.damHp, this.hp, 0.03);
    else this.damHp = this.hp;
  }

  _player(opp) {
    if (Keys['KeyS'] && this.onGround) { this.blocking=true; this.state='block'; return; }
    if (Keys['KeyA']) this.vx=-4.5;
    if (Keys['KeyD']) this.vx= 4.5;
    if (Keys['KeyW'] && this.onGround) { this.vy=-17; this.onGround=false; SFX.jump(); }

    if (!this.onGround)      this.state='jump';
    else if (this.vx!==0)    this.state='walk';
    else                     this.state='idle';

    if (this.onGround && this.vx!==0 && Math.random()<0.25)
      spawnDust(this.cx, this.foot, this.vx>0?1:-1);

    if (this.atkCD<=0) {
      if (Keys['KeyJ']) { this._atk('punch',opp); Keys['KeyJ']=false; }
      else if (Keys['KeyK']) { this._atk('kick',opp); Keys['KeyK']=false; }
      else if (Keys['KeyL'] && this.special>=100) { this._special(opp); Keys['KeyL']=false; }
    }
  }

  _atk(type, opp) {
    const cfg = { punch:{dmg:15,kb:5,dur:22,cd:26}, kick:{dmg:23,kb:8,dur:30,cd:36} }[type];
    this.state='attack'; this.atkType=type;
    this.stateTimer=cfg.dur; this.atkCD=cfg.cd;
    type==='punch' ? SFX.punch() : SFX.kick();
    setTimeout(()=>{
      if (!G.roundActive) return;
      const ab=this.atkbox, hb=opp.hitbox;
      if (ab && overlap(ab,hb)) {
        const blocked = opp.blocking && facing(opp,this);
        if (opp.takeDmg(cfg.dmg, cfg.kb*-this.facing, blocked)) {
          SFX.hit(); spawnSparks(opp.cx, opp.cy-20, this.facing);
          shake(6,4); triggerHitStop(4);
        }
      }
    }, 110);
  }

  _special(opp) {
    this.special=0; this.state='attack'; this.atkType='special';
    this.stateTimer=46; this.atkCD=55; this.specCD=80;
    SFX.special(); spawnSpecialFX(this.cx, this.cy);
    setTimeout(()=>{
      if (!G.roundActive) return;
      const ab=this.atkbox, hb=opp.hitbox;
      if (ab && overlap(ab,hb)) {
        const blocked = opp.blocking && facing(opp,this);
        if (opp.takeDmg(58, 14*-this.facing, blocked)) {
          SFX.hit(); spawnSpecialFX(opp.cx, opp.cy-20);
          shake(14,9); triggerHitStop(8);
        }
      }
    }, 160);
  }

  // ── AI ──────────────────────────────────────────────────────────────────
  _ai(opp) {
    const spd = 2.5 + G.round*0.55;
    const react = Math.max(5, 38 - G.round*9);
    const dist = opp.cx - this.cx;
    const adist = Math.abs(dist);
    const hp = this.hp/this.maxHp;
    const agg = 0.42 + G.round*0.2;

    if (!this._think) this._think=0;
    this._think--;
    if (this._think > 0) { this._doAI(opp,spd,dist,adist,hp,agg); return; }
    this._think = randi(react, react+22);

    const r = Math.random();
    if (hp<0.25 && adist>160 && r<0.55) this._act='retreat';
    else if (adist>130) this._act = r<agg ? 'advance' : 'idle';
    else if (adist<72) {
      if      (r<0.12)        this._act='block';
      else if (r<0.3)         this._act='retreat_s';
      else if (r<0.08*G.round) this._act='jump_atk';
      else                    this._act='attack';
    } else {
      if      (r<0.3)         this._act='attack';
      else if (r<0.55)        this._act='advance';
      else                    this._act='idle';
    }
    this._doAI(opp,spd,dist,adist,hp,agg);
  }

  _doAI(opp,spd,dist,adist,hp,agg) {
    const a = this._act||'idle';
    switch(a) {
      case 'advance':
        this.vx=dist>0?spd:-spd; this.state='walk';
        if (this.onGround && Math.random()<0.2) spawnDust(this.cx,this.foot,this.vx>0?1:-1);
        break;
      case 'retreat': case 'retreat_s':
        this.vx=dist>0?-spd*0.75:spd*0.75; this.state='walk'; break;
      case 'block':
        this.blocking=true; this.state='block'; break;
      case 'jump_atk':
        if (this.onGround){ this.vy=-16; this.onGround=false; SFX.jump(); }
        if (this.atkCD<=0 && adist<110) this._atk(Math.random()<0.5?'punch':'kick',opp);
        break;
      case 'attack':
        if (this.atkCD<=0 && adist<105) {
          const r=Math.random();
          if (this.special>=100 && r<0.32+agg*0.18) this._special(opp);
          else if (r<0.55) this._atk('punch',opp);
          else this._atk('kick',opp);
        } else if (adist>85) {
          this.vx=dist>0?spd*0.65:-spd*0.65; this.state='walk';
        }
        break;
      default:
        if (this.vx===0) this.state='idle';
    }
  }
}

// helpers
function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
function facing(f,atk){const dx=atk.cx-f.cx;return(dx>0&&f.facing===1)||(dx<0&&f.facing===-1);}

// ─── DRAW FIGHTER ────────────────────────────────────────────────────────────
function drawFighter(f) {
  const t = f.animT;
  const pal = f.pal;

  // During death: flash then fall
  if (f.state==='death') {
    if (Math.floor(t/4)%2===0 && f.stateTimer>60) return; // flash
  }

  // Hit flash (blink white)
  let flashAlpha = false;
  if (f.hitFlash>0 && Math.floor(f.hitFlash/2)%2===0) flashAlpha = true;

  // Derived positions (all absolute canvas coords)
  const bx = f.x + FW/2;   // body center X
  const by = f.y;           // top of fighter

  // Idle bob
  const bob = (f.state==='idle') ? Math.sin(t*0.18)*2.5 : 0;

  // Shadow on ground
  ctx.save();
  ctx.globalAlpha = f.onGround ? 0.4 : 0.2;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(bx, GROUND+4, 26, 7, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  if (flashAlpha) ctx.globalAlpha = 0.3;

  // ── derive limb angles by state ──────────────────────────────────────────
  let bodyBob   = bob;
  let torsoTilt = 0;   // lean forward/back (degrees)
  let rArmUp    = 0;   // right arm raise (positive = up)
  let rArmFwd   = 0;   // right arm extend forward
  let lArmUp    = 0;
  let lArmFwd   = 0;
  let rLegUp    = 0;   // right leg kick up
  let lLegUp    = 0;
  let headNod   = 0;

  const phase = (f.stateTimer > 0) ? clamp(1 - f.stateTimer/45, 0, 1) : 1;

  switch(f.state) {
    case 'idle':
      rArmUp = Math.sin(t*0.15)*8; lArmUp = -rArmUp*0.6;
      break;
    case 'walk': {
      const wt = t*0.22;
      rLegUp = Math.sin(wt)*25; lLegUp = -rLegUp;
      rArmUp = -Math.sin(wt)*18; lArmUp = Math.sin(wt)*18;
      bodyBob += Math.abs(Math.sin(wt))*3;
      break;
    }
    case 'jump':
      rLegUp = -30; lLegUp = -20;
      rArmUp = -40; lArmUp = -50;
      bodyBob = -8;
      break;
    case 'attack':
      if (f.atkType==='punch') {
        const pt = Math.sin(phase*Math.PI);
        rArmFwd = pt * 55; rArmUp = -10 - pt*5;
        torsoTilt = f.facing * pt * 5;
      } else if (f.atkType==='kick') {
        const kt = Math.sin(phase*Math.PI);
        rLegUp = kt * 55;
        lArmUp = kt * 20; rArmUp = -10;
        torsoTilt = -f.facing * kt * 4;
      } else { // special
        const st = Math.sin(phase*Math.PI);
        rArmFwd = st*70; rArmUp = -30+st*20; lArmFwd = st*30;
        torsoTilt = f.facing * st * 8;
        rLegUp = Math.sin(phase*Math.PI*2)*15;
      }
      break;
    case 'block':
      rArmUp = -30; rArmFwd = 15; lArmUp = -20; lArmFwd = 10;
      torsoTilt = -f.facing * 3;
      break;
    case 'hit':
      torsoTilt = -f.facing * 6; headNod = 8; rArmUp = 20; lArmUp = 10;
      break;
    case 'death': {
      const dp = clamp(1-f.stateTimer/100, 0, 1);
      torsoTilt = -f.facing * dp * 12; rArmUp = dp*35; lArmUp = dp*25;
      rLegUp = -dp*20; bodyBob = dp*10;
      break;
    }
    case 'victory': {
      const vt = t*0.12;
      rArmUp = -50 + Math.abs(Math.sin(vt))*30;
      lArmUp = -30 + Math.abs(Math.sin(vt+1))*20;
      rLegUp = Math.abs(Math.sin(vt*0.7))*20;
      bodyBob = -4;
      break;
    }
  }

  // ── draw body using absolute coords ──────────────────────────────────────
  // All coords computed from fighter's bounding box.
  // f.facing determines which side arms/legs are "front"
  const fl = f.facing; // 1=right, -1=left

  const headY  = by + bodyBob + 12;
  const torsoY = by + bodyBob + 26;
  const hipY   = by + bodyBob + 60;

  // Shoulder & hip positions
  const shoulderL = bx - 14*fl;  const shoulderR = bx + 14*fl;
  const hipL      = bx - 10*fl;  const hipR      = bx + 10*fl;

  // ── BACK arm (left relative to facing) ───────────────────────────────────
  drawArmAt(bx - 14*fl, torsoY+4, lArmUp, lArmFwd*fl, fl, pal.bodyDark, pal.bodyDark, false);

  // ── BACK leg ─────────────────────────────────────────────────────────────
  drawLegAt(bx - 8*fl, hipY, lLegUp*fl, fl, pal.legDark, pal.bootDark);

  // ── TORSO ─────────────────────────────────────────────────────────────────
  ctx.save();
  ctx.translate(bx, torsoY+17);
  ctx.rotate((torsoTilt * Math.PI)/180);
  // chest
  ctx.fillStyle = pal.body;
  ctx.beginPath();
  ctx.roundRect(-15, -18, 30, 36, 6);
  ctx.fill();
  // gi/shirt detail
  ctx.fillStyle = pal.trim;
  ctx.fillRect(-15, -18, 6, 36);
  // belt
  ctx.fillStyle = pal.belt;
  ctx.fillRect(-15, 12, 30, 8);
  ctx.restore();

  // ── FRONT leg ─────────────────────────────────────────────────────────────
  drawLegAt(bx + 8*fl, hipY, rLegUp*fl, fl, pal.leg, pal.boot);

  // ── BLOCK SHIELD ──────────────────────────────────────────────────────────
  if (f.state==='block') {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#88ccff';
    ctx.beginPath();
    ctx.arc(bx + fl*20, torsoY+14, 32, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── FRONT arm ─────────────────────────────────────────────────────────────
  drawArmAt(bx + 14*fl, torsoY+4, rArmUp, rArmFwd*fl, fl, pal.body, pal.glove,
            f.state==='attack' && f.atkType!=='kick');

  // ── HEAD ──────────────────────────────────────────────────────────────────
  ctx.save();
  ctx.translate(bx + fl*2, headY);
  ctx.rotate((headNod*fl * Math.PI)/180);

  // hair
  ctx.fillStyle = pal.hair;
  ctx.beginPath();
  ctx.arc(0, -2, 16, Math.PI*0.7, Math.PI*2.3);
  ctx.fill();

  // face
  ctx.fillStyle = '#e8b090';
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI*2);
  ctx.fill();

  // headband
  ctx.fillStyle = pal.trim;
  ctx.fillRect(-16, -3, 32, 7);
  ctx.fillStyle = pal.trim;
  ctx.fillRect(14*fl, -3, 6*fl, 7); // knot side

  // eyes
  if (f.state==='hit' || f.state==='death') {
    // X eyes
    ctx.strokeStyle='#333'; ctx.lineWidth=2;
    [[5*fl,-3],[10*fl,-3]].forEach(([ex,ey])=>{
      ctx.beginPath(); ctx.moveTo(ex-3,ey-3); ctx.lineTo(ex+3,ey+3);
      ctx.moveTo(ex+3,ey-3); ctx.lineTo(ex-3,ey+3); ctx.stroke();
    });
  } else {
    ctx.fillStyle='#222';
    ctx.beginPath(); ctx.arc(7*fl, -2, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(8*fl, -3, 1.5, 0, Math.PI*2); ctx.fill();
    // angry brow on attack
    if (f.state==='attack') {
      ctx.strokeStyle='#333'; ctx.lineWidth=2.5; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(3*fl,-9); ctx.lineTo(11*fl,-7); ctx.stroke();
    }
  }
  ctx.restore();

  // ── SPECIAL AURA ──────────────────────────────────────────────────────────
  if (f.state==='attack' && f.atkType==='special') {
    const at = clamp(1-f.stateTimer/46, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.55*(1-at);
    ctx.strokeStyle = pal.special || '#cc44ff';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 20; ctx.shadowColor = pal.special||'#cc44ff';
    const radius = 35 + at*30;
    ctx.beginPath(); ctx.arc(bx + fl*70, by+45, radius, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 0.3*(1-at);
    ctx.beginPath(); ctx.arc(bx + fl*70, by+45, radius*0.6, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // Passive special glow when meter full
  if (f.special>=100) {
    const pt = performance.now()/1000;
    ctx.save();
    ctx.globalAlpha = 0.15 + Math.sin(pt*6)*0.08;
    ctx.shadowBlur = 30; ctx.shadowColor = pal.special||'#cc44ff';
    ctx.fillStyle  = pal.special||'#cc44ff';
    ctx.beginPath(); ctx.ellipse(bx, by+FH/2+bodyBob, 26, 48, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  ctx.globalAlpha = 1;
}

// Draw an arm from a shoulder point
function drawArmAt(sx, sy, raiseAngle, fwdAngle, facing, upperColor, gloveColor, glowing) {
  const uLen = 22, fLen = 20;
  // upper arm angle: -90 = straight up, 0 = straight down, raiseAngle in degrees
  const ua = ((90 - raiseAngle) * Math.PI/180) + (fwdAngle * 0.015);
  const ex = sx + Math.cos(ua) * uLen * facing;
  const ey = sy + Math.sin(ua) * uLen;
  const fa = ua + fwdAngle*0.015 + 0.3;
  const fx = ex + Math.cos(fa) * fLen * facing;
  const fy = ey + Math.sin(fa) * fLen;

  ctx.lineCap = 'round';

  // upper arm
  ctx.strokeStyle = upperColor;
  ctx.lineWidth = 13;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
  // forearm
  ctx.strokeStyle = upperColor;
  ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(fx, fy); ctx.stroke();
  // glove/fist
  if (glowing) {
    ctx.save();
    ctx.shadowBlur = 14; ctx.shadowColor = '#fff';
    ctx.fillStyle = '#fff';
  } else {
    ctx.fillStyle = gloveColor;
  }
  ctx.beginPath(); ctx.arc(fx, fy, 8, 0, Math.PI*2); ctx.fill();
  if (glowing) ctx.restore();
}

// Draw a leg from a hip point
function drawLegAt(hx, hy, liftAngle, facing, thighColor, bootColor) {
  const tLen = 28, sLen = 26;
  const ta = ((80 - liftAngle) * Math.PI/180);
  const kx = hx + Math.cos(ta) * tLen * facing * 0.25;
  const ky = hy + Math.sin(ta) * tLen;
  const sa = ta + 0.2;
  const fx = kx + Math.cos(sa) * sLen * facing * 0.25;
  const fy = ky + Math.sin(sa) * sLen;

  ctx.lineCap = 'round';
  ctx.strokeStyle = thighColor;
  ctx.lineWidth = 15;
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.stroke();
  ctx.strokeStyle = thighColor;
  ctx.lineWidth = 13;
  ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
  // boot
  ctx.fillStyle = bootColor;
  ctx.beginPath();
  ctx.ellipse(fx + facing*4, fy+4, 13, 7, 0, 0, Math.PI*2);
  ctx.fill();
}

// ─── BACKGROUND ──────────────────────────────────────────────────────────────
// Pre-generate stars once
const STARS = Array.from({length:70}, () => ({
  x: rand(0,GAME_W), y: rand(0,GAME_H*0.55),
  r: rand(0.5,2.2), phase: rand(0,Math.PI*2)
}));

// Pre-generate buildings
const BUILDINGS = [
  [30,260,55,95],[90,245,42,110],[138,258,38,97],[182,240,58,115],
  [248,252,44,103],[300,242,68,113],[380,238,52,117],[445,254,46,101],
  [502,240,72,115],[586,250,57,105],[655,238,62,117],[726,252,50,103],
  [784,242,66,112],[855,250,52,105]
];
// Pre-build window layout
const WIN_DATA = BUILDINGS.map(([bx,by,bw,bh]) => {
  const wins = [];
  for (let wy=by+12; wy<GAME_H-20; wy+=18)
    for (let wx=bx+7; wx<bx+bw-7; wx+=13)
      if (Math.random()<0.55) wins.push([wx,wy]);
  return wins;
});

function drawBackground() {
  // sky
  const sky = ctx.createLinearGradient(0,0,0,GAME_H);
  sky.addColorStop(0,'#06000e');
  sky.addColorStop(0.55,'#110028');
  sky.addColorStop(1,'#1c0040');
  ctx.fillStyle = sky;
  ctx.fillRect(0,0,GAME_W,GAME_H);

  // stars
  const st = performance.now()/1000;
  STARS.forEach((s,i) => {
    ctx.globalAlpha = (0.4+Math.sin(st+s.phase)*0.35)*0.9;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha=1;

  // moon glow
  ctx.save();
  ctx.shadowBlur=50; ctx.shadowColor='#9966ff';
  const mg=ctx.createRadialGradient(720,65,4,720,65,38);
  mg.addColorStop(0,'#fff'); mg.addColorStop(0.45,'#ccaaff'); mg.addColorStop(1,'transparent');
  ctx.fillStyle=mg; ctx.beginPath(); ctx.arc(720,65,38,0,Math.PI*2); ctx.fill();
  ctx.restore();

  // buildings silhouette
  BUILDINGS.forEach(([bx,by,bw], i) => {
    ctx.fillStyle='#0c0020';
    ctx.fillRect(bx, by, bw, GAME_H-by);
    ctx.fillStyle='rgba(255,210,60,0.45)';
    WIN_DATA[i].forEach(([wx,wy]) => ctx.fillRect(wx,wy,7,9));
  });

  // ground
  const grd = ctx.createLinearGradient(0,GROUND-12,0,GAME_H);
  grd.addColorStop(0,'#2c1858'); grd.addColorStop(0.12,'#1c0a38'); grd.addColorStop(1,'#0a0018');
  ctx.fillStyle=grd;
  ctx.fillRect(0,GROUND-12,GAME_W,GAME_H-(GROUND-12));

  // ground glow line
  ctx.save();
  ctx.shadowBlur=18; ctx.shadowColor='#7733cc';
  ctx.strokeStyle='#9955ff'; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(0,GROUND-12); ctx.lineTo(GAME_W,GROUND-12); ctx.stroke();
  ctx.restore();

  // ground grid
  ctx.strokeStyle='rgba(120,60,200,0.18)'; ctx.lineWidth=1;
  for (let gx=0; gx<GAME_W; gx+=55) {
    ctx.beginPath(); ctx.moveTo(gx,GROUND-12); ctx.lineTo(gx+30,GAME_H); ctx.stroke();
  }
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
function updateHUD() {
  const p1=G.p1, p2=G.p2;
  document.getElementById('hp1Bar').style.width    = Math.max(0,p1.dispHp/p1.maxHp*100)+'%';
  document.getElementById('hp1Damage').style.width = Math.max(0,p1.damHp/p1.maxHp*100)+'%';
  document.getElementById('hp2Bar').style.width    = Math.max(0,p2.dispHp/p2.maxHp*100)+'%';
  document.getElementById('hp2Damage').style.width = Math.max(0,p2.damHp/p2.maxHp*100)+'%';

  const timerEl = document.getElementById('timerDisplay');
  const t = Math.ceil(G.timer);
  timerEl.textContent = t;
  timerEl.className = 'timer-value'+(t<=10?' danger':'');

  const mk = n => ('● '.repeat(n)+'○ '.repeat(2-n)).trim();
  document.getElementById('p1Wins').textContent = mk(G.p1Wins);
  document.getElementById('p2Wins').textContent = mk(G.p2Wins);

  document.getElementById('specialMeter').style.width = p1.special+'%';
  document.getElementById('specialReady').classList.toggle('visible', p1.special>=100);
}

// ─── ANNOUNCEMENTS ───────────────────────────────────────────────────────────
function announce(round, cb) {
  const el=document.getElementById('roundAnnounce');
  const rEl=document.getElementById('announceRound');
  const fEl=document.getElementById('announceFight');
  el.classList.remove('hidden');
  rEl.textContent = `ROUND ${round}`;
  fEl.classList.remove('show'); fEl.textContent='FIGHT!';
  SFX.round();
  setTimeout(()=>{
    fEl.classList.add('show'); SFX.round();
    setTimeout(()=>{ el.classList.add('hidden'); fEl.classList.remove('show'); cb&&cb(); },900);
  },900);
}

function announceKO(winner, cb) {
  const el=document.getElementById('roundAnnounce');
  const rEl=document.getElementById('announceRound');
  const fEl=document.getElementById('announceFight');
  el.classList.remove('hidden');
  rEl.textContent = winner==='p1'?'P1 WINS ROUND!':'AI WINS ROUND!';
  fEl.classList.add('show'); fEl.textContent='K.O.!';
  SFX.ko();
  setTimeout(()=>{ el.classList.add('hidden'); fEl.classList.remove('show'); cb&&cb(); },2000);
}

// ─── GAME STATE ──────────────────────────────────────────────────────────────
const G = {
  phase:'menu', round:1, p1Wins:0, p2Wins:0,
  timer:99, timerTick:0, roundActive:false, paused:false,
  p1:null, p2:null, _loop:false
};

function mkFighters() {
  G.p1 = new Fighter({
    id:'p1', isAI:false, name:'KEN', x:150, facing:1,
    pal:{
      body:'#2255dd', bodyDark:'#1133aa', leg:'#1a44bb', legDark:'#0e2a88',
      trim:'#ee2222', belt:'#ffffff', hair:'#cc8822', boot:'#222244', bootDark:'#111133',
      glove:'#ffffff', special:'#44aaff'
    }
  });
  G.p2 = new Fighter({
    id:'p2', isAI:true, name:'RYU', x:GAME_W-150-FW, facing:-1,
    pal:{
      body:'#dddddd', bodyDark:'#aaaaaa', leg:'#cccccc', legDark:'#999999',
      trim:'#222222', belt:'#222222', hair:'#111111', boot:'#333333', bootDark:'#222222',
      glove:'#cc2222', special:'#ff6644'
    }
  });
}

function resetRound() {
  G.roundActive=false; G.timer=99; G.timerTick=0; particles.length=0;
  G.p1.reset(150);
  G.p2.reset(GAME_W-150-FW);
  G.p1.facing=1; G.p2.facing=-1;
}

function startRound() {
  resetRound();
  announce(G.round, ()=>{ G.roundActive=true; });
}

function endRound(winner) {
  G.roundActive=false; G.phase='roundEnd';
  let w = winner;
  if (w==='timeout') w = G.p1.hp>=G.p2.hp ? 'p1':'p2';
  if (w==='p1') { G.p1Wins++; G.p1.state='victory'; G.p2.state='death'; }
  else           { G.p2Wins++; G.p2.state='victory'; G.p1.state='death'; }
  announceKO(w, ()=>{
    if (G.p1Wins>=2||G.p2Wins>=2) showVictory(w);
    else { G.round++; G.phase='playing'; startRound(); }
  });
}

function showVictory(w) {
  G.phase='victory'; SFX.victory();
  document.getElementById('victoryScreen').classList.remove('hidden');
  const lbl=document.getElementById('victoryLabel');
  lbl.textContent = w==='p1'?'PLAYER 1 WINS!':'AI WINS!';
  lbl.style.color = w==='p1'?'var(--gold)':'var(--p2-color)';
  document.getElementById('victorySub').textContent =
    (w==='p1'&&G.p2.hp<=0&&G.p2.hp===0) ? '✦ PERFECT ✦' : 'MATCH OVER';
  document.getElementById('victoryScores').innerHTML =
    `P1 · KEN &nbsp; Rounds: ${G.p1Wins}<br>AI · RYU &nbsp; Rounds: ${G.p2Wins}`;
}

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────
let lastTs = 0;

function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min((ts-lastTs)/16.67, 3);
  lastTs = ts;

  if (G.phase==='menu'||G.phase==='paused') return;

  if (hitStop>0) { hitStop--; render(); return; }

  if (G.roundActive) {
    G.timerTick+=dt;
    if (G.timerTick>=60) { G.timerTick-=60; G.timer--; }
    if (G.timer<=0) { G.timer=0; endRound('timeout'); return; }

    G.p1.update(G.p2);
    G.p2.update(G.p1);

    if (G.p1.hp<=0||G.p2.hp<=0) {
      if (G.p1.hp<=0&&G.p2.hp<=0) endRound('timeout');
      else if (G.p1.hp<=0) endRound('p2');
      else endRound('p1');
      return;
    }
  }

  updateParticles();
  updateHUD();
  render();
}

function render() {
  let sx=0,sy=0;
  if (shakeDur>0) {
    const m=shakeMag*(shakeDur/12);
    sx=(Math.random()*2-1)*m; sy=(Math.random()*2-1)*m;
    shakeDur--;
  }
  ctx.save();
  ctx.translate(sx,sy);
  drawBackground();
  drawParticles();
  drawFighter(G.p1);
  drawFighter(G.p2);
  ctx.restore();
}

// ─── GAME ACTIONS ─────────────────────────────────────────────────────────────
function startGame() {
  document.getElementById('startMenu').classList.remove('active');
  document.getElementById('gameScreen').classList.add('active');
  // Resize AFTER screen becomes visible
  setTimeout(resizeCanvas, 0);
  G.phase='playing'; G.round=1; G.p1Wins=0; G.p2Wins=0;
  mkFighters();
  startRound();
  if (!G._loop) { G._loop=true; requestAnimationFrame(loop); }
}

function restartGame() {
  document.getElementById('victoryScreen').classList.add('hidden');
  G.phase='playing'; G.round=1; G.p1Wins=0; G.p2Wins=0;
  mkFighters(); startRound();
}

function returnToMenu() {
  document.getElementById('victoryScreen').classList.add('hidden');
  document.getElementById('gameScreen').classList.remove('active');
  document.getElementById('startMenu').classList.add('active');
  G.phase='menu'; G._loop=false;
}

function togglePause() {
  if (G.phase!=='playing'&&G.phase!=='paused') return;
  G.paused=!G.paused;
  if (G.paused) {
    G.phase='paused';
    document.getElementById('pauseMenu').classList.remove('hidden');
  } else {
    G.phase='playing';
    document.getElementById('pauseMenu').classList.add('hidden');
  }
}

// ─── UI BINDINGS ──────────────────────────────────────────────────────────────
document.getElementById('btnStart').addEventListener('click', startGame);
document.getElementById('btnControls').addEventListener('click', ()=>{
  document.getElementById('startMenu').classList.remove('active');
  document.getElementById('controlsScreen').classList.add('active');
});
document.getElementById('btnBack').addEventListener('click', ()=>{
  document.getElementById('controlsScreen').classList.remove('active');
  document.getElementById('startMenu').classList.add('active');
});
document.getElementById('btnResume').addEventListener('click', togglePause);
document.getElementById('btnQuit').addEventListener('click', ()=>{ togglePause(); returnToMenu(); });
document.getElementById('btnRestart').addEventListener('click', restartGame);
document.getElementById('btnMainMenu').addEventListener('click', returnToMenu);
