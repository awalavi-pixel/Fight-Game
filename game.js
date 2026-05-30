/* ═══════════════════════════════════════════════════════════════════════
   IRON FIST — ARCADE FIGHTER
   Pure HTML5 Canvas 2D Fighting Game
   No dependencies. No build tools.
═══════════════════════════════════════════════════════════════════════ */

'use strict';

// ─── CANVAS SETUP ───────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const GAME_W = 900;
const GAME_H = 420;
const GROUND_Y = GAME_H - 80;

function resizeCanvas() {
  const wrapper = document.getElementById('canvasWrapper');
  const ww = wrapper.clientWidth;
  const wh = wrapper.clientHeight;
  const scale = Math.min(ww / GAME_W, wh / GAME_H);
  canvas.width = GAME_W;
  canvas.height = GAME_H;
  canvas.style.width  = Math.floor(GAME_W * scale) + 'px';
  canvas.style.height = Math.floor(GAME_H * scale) + 'px';
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ─── AUDIO ENGINE ───────────────────────────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, type, dur, vol = 0.3, detune = 0) {
  try {
    ensureAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = type; osc.frequency.value = freq; osc.detune.value = detune;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.start(); osc.stop(audioCtx.currentTime + dur);
  } catch (e) {}
}

function playNoise(dur, vol = 0.2, freq = 800) {
  try {
    ensureAudio();
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    const src = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    filter.type = 'bandpass'; filter.frequency.value = freq;
    src.buffer = buf; src.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    src.start(); src.stop(audioCtx.currentTime + dur);
  } catch (e) {}
}

const SFX = {
  punch:   () => { playNoise(0.08, 0.35, 1200); playTone(120, 'square', 0.06, 0.1); },
  kick:    () => { playNoise(0.12, 0.4, 700); playTone(80, 'sawtooth', 0.08, 0.15); },
  special: () => {
    playTone(220, 'sawtooth', 0.05, 0.2);
    setTimeout(() => playTone(440, 'sine', 0.1, 0.25), 50);
    setTimeout(() => playTone(880, 'sine', 0.2, 0.3), 120);
    playNoise(0.3, 0.2, 500);
  },
  hit:     () => { playNoise(0.1, 0.5, 900); playTone(60, 'square', 0.05, 0.2); },
  block:   () => { playTone(300, 'square', 0.05, 0.15); playNoise(0.05, 0.1, 2000); },
  jump:    () => { playTone(300, 'sine', 0.08, 0.1); playTone(400, 'sine', 0.06, 0.08, 100); },
  victory: () => {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => playTone(f, 'sine', 0.3, 0.35), i * 120));
  },
  roundStart: () => {
    playTone(880, 'sawtooth', 0.1, 0.2);
    setTimeout(() => playTone(1100, 'sawtooth', 0.15, 0.25), 100);
  },
  ko: () => {
    playTone(200, 'sawtooth', 0.1, 0.3);
    setTimeout(() => playTone(100, 'sawtooth', 0.3, 0.4), 100);
    setTimeout(() => playTone(50, 'square', 0.5, 0.5), 250);
  }
};

// ─── INPUT ──────────────────────────────────────────────────────────────────
const Keys = {};
document.addEventListener('keydown', e => {
  Keys[e.code] = true;
  if (e.code === 'Escape') togglePause();
  if (e.code === 'Enter' && document.getElementById('startMenu').classList.contains('active')) {
    startGame();
  }
});
document.addEventListener('keyup', e => { Keys[e.code] = false; });

// ─── MATH HELPERS ───────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (lo, hi) => lo + Math.random() * (hi - lo);
const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));

// ─── PARTICLE SYSTEM ────────────────────────────────────────────────────────
const particles = [];

function spawnParticles(x, y, count, opts = {}) {
  const { color = '#ff8800', size = 4, speed = 5, gravity = 0.3, life = 40 } = opts;
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const spd = rand(speed * 0.4, speed);
    particles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - rand(1, 3),
      size: rand(size * 0.5, size),
      color,
      alpha: 1,
      life: rand(life * 0.6, life),
      maxLife: life,
      gravity
    });
  }
}

function spawnHitSparks(x, y, dir = 1) {
  for (let i = 0; i < 12; i++) {
    const angle = rand(-Math.PI / 4, Math.PI / 4) + (dir > 0 ? 0 : Math.PI);
    const spd = rand(3, 9);
    particles.push({
      x, y,
      vx: Math.cos(angle) * spd * dir,
      vy: Math.sin(angle) * spd - rand(0, 3),
      size: rand(2, 5),
      color: i % 3 === 0 ? '#ffffff' : (i % 3 === 1 ? '#ffee44' : '#ff8800'),
      alpha: 1, life: rand(15, 30), maxLife: 30, gravity: 0.2
    });
  }
}

function spawnSpecialEffect(x, y) {
  for (let i = 0; i < 30; i++) {
    const angle = (i / 30) * Math.PI * 2;
    particles.push({
      x, y,
      vx: Math.cos(angle) * rand(4, 10),
      vy: Math.sin(angle) * rand(4, 10),
      size: rand(3, 8),
      color: ['#cc44ff', '#ff44cc', '#4488ff', '#ffffff'][i % 4],
      alpha: 1, life: rand(25, 50), maxLife: 50, gravity: 0.1
    });
  }
}

function spawnDust(x, y, dir) {
  for (let i = 0; i < 3; i++) {
    particles.push({
      x: x + rand(-8, 8),
      y: y + rand(-4, 4),
      vx: -dir * rand(0.5, 2),
      vy: rand(-1, 0.5),
      size: rand(4, 10),
      color: '#c8a070',
      alpha: 0.6, life: rand(20, 35), maxLife: 35, gravity: -0.02
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += p.gravity;
    p.life--;
    p.alpha = p.life / p.maxLife;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.shadowBlur = p.size * 2;
    ctx.shadowColor = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ─── SCREEN SHAKE ───────────────────────────────────────────────────────────
let shakeFrames = 0;
let shakeIntensity = 0;

function triggerShake(frames, intensity) {
  shakeFrames = Math.max(shakeFrames, frames);
  shakeIntensity = Math.max(shakeIntensity, intensity);
}

// ─── HIT STOP ───────────────────────────────────────────────────────────────
let hitStopFrames = 0;

function triggerHitStop(frames) {
  hitStopFrames = Math.max(hitStopFrames, frames);
}

// ─── FIGHTER DEFINITION ─────────────────────────────────────────────────────
/*
  Fighter structure. Both fighters share the same class;
  color palette and AI flag distinguish them.
*/
class Fighter {
  constructor(opts) {
    this.id       = opts.id;        // 'p1' or 'p2'
    this.x        = opts.x;
    this.y        = GROUND_Y;
    this.isAI     = opts.isAI || false;
    this.palette  = opts.palette;   // { body, accent, trim, eye }
    this.name     = opts.name;

    // dimensions
    this.w = 52; this.h = 90;

    // physics
    this.vx = 0; this.vy = 0;
    this.onGround = true;
    this.facing = opts.facing || 1; // 1=right, -1=left

    // stats
    this.maxHp = 200;
    this.hp = 200;
    this.displayHp = 200;
    this.damageHp  = 200;

    // special meter (0–100)
    this.special = 0;

    // combat state
    this.state = 'idle'; // idle walk jump attack block hit death victory
    this.stateTimer = 0;
    this.attackType = null;
    this.attackCooldown = 0;
    this.specialCooldown = 0;
    this.blocking = false;
    this.knockback = 0;
    this.hitFlash = 0;
    this.invincible = 0;

    // animation
    this.animFrame  = 0;
    this.animTimer  = 0;
    this.animSpeed  = 8;

    // idle bob
    this.idleBob = 0;
    this.idleBobDir = 1;
    this.idleBobTimer = 0;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get foot() { return this.y + this.h; }

  takeDamage(dmg, kbx, isBlocked) {
    if (this.invincible > 0) return false;
    if (isBlocked) {
      this.hp -= Math.floor(dmg * 0.15);
      SFX.block();
      this.knockback = kbx * 0.5;
      return false;
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.special = Math.min(100, this.special + dmg * 0.4);
    this.hitFlash = 8;
    this.knockback = kbx;
    if (this.hp > 0) {
      this.state = 'hit'; this.stateTimer = 18;
      this.invincible = 10;
    } else {
      this.state = 'death'; this.stateTimer = 120;
    }
    return true;
  }

  getHitbox() {
    return { x: this.x + 6, y: this.y, w: this.w - 12, h: this.h };
  }

  getAttackBox() {
    if (!this.attackType) return null;
    const reach = { punch: 55, kick: 70, special: 120 }[this.attackType] || 55;
    const height = { punch: 30, kick: 55, special: 45 }[this.attackType] || 35;
    const yOff   = { punch: 20, kick: 40, special: 25 }[this.attackType] || 20;
    const xOff = this.facing === 1 ? this.x + this.w - 4 : this.x - reach + 4;
    return {
      x: xOff, y: this.y + yOff,
      w: reach, h: height
    };
  }

  // Advance animation timer
  tickAnim() {
    this.animTimer++;
    if (this.animTimer >= this.animSpeed) {
      this.animTimer = 0;
      this.animFrame++;
    }
  }

  update(opponent, dt) {
    // Timers
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.specialCooldown > 0) this.specialCooldown--;
    if (this.hitFlash > 0) this.hitFlash--;
    if (this.invincible > 0) this.invincible--;
    if (this.stateTimer > 0) this.stateTimer--;

    // Knockback decay
    this.knockback *= 0.7;
    this.x += this.knockback;

    // Apply physics
    if (!this.onGround) {
      this.vy += 0.8; // gravity
    }
    this.y += this.vy;

    // Ground
    if (this.y + this.h >= GROUND_Y + this.h) {
      this.y = GROUND_Y - this.h + this.h; // snap
      // Actually: fighter.y = foot position (top-left), ground is at GROUND_Y
      this.y = GROUND_Y;
      this.vy = 0;
      this.onGround = true;
    }

    // Walls
    this.x = clamp(this.x, 10, GAME_W - this.w - 10);

    // State machine
    if (this.state === 'death') {
      this.vx = 0;
      this.tickAnim();
      return;
    }
    if (this.state === 'victory') {
      this.vx = 0;
      this.tickAnim();
      return;
    }
    if (this.state === 'hit') {
      if (this.stateTimer <= 0) this.state = 'idle';
      this.tickAnim();
      return;
    }

    // Attack state: wait for animation
    if (this.state === 'attack') {
      if (this.stateTimer <= 0) {
        this.state = 'idle';
        this.attackType = null;
      }
      this.tickAnim();
      return;
    }

    // Movement / actions
    this.vx = 0;
    this.blocking = false;

    if (!this.isAI) {
      this.handlePlayerInput(opponent);
    } else {
      this.handleAI(opponent);
    }

    // Apply horizontal velocity
    this.x += this.vx;

    // Face opponent
    const dx = opponent.cx - this.cx;
    if (Math.abs(dx) > 2 && this.state !== 'attack') {
      this.facing = dx > 0 ? 1 : -1;
    }

    // Idle bob animation
    this.idleBobTimer++;
    if (this.idleBobTimer > 10) {
      this.idleBobTimer = 0;
      this.idleBob += this.idleBobDir;
      if (Math.abs(this.idleBob) >= 2) this.idleBobDir *= -1;
    }

    this.tickAnim();

    // Smooth HP display
    this.displayHp = lerp(this.displayHp, this.hp, 0.12);
    if (this.hp < this.damageHp) {
      this.damageHp = lerp(this.damageHp, this.hp, 0.025);
    } else {
      this.damageHp = this.hp;
    }
  }

  handlePlayerInput(opponent) {
    const moving = Keys['KeyA'] || Keys['KeyD'];

    if (Keys['KeyS'] && this.onGround) {
      this.blocking = true;
      this.state = 'block';
      return;
    }

    if (Keys['KeyA']) { this.vx = -4; }
    if (Keys['KeyD']) { this.vx =  4; }

    if (Keys['KeyW'] && this.onGround) {
      this.vy = -16;
      this.onGround = false;
      this.state = 'jump';
      SFX.jump();
    }

    if (!this.onGround) { this.state = 'jump'; }
    else if (moving)    { this.state = 'walk'; }
    else                { this.state = 'idle'; }

    // Dust when moving
    if (this.onGround && moving && Math.random() < 0.3) {
      spawnDust(this.cx, this.foot, this.vx > 0 ? 1 : -1);
    }

    // Attacks
    if (this.attackCooldown <= 0) {
      if (Keys['KeyJ']) { this.doAttack('punch', opponent); Keys['KeyJ'] = false; }
      else if (Keys['KeyK']) { this.doAttack('kick', opponent); Keys['KeyK'] = false; }
      else if (Keys['KeyL'] && this.special >= 100) {
        this.doSpecial(opponent);
        Keys['KeyL'] = false;
      }
    }
  }

  doAttack(type, opponent) {
    const stats = {
      punch:   { dmg: 14, kb: 4,  dur: 22, cd: 25 },
      kick:    { dmg: 22, kb: 7,  dur: 30, cd: 35 },
    }[type];
    this.state = 'attack';
    this.attackType = type;
    this.stateTimer = stats.dur;
    this.attackCooldown = stats.cd;
    if (type === 'punch') SFX.punch();
    else SFX.kick();

    // Hit detection at frame 8
    setTimeout(() => {
      if (!gameState.roundActive) return;
      const ab = this.getAttackBox();
      const hb = opponent.getHitbox();
      if (ab && rectsOverlap(ab, hb)) {
        const blocked = opponent.blocking && isFacing(opponent, this);
        const didHit = opponent.takeDamage(stats.dmg, stats.kb * -this.facing, blocked);
        if (didHit) {
          SFX.hit();
          spawnHitSparks(opponent.cx, opponent.cy - 20, this.facing);
          triggerShake(6, 4);
          triggerHitStop(4);
        }
      }
    }, 120);
  }

  doSpecial(opponent) {
    if (this.special < 100) return;
    this.special = 0;
    this.state = 'attack';
    this.attackType = 'special';
    this.stateTimer = 45;
    this.attackCooldown = 50;
    this.specialCooldown = 80;
    SFX.special();
    spawnSpecialEffect(this.cx, this.cy);

    setTimeout(() => {
      if (!gameState.roundActive) return;
      const ab = this.getAttackBox();
      const hb = opponent.getHitbox();
      if (ab && rectsOverlap(ab, hb)) {
        const blocked = opponent.blocking && isFacing(opponent, this);
        const didHit = opponent.takeDamage(55, 12 * -this.facing, blocked);
        if (didHit) {
          SFX.hit();
          spawnSpecialEffect(opponent.cx, opponent.cy - 20);
          triggerShake(12, 8);
          triggerHitStop(8);
        }
      }
    }, 160);
  }

  // ── AI BRAIN ──────────────────────────────────────────────────────────────
  handleAI(opponent) {
    const round   = gameState.round;
    const speed   = 2.2 + round * 0.5;
    const reactMs = Math.max(5, 35 - round * 8);
    const dist    = opponent.cx - this.cx;
    const absDist = Math.abs(dist);
    const hpRatio = this.hp / this.maxHp;
    const aggression = 0.45 + round * 0.18;

    // Random think timer
    if (!this._aiThink) this._aiThink = 0;
    this._aiThink--;

    if (this._aiThink > 0) {
      // Execute stored decision
      this._executeAIDecision(opponent, speed, dist, absDist, hpRatio, aggression);
      return;
    }

    // New decision
    this._aiThink = randInt(reactMs, reactMs + 20);
    const roll = Math.random();

    if (hpRatio < 0.25 && absDist > 180 && roll < 0.5) {
      this._aiAction = 'retreat';
    } else if (absDist > 140) {
      this._aiAction = roll < aggression ? 'advance' : 'idle';
    } else if (absDist < 70) {
      if (roll < 0.05 * round) {
        this._aiAction = 'jump_attack';
      } else if (roll < 0.15) {
        this._aiAction = 'block';
      } else if (roll < 0.35) {
        this._aiAction = 'retreat_short';
      } else {
        this._aiAction = 'attack';
      }
    } else {
      if (roll < 0.25) this._aiAction = 'attack';
      else if (roll < 0.4) this._aiAction = 'advance';
      else this._aiAction = 'idle';
    }

    this._executeAIDecision(opponent, speed, dist, absDist, hpRatio, aggression);
  }

  _executeAIDecision(opponent, speed, dist, absDist, hpRatio, aggression) {
    const action = this._aiAction || 'idle';

    switch (action) {
      case 'advance':
        this.vx = dist > 0 ? speed : -speed;
        this.state = 'walk';
        if (this.onGround && Math.random() < 0.2) spawnDust(this.cx, this.foot, this.vx > 0 ? 1 : -1);
        break;

      case 'retreat':
      case 'retreat_short':
        this.vx = dist > 0 ? -speed * 0.8 : speed * 0.8;
        this.state = 'walk';
        break;

      case 'block':
        this.blocking = true;
        this.state = 'block';
        break;

      case 'jump_attack':
        if (this.onGround) {
          this.vy = -15; this.onGround = false; this.state = 'jump'; SFX.jump();
        }
        if (this.attackCooldown <= 0 && absDist < 100) {
          this.doAttack(Math.random() < 0.5 ? 'punch' : 'kick', opponent);
        }
        break;

      case 'attack':
        if (this.attackCooldown <= 0 && absDist < 100) {
          const r = Math.random();
          if (this.special >= 100 && r < 0.35 + aggression * 0.2) {
            this.doSpecial(opponent);
          } else if (r < 0.55) {
            this.doAttack('punch', opponent);
          } else {
            this.doAttack('kick', opponent);
          }
        } else if (absDist > 80) {
          this.vx = dist > 0 ? speed * 0.6 : -speed * 0.6;
          this.state = 'walk';
        }
        break;

      case 'jump':
        if (this.onGround) { this.vy = -15; this.onGround = false; SFX.jump(); }
        this.state = 'jump';
        break;

      default:
        this.state = absDist > 5 ? 'idle' : 'idle';
        break;
    }
  }
}

// ─── RECT HELPERS ───────────────────────────────────────────────────────────
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

function isFacing(fighter, attacker) {
  // Fighter is blocking toward attacker
  const dx = attacker.cx - fighter.cx;
  return (dx > 0 && fighter.facing === 1) || (dx < 0 && fighter.facing === -1);
}

// ─── DRAWING HELPERS ────────────────────────────────────────────────────────
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── FIGHTER RENDERER ───────────────────────────────────────────────────────
/*
  Each fighter is drawn as a stylized pixel-art humanoid using canvas primitives.
  State determines pose. Facing flips the rendering.
*/
function drawFighter(f) {
  if (f.state === 'death' && f.stateTimer < 90) return; // flash during death intro

  ctx.save();

  const t = performance.now() / 1000;
  const bob = f.state === 'idle' ? Math.sin(t * 3 + (f.id === 'p2' ? Math.PI : 0)) * 2 : 0;

  // Hit flash
  if (f.hitFlash > 0 && Math.floor(f.hitFlash / 2) % 2 === 0) {
    ctx.globalAlpha = 0.3;
  }

  // Position transform: flip if facing left
  const px = f.x + f.w / 2;
  const py = f.y + bob;
  ctx.translate(px, py);
  ctx.scale(f.facing, 1);

  const p = f.palette;
  const hw = f.w / 2;

  // Shadow (always unflipped for ground contact)
  ctx.save();
  ctx.scale(1 / f.facing, 1); // undo flip for shadow
  const shadowAlpha = f.onGround ? 0.35 : 0.15 * (1 - Math.min(1, (GROUND_Y - f.foot) / 200));
  ctx.globalAlpha = shadowAlpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, f.h * 0.5 + 4 - bob, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Derive limb positions from state
  let pose = getPose(f);

  // Body glow on special
  if (f.special >= 100) {
    ctx.save();
    ctx.globalAlpha = 0.25 + Math.sin(t * 8) * 0.1;
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#cc44ff';
    ctx.fillStyle = '#cc44ff';
    ctx.beginPath();
    ctx.ellipse(0, -30, 28, 50, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── DRAW BODY PARTS ────────────────────────────────────
  const { headX, headY, torsoLean, legLift, armRaise, armExtend, kickLift, kickExtend, blockArm } = pose;

  // Back leg
  drawLeg(ctx, p, 6, f.h * 0.5 - 8, legLift * 0.3, false);
  // Back arm
  drawArm(ctx, p, 4, f.h * 0.18, armRaise * 0.4, armExtend * 0.4, false);

  // Torso
  ctx.save();
  ctx.rotate(torsoLean * 0.06);
  ctx.fillStyle = p.body;
  roundRect(-hw * 0.65, f.h * 0.22, hw * 1.3, f.h * 0.35, 6);
  ctx.fill();

  // Belt
  ctx.fillStyle = p.trim;
  ctx.fillRect(-hw * 0.65, f.h * 0.49, hw * 1.3, 7);
  ctx.restore();

  // Front leg
  drawLeg(ctx, p, -6, f.h * 0.5 - 8, legLift, f.state === 'attack' && f.attackType === 'kick');

  // Block effect
  if (f.state === 'block') {
    ctx.save();
    ctx.fillStyle = 'rgba(100,200,255,0.25)';
    ctx.beginPath();
    ctx.arc(-6, f.h * 0.3, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Front arm
  drawArm(ctx, p, -8, f.h * 0.2, armRaise, armExtend, f.state === 'attack' && f.attackType !== 'kick');

  // Head
  ctx.save();
  ctx.translate(headX, headY);

  // Hair / headband
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.arc(0, 0, 13, Math.PI * 0.8, Math.PI * 2.2);
  ctx.fill();

  // Face
  ctx.fillStyle = '#e8b090';
  ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();

  // Headband
  ctx.fillStyle = p.trim;
  ctx.fillRect(-13, -3, 26, 5);

  // Eye
  ctx.fillStyle = p.eye;
  ctx.beginPath();
  ctx.arc(6, -1, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(7, -2, 1.2, 0, Math.PI * 2); ctx.fill();

  // Expression change on hit
  if (f.state === 'hit') {
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
    // X eyes
    ctx.beginPath(); ctx.moveTo(3,-3); ctx.lineTo(7,0); ctx.moveTo(7,-3); ctx.lineTo(3,0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 3, 4, 0.1, Math.PI - 0.1); ctx.stroke();
  }

  ctx.restore();

  // Special attack aura
  if (f.state === 'attack' && f.attackType === 'special') {
    const at = f.animTimer / 45;
    ctx.save();
    ctx.globalAlpha = 0.6 - at * 0.5;
    ctx.strokeStyle = '#cc44ff';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 20; ctx.shadowColor = '#cc44ff';
    ctx.beginPath();
    ctx.arc(hw + 40, f.h * 0.3, 30 + at * 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function getPose(f) {
  const t = performance.now() / 200;
  const w = f.w; const h = f.h;

  const base = {
    headX: 2, headY: f.h * 0.1,
    torsoLean: 0,
    legLift: 0,
    armRaise: 0, armExtend: 0,
    kickLift: 0, kickExtend: 0,
    blockArm: false
  };

  switch (f.state) {
    case 'idle':
      base.headY = h * 0.1 + Math.sin(t) * 1;
      base.armRaise = Math.sin(t * 0.8) * 5;
      break;
    case 'walk': {
      const wt = t * 2;
      base.legLift = Math.sin(wt) * 15;
      base.armRaise = Math.cos(wt) * 10;
      base.headY = h * 0.1 + Math.abs(Math.sin(wt)) * 2;
      break;
    }
    case 'jump':
      base.legLift = -20;
      base.armRaise = -30;
      base.headY = h * 0.08;
      break;
    case 'attack':
      if (f.attackType === 'punch') {
        const pt = clamp(1 - f.stateTimer / 22, 0, 1);
        const ext = pt < 0.5 ? pt * 2 : 2 - pt * 2;
        base.armRaise = -10;
        base.armExtend = ext * 40;
        base.torsoLean = ext * 3;
      } else if (f.attackType === 'kick') {
        const kt = clamp(1 - f.stateTimer / 30, 0, 1);
        const ext = kt < 0.5 ? kt * 2 : 2 - kt * 2;
        base.legLift = ext * 40;
        base.armRaise = 10;
        base.torsoLean = -ext * 2;
      } else if (f.attackType === 'special') {
        const st = clamp(1 - f.stateTimer / 45, 0, 1);
        base.armRaise = -30 + st * 20;
        base.armExtend = st * 60;
        base.torsoLean = st * 6;
        base.legLift = Math.sin(st * Math.PI * 3) * 10;
      }
      break;
    case 'block':
      base.armRaise = -25;
      base.armExtend = 10;
      base.torsoLean = -2;
      base.blockArm = true;
      break;
    case 'hit':
      base.torsoLean = -4;
      base.headX = -3;
      base.armRaise = 15;
      break;
    case 'death': {
      const dp = clamp(1 - f.stateTimer / 80, 0, 1);
      base.torsoLean = dp * -8;
      base.legLift = dp * -20;
      base.armRaise = dp * 30;
      break;
    }
    case 'victory': {
      const vt = performance.now() / 400;
      base.armRaise = -40 + Math.abs(Math.sin(vt)) * 30;
      base.legLift  = Math.abs(Math.sin(vt * 0.7)) * 15;
      base.headY = f.h * 0.05;
      break;
    }
  }
  return base;
}

function drawLeg(ctx, p, xOff, yBase, liftAngle, isKick) {
  ctx.save();
  ctx.translate(xOff, yBase);

  const thighLen = 24;
  const shinLen  = 26;

  // Thigh
  ctx.strokeStyle = p.body;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const thighX = Math.sin(liftAngle * 0.025) * thighLen;
  const thighY = Math.cos(Math.abs(liftAngle * 0.025)) * thighLen;
  ctx.lineTo(thighX, thighY);
  ctx.stroke();

  // Shin
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(thighX, thighY);
  const shinAngle = isKick ? liftAngle * 0.04 : 0.15;
  ctx.lineTo(thighX + Math.sin(shinAngle) * shinLen, thighY + Math.cos(Math.abs(shinAngle - 0.3)) * shinLen * 0.9);
  ctx.stroke();

  // Boot
  ctx.fillStyle = p.trim;
  ctx.beginPath();
  const bx = thighX + Math.sin(shinAngle) * shinLen;
  const by = thighY + Math.cos(Math.abs(shinAngle - 0.3)) * shinLen * 0.9;
  ctx.ellipse(bx + 4, by + 4, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawArm(ctx, p, xOff, yBase, raise, extend, isAttacking) {
  ctx.save();
  ctx.translate(xOff, yBase);

  const upperLen = 20;
  const foreLen  = 20;
  const angleUp = raise * 0.03 - 0.3;

  ctx.strokeStyle = p.body;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const ux = Math.sin(angleUp) * upperLen;
  const uy = Math.cos(angleUp) * upperLen;
  ctx.lineTo(ux, uy);
  ctx.stroke();

  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 8;
  const foreAngle = angleUp + (extend * 0.03);
  ctx.beginPath();
  ctx.moveTo(ux, uy);
  const fx = ux + Math.sin(foreAngle) * foreLen;
  const fy = uy + Math.cos(foreAngle) * foreLen;
  ctx.lineTo(fx, fy);
  ctx.stroke();

  // Fist/glove
  ctx.fillStyle = isAttacking ? '#ffffff' : p.trim;
  if (isAttacking) {
    ctx.shadowBlur = 10; ctx.shadowColor = '#fff';
  }
  ctx.beginPath();
  ctx.arc(fx, fy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();
}

// ─── BACKGROUND STAGE ───────────────────────────────────────────────────────
function drawBackground() {
  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, GAME_H);
  skyGrad.addColorStop(0, '#0a0018');
  skyGrad.addColorStop(0.5, '#120030');
  skyGrad.addColorStop(1, '#1a0040');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // Stars
  if (!drawBackground._stars) {
    drawBackground._stars = Array.from({ length: 60 }, () => ({
      x: rand(0, GAME_W), y: rand(0, GAME_H * 0.55),
      r: rand(0.5, 2), a: rand(0.3, 1)
    }));
  }
  const st = performance.now() / 1000;
  drawBackground._stars.forEach((s, i) => {
    ctx.globalAlpha = s.a * (0.6 + Math.sin(st + i) * 0.4);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Distant city silhouette
  ctx.fillStyle = '#0d0020';
  const buildings = [
    [50, 260, 60, 90], [110, 240, 45, 110], [155, 255, 35, 95],
    [190, 235, 55, 115], [250, 250, 40, 100], [300, 245, 65, 105],
    [380, 238, 50, 112], [440, 252, 45, 98], [500, 242, 70, 108],
    [580, 248, 55, 102], [650, 240, 60, 110], [720, 255, 48, 95],
    [780, 245, 65, 105], [850, 252, 55, 98]
  ];
  buildings.forEach(([x, y, w, h]) => {
    ctx.fillRect(x, y, w, GAME_H - y);
    // Windows
    ctx.fillStyle = 'rgba(255,220,80,0.4)';
    for (let wy = y + 10; wy < GAME_H - 20; wy += 16) {
      for (let wx = x + 6; wx < x + w - 6; wx += 12) {
        if (Math.random() < 0.6) ctx.fillRect(wx, wy, 6, 8);
      }
    }
    ctx.fillStyle = '#0d0020';
  });

  // Glowing moon
  const moonX = 700, moonY = 70;
  ctx.save();
  ctx.shadowBlur = 40; ctx.shadowColor = '#8866ff';
  const moonGrad = ctx.createRadialGradient(moonX, moonY, 5, moonX, moonY, 35);
  moonGrad.addColorStop(0, '#fff');
  moonGrad.addColorStop(0.4, '#ccaaff');
  moonGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = moonGrad;
  ctx.beginPath(); ctx.arc(moonX, moonY, 35, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Ground platform
  const groundGrad = ctx.createLinearGradient(0, GROUND_Y - 10, 0, GAME_H);
  groundGrad.addColorStop(0, '#2a1a4a');
  groundGrad.addColorStop(0.1, '#1a0a30');
  groundGrad.addColorStop(1, '#0a0018');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, GROUND_Y - 10, GAME_W, GAME_H - GROUND_Y + 10);

  // Ground line glow
  ctx.shadowBlur = 15; ctx.shadowColor = '#6633cc';
  ctx.strokeStyle = '#8844ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y - 10);
  ctx.lineTo(GAME_W, GROUND_Y - 10);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Ground grid lines
  ctx.strokeStyle = 'rgba(100,50,180,0.25)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx < GAME_W; gx += 50) {
    ctx.beginPath();
    ctx.moveTo(gx, GROUND_Y - 10);
    ctx.lineTo(gx + 20, GAME_H);
    ctx.stroke();
  }
}

// ─── HUD UPDATES ────────────────────────────────────────────────────────────
function updateHUD() {
  const p1 = gameState.p1, p2 = gameState.p2;

  const hp1Pct = Math.max(0, p1.displayHp / p1.maxHp) * 100;
  const hp2Pct = Math.max(0, p2.displayHp / p2.maxHp) * 100;
  const dmg1Pct = Math.max(0, p1.damageHp / p1.maxHp) * 100;
  const dmg2Pct = Math.max(0, p2.damageHp / p2.maxHp) * 100;

  document.getElementById('hp1Bar').style.width     = hp1Pct + '%';
  document.getElementById('hp1Damage').style.width  = dmg1Pct + '%';
  document.getElementById('hp2Bar').style.width     = hp2Pct + '%';
  document.getElementById('hp2Damage').style.width  = dmg2Pct + '%';

  const timerEl = document.getElementById('timerDisplay');
  const t = Math.ceil(gameState.timer);
  timerEl.textContent = t;
  timerEl.className = 'timer-value' + (t <= 10 ? ' danger' : '');

  // Win indicators
  const p1Wins = '● '.repeat(gameState.p1Wins) + '○ '.repeat(2 - gameState.p1Wins);
  const p2Wins = '● '.repeat(gameState.p2Wins) + '○ '.repeat(2 - gameState.p2Wins);
  document.getElementById('p1Wins').textContent = p1Wins.trim();
  document.getElementById('p2Wins').textContent = p2Wins.trim();

  // Special meter (P1 only shown)
  const specPct = p1.special;
  document.getElementById('specialMeter').style.width = specPct + '%';
  const readyEl = document.getElementById('specialReady');
  readyEl.classList.toggle('visible', specPct >= 100);
}

// ─── ROUND ANNOUNCEMENT ─────────────────────────────────────────────────────
function showRoundAnnounce(roundNum, cb) {
  const el = document.getElementById('roundAnnounce');
  const rEl = document.getElementById('announceRound');
  const fEl = document.getElementById('announceFight');
  el.classList.remove('hidden');
  rEl.textContent = roundNum <= 3 ? `ROUND ${roundNum}` : 'FINAL ROUND';
  fEl.classList.remove('show');
  fEl.textContent = 'FIGHT!';

  SFX.roundStart();

  setTimeout(() => {
    fEl.classList.add('show');
    SFX.roundStart();
    setTimeout(() => {
      el.classList.add('hidden');
      fEl.classList.remove('show');
      if (cb) cb();
    }, 900);
  }, 900);
}

function showKO(winner, cb) {
  const el = document.getElementById('roundAnnounce');
  const rEl = document.getElementById('announceRound');
  const fEl = document.getElementById('announceFight');
  el.classList.remove('hidden');
  rEl.textContent = winner === 'p1' ? 'P1 WINS ROUND!' : 'AI WINS ROUND!';
  fEl.classList.add('show');
  fEl.textContent = 'K.O.!';
  SFX.ko();
  setTimeout(() => {
    el.classList.add('hidden');
    fEl.classList.remove('show');
    if (cb) cb();
  }, 2000);
}

// ─── VICTORY SCREEN ─────────────────────────────────────────────────────────
function showVictory(winner) {
  gameState.phase = 'victory';
  SFX.victory();
  const screen = document.getElementById('victoryScreen');
  screen.classList.remove('hidden');
  const label = document.getElementById('victoryLabel');
  const sub = document.getElementById('victorySub');
  const scores = document.getElementById('victoryScores');

  label.textContent = winner === 'p1' ? '🏆 PLAYER 1 WINS!' : '🤖 AI WINS!';
  label.style.color = winner === 'p1' ? 'var(--gold)' : 'var(--p2-color)';

  const isPerfect = winner === 'p1' ? gameState.p2.hp === gameState.p2.maxHp : gameState.p1.hp === gameState.p1.maxHp;
  sub.textContent = isPerfect ? '✦ PERFECT VICTORY ✦' : `MATCH COMPLETE`;

  scores.innerHTML =
    `P1 · KEN &nbsp;&nbsp; Rounds Won: ${gameState.p1Wins}<br>` +
    `AI · RYU &nbsp;&nbsp; Rounds Won: ${gameState.p2Wins}`;
}

// ─── GAME STATE ─────────────────────────────────────────────────────────────
const gameState = {
  phase: 'menu',   // menu, playing, roundEnd, victory
  round: 1,
  p1Wins: 0,
  p2Wins: 0,
  timer: 99,
  timerTick: 0,
  roundActive: false,
  paused: false,
  p1: null,
  p2: null
};

function createFighters() {
  gameState.p1 = new Fighter({
    id: 'p1', x: 150, isAI: false, facing: 1,
    name: 'KEN',
    palette: { body: '#3355cc', accent: '#2244aa', trim: '#ff3333', eye: '#3355cc' }
  });
  gameState.p2 = new Fighter({
    id: 'p2', x: GAME_W - 150 - 52, isAI: true, facing: -1,
    name: 'RYU',
    palette: { body: '#cc4422', accent: '#aa3311', trim: '#ffffff', eye: '#cc4422' }
  });
}

function resetRound() {
  gameState.roundActive = false;
  gameState.timer = 99;
  gameState.timerTick = 0;
  particles.length = 0;

  const p1 = gameState.p1, p2 = gameState.p2;
  p1.hp = p1.maxHp; p1.displayHp = p1.maxHp; p1.damageHp = p1.maxHp;
  p1.special = 0;
  p1.x = 150; p1.y = GROUND_Y; p1.vx = 0; p1.vy = 0;
  p1.state = 'idle'; p1.attackType = null;
  p1.attackCooldown = 0; p1.specialCooldown = 0;
  p1.facing = 1; p1.onGround = true;

  p2.hp = p2.maxHp; p2.displayHp = p2.maxHp; p2.damageHp = p2.maxHp;
  p2.special = 0;
  p2.x = GAME_W - 150 - 52; p2.y = GROUND_Y; p2.vx = 0; p2.vy = 0;
  p2.state = 'idle'; p2.attackType = null;
  p2.attackCooldown = 0; p2.specialCooldown = 0;
  p2.facing = -1; p2.onGround = true;
}

function startRound() {
  resetRound();
  showRoundAnnounce(gameState.round, () => {
    gameState.roundActive = true;
  });
}

function endRound(winner) {
  gameState.roundActive = false;
  gameState.phase = 'roundEnd';

  if (winner === 'p1') {
    gameState.p1Wins++;
    gameState.p1.state = 'victory';
    gameState.p2.state = 'death';
  } else if (winner === 'p2') {
    gameState.p2Wins++;
    gameState.p2.state = 'victory';
    gameState.p1.state = 'death';
  } else {
    // Time out: whoever has more HP wins
    if (gameState.p1.hp >= gameState.p2.hp) {
      gameState.p1Wins++;
      gameState.p1.state = 'victory';
    } else {
      gameState.p2Wins++;
      gameState.p2.state = 'victory';
    }
    winner = gameState.p1.hp >= gameState.p2.hp ? 'p1' : 'p2';
  }

  showKO(winner, () => {
    if (gameState.p1Wins >= 2) {
      showVictory('p1');
    } else if (gameState.p2Wins >= 2) {
      showVictory('p2');
    } else {
      gameState.round++;
      gameState.phase = 'playing';
      startRound();
    }
  });
}

function startGame() {
  document.getElementById('startMenu').classList.remove('active');
  document.getElementById('gameScreen').classList.add('active');
  gameState.phase = 'playing';
  gameState.round = 1;
  gameState.p1Wins = 0;
  gameState.p2Wins = 0;
  createFighters();
  startRound();
  if (!gameState._loopStarted) {
    gameState._loopStarted = true;
    requestAnimationFrame(gameLoop);
  }
}

function restartGame() {
  document.getElementById('victoryScreen').classList.add('hidden');
  gameState.phase = 'playing';
  gameState.round = 1;
  gameState.p1Wins = 0;
  gameState.p2Wins = 0;
  createFighters();
  startRound();
}

function returnToMenu() {
  document.getElementById('victoryScreen').classList.add('hidden');
  document.getElementById('gameScreen').classList.remove('active');
  document.getElementById('startMenu').classList.add('active');
  gameState.phase = 'menu';
  gameState._loopStarted = false;
}

function togglePause() {
  if (gameState.phase !== 'playing' && gameState.phase !== 'paused') return;
  gameState.paused = !gameState.paused;
  if (gameState.paused) {
    gameState.phase = 'paused';
    document.getElementById('pauseMenu').classList.remove('hidden');
  } else {
    gameState.phase = 'playing';
    document.getElementById('pauseMenu').classList.add('hidden');
  }
}

// ─── MAIN GAME LOOP ──────────────────────────────────────────────────────────
let lastTime = 0;

function gameLoop(now) {
  requestAnimationFrame(gameLoop);

  const dt = Math.min((now - lastTime) / 16.67, 3);
  lastTime = now;

  if (gameState.phase === 'menu' || gameState.phase === 'paused') {
    return;
  }

  // Hit stop
  if (hitStopFrames > 0) {
    hitStopFrames--;
    drawFrame();
    return;
  }

  if (gameState.roundActive) {
    // Timer countdown
    gameState.timerTick += dt;
    if (gameState.timerTick >= 60) {
      gameState.timerTick -= 60;
      gameState.timer--;
      if (gameState.timer <= 0) {
        gameState.timer = 0;
        endRound('timeout');
        return;
      }
    }

    // Update fighters
    gameState.p1.update(gameState.p2, dt);
    gameState.p2.update(gameState.p1, dt);

    // Check KO
    if (gameState.p1.hp <= 0 || gameState.p2.hp <= 0) {
      if (gameState.p1.hp <= 0 && gameState.p2.hp <= 0) endRound('timeout');
      else if (gameState.p1.hp <= 0) endRound('p2');
      else endRound('p1');
      return;
    }
  }

  updateParticles();
  updateHUD();
  drawFrame();

  // Screen shake
  if (shakeFrames > 0) shakeFrames--;
}

function drawFrame() {
  // Camera shake
  let sx = 0, sy = 0;
  if (shakeFrames > 0) {
    const mag = shakeIntensity * (shakeFrames / 12);
    sx = (Math.random() * 2 - 1) * mag;
    sy = (Math.random() * 2 - 1) * mag;
  }

  ctx.save();
  ctx.translate(sx, sy);

  drawBackground();
  drawParticles();
  drawFighter(gameState.p1);
  drawFighter(gameState.p2);

  // Debug hitboxes (disabled)
  // drawHitboxes();

  ctx.restore();
}

// ─── UI BINDINGS ─────────────────────────────────────────────────────────────
document.getElementById('btnStart').addEventListener('click', startGame);
document.getElementById('btnControls').addEventListener('click', () => {
  document.getElementById('startMenu').classList.remove('active');
  document.getElementById('controlsScreen').classList.add('active');
});
document.getElementById('btnBack').addEventListener('click', () => {
  document.getElementById('controlsScreen').classList.remove('active');
  document.getElementById('startMenu').classList.add('active');
});
document.getElementById('btnResume').addEventListener('click', togglePause);
document.getElementById('btnQuit').addEventListener('click', () => {
  togglePause();
  returnToMenu();
});
document.getElementById('btnRestart').addEventListener('click', restartGame);
document.getElementById('btnMainMenu').addEventListener('click', returnToMenu);

// Initial dummy frame draw
requestAnimationFrame(() => {
  ctx.fillStyle = '#0a0018';
  ctx.fillRect(0, 0, GAME_W, GAME_H);
});
