'use strict';
const DIRS = ['up', 'down', 'left', 'right'];
const ATTACK_BTNS = ['HP', 'LP', 'HK', 'LK'];
const NEUTRAL = new Set(['idle', 'walk', 'crouch', 'block', 'cblock']);
const HURT = new Set(['hit', 'air', 'frozen', 'stunned', 'pulled']);
const normAng = (r) => ((((r + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

function walkPose(ph) {
  const s = Math.sin(ph), c = Math.cos(ph);
  return pose({ torso: 0.1, fl1: 0.3 + s * 0.42, fl2: -0.35 - Math.max(0, -c) * 0.7, bl1: -0.25 - s * 0.42, bl2: -0.35 - Math.max(0, c) * 0.7, fa1: 0.6 + s * 0.08, ba1: 0.25 - s * 0.08 });
}
function idlePose(f) {
  const s = Math.sin(f * 0.07);
  return pose({ torso: 0.08 + s * 0.03, fa2: 2.0 + s * 0.08, ba2: 2.2 - s * 0.06, fl2: -0.4 - s * 0.04 });
}

class Fighter {
  constructor(match, char, side, ctrl) {
    this.m = match; this.c = char; this.side = side; this.ctrl = ctrl;
    this.wins = 0;
    this.reset();
  }

  reset() {
    this.x = STAGE_W / 2 + (this.side === 0 ? -170 : 170);
    this.y = 0; this.vx = 0; this.vy = 0;
    this.facing = this.side === 0 ? 1 : -1;
    this.health = 100; this.shownHealth = 100;
    this.setState('idle');
    this.move = null; this.hitDone = false; this.airMove = null; this.airT = 0;
    this.pose = { ...POSES.idle }; this.J = solvePose(this.pose);
    this.buf = []; this.queued = null; this.stun = 0; this.inv = 0; this.juggle = 0; this.combo = 0;
    this.jumpDir = 0; this.walkPh = 0; this.projOut = 0; this.bounced = false;
    this.damageTaken = 0; this.finishMe = false; this.dead = false;
    this.flags = { alpha: 1, sink: 0 }; this.forcePose = 'idle'; this.poseSpeed = 0.3; this.fatalPhys = false;
    this.flash = 0; this.hitPose = 'hitHigh'; this.pendingBtn = null;
  }

  setState(s) { this.state = s; this.t = 0; }
  get opp() { return this.m.f[1 - this.side]; }
  held(a) { return !!(this.ctrl && this.ctrl.held[a]); }
  fwdKey() { return this.facing > 0 ? 'right' : 'left'; }
  backKey() { return this.facing > 0 ? 'left' : 'right'; }
  dist() { return Math.abs(this.opp.x - this.x); }
  faceOpp() { const o = this.opp; if (Math.abs(o.x - this.x) > 2) this.facing = o.x > this.x ? 1 : -1; }
  wp(p) { return { x: this.x + p.x * this.facing, y: this.y - p.y }; }
  limbPt(l) { return l === 'c' ? midPt(this.J.hip, this.J.sh, 0.5) : this.J[l]; }

  approach(target, k) {
    const p = this.pose;
    for (const key of POSE_KEYS) {
      const d = key === 'rot' ? normAng(target.rot - p.rot) : target[key] - p[key];
      p[key] += d * k;
    }
    p.flat = target.flat;
  }

  pushDir(d) {
    const rel = d === 'up' ? 'U' : d === 'down' ? 'D' : (d === 'right') === (this.facing > 0) ? 'F' : 'B';
    this.buf.push({ d: rel, f: this.m.frame });
    if (this.buf.length > 12) this.buf.shift();
  }
  matchSeq(seq, win) {
    let i = seq.length - 1;
    for (let k = this.buf.length - 1; k >= 0; k--) {
      const e = this.buf[k];
      if (this.m.frame - e.f > win) break;
      if (e.d === seq[i] && --i < 0) return true;
    }
    return false;
  }

  // During hit-freeze frames, remember inputs so quick taps aren't dropped.
  capture() {
    const c = this.ctrl;
    if (!c || c.ai) return;
    for (const d of DIRS) if (c.pressed(d)) this.pushDir(d);
    this.pendingBtn = ATTACK_BTNS.find((b) => c.pressed(b)) || this.pendingBtn;
  }

  // -------------------------------------------------------------------------
  update() {
    this.t++;
    if (this.inv > 0) this.inv--;
    if (this.flash > 0) this.flash--;
    const c = this.ctrl;
    if (c) for (const d of DIRS) if (c.pressed(d)) this.pushDir(d);
    const fn = this['st_' + this.state];
    if (fn) fn.call(this, this.opp);
    this.J = solvePose(this.pose);
  }

  readInput(o) {
    const c = this.ctrl;
    if (!c || c.ai) return null;
    const btn = ATTACK_BTNS.find((b) => c.pressed(b)) || this.pendingBtn;
    this.pendingBtn = null;
    const dirPressed = DIRS.some((d) => c.pressed(d));
    const m = this.m;
    if (btn && m.phase === 'finish' && m.finishWinner === this) {
      for (const fd of this.c.fatalities) if (fd.btn === btn && this.matchSeq(fd.seq, 60) && this.dist() <= fd.max) return { fatal: fd };
    }
    for (const sp of this.c.specials) {
      if ((sp.btn ? btn === sp.btn : dirPressed) && this.matchSeq(sp.seq, 24)) return { special: sp };
    }
    if (!btn) return null;
    return { move: this.pickNormal(btn, o) };
  }

  pickNormal(btn, o) {
    if (this.held('down')) return { HP: 'UPPER', LP: 'CLP', LK: 'CLK', HK: 'CHK' }[btn];
    const back = this.held(this.backKey());
    if (back && btn === 'LK') return 'SWEEP';
    if (back && btn === 'HK') return 'RH';
    if ((btn === 'LP' || btn === 'HP') && this.canThrow(o)) return 'THROW';
    return btn;
  }

  exec(cmd, o) {
    if (cmd.fatal) {
      if (this.m.phase !== 'finish' || this.m.finishWinner !== this) return false;
      this.m.startFatality(this, o, cmd.fatal);
      return true;
    }
    if (cmd.special) return this.doSpecial(cmd.special, o);
    if (cmd.jump !== undefined) { this.startJump(cmd.jump); return true; }
    if (cmd.move === 'THROW') {
      if (this.canThrow(o)) { this.startThrow(o); return true; }
      return this.startMove(MOVES.HP);
    }
    const mv = MOVES[cmd.move];
    return mv ? this.startMove(mv) : false;
  }

  doSpecial(sp, o) {
    this.buf.length = 0;
    if (sp.type === 'proj') {
      if (this.projOut > 0) return false;
      return this.startMove(Object.assign({}, PROJ_MOVE, { spawn: PROJECTILES[sp.proj] }));
    }
    if (sp.type === 'dash') return this.startMove(DASHES[sp.dash]);
    if (sp.type === 'teleport') {
      this.setState('tele'); this.teleAttack = sp.attack;
      SFX.teleport(); this.m.puff(this);
      return true;
    }
    return false;
  }

  startMove(mv) {
    this.setState('attack');
    this.move = mv; this.hitDone = false; this.pose0 = { ...this.pose }; this.vx = 0;
    return true;
  }
  startJump(dir) { this.setState('prejump'); this.jumpDir = dir; }

  canThrow(o) {
    return Math.abs(o.x - this.x) < 88 && o.y === 0 && (o.state === 'idle' || o.state === 'walk' || o.state === 'block') && !o.inv && !o.dead && this.y === 0;
  }
  startThrow(o) {
    this.setState('throw');
    o.setState('thrown'); o.thrower = this; o.tsx = o.x; o.vx = 0; o.facing = -this.facing;
    SFX.whoosh();
  }

  // -------------------------------------------------------------------------
  // States
  // -------------------------------------------------------------------------
  neutral(o) {
    this.faceOpp();
    const act = this.m.canAct(this);
    if (act) {
      const cmd = this.queued || this.readInput(o);
      this.queued = null;
      if (cmd && this.stun <= 0 && this.exec(cmd, o)) return;
    } else this.queued = null;
    if (this.stun > 0) { // blockstun
      this.stun--; this.vx *= 0.85; this.x += this.vx;
      this.approach(POSES[this.state === 'cblock' ? 'cblock' : 'block'], 0.5);
      return;
    }
    const Hd = (a) => act && this.held(a);
    const fwd = Hd(this.fwdKey()), back = Hd(this.backKey()), down = Hd('down'), up = Hd('up'), bl = Hd('BL');
    this.vx = 0;
    if (bl) this.state = down ? 'cblock' : 'block';
    else if (up) { this.startJump(fwd ? 1 : back ? -1 : 0); return; }
    else if (down) this.state = 'crouch';
    else if (fwd || back) { this.state = 'walk'; this.vx = (fwd ? 3.6 : -3.0) * this.facing; this.walkPh += fwd ? 0.2 : -0.17; }
    else this.state = 'idle';
    this.x += this.vx;
    let target;
    if (this.state === 'walk') target = walkPose(this.walkPh);
    else if (this.state === 'idle') target = idlePose(this.m.frame + this.side * 40);
    else target = POSES[this.state];
    this.approach(target, 0.35);
  }
  st_idle(o) { this.neutral(o); }
  st_walk(o) { this.neutral(o); }
  st_crouch(o) { this.neutral(o); }
  st_block(o) { this.neutral(o); }
  st_cblock(o) { this.neutral(o); }

  st_prejump() {
    this.approach(POSES.crouch, 0.5);
    if (this.t >= 3) {
      this.setState('jump');
      this.vy = 18.5; this.vx = this.jumpDir * 4.6 * this.facing; this.y = 1;
      this.airMove = null; this.airT = 0; this.hitDone = false;
      SFX.jump();
    }
  }

  st_jump() {
    this.vy -= GRAV; this.y += this.vy; this.x += this.vx;
    if (!this.airMove && this.m.canAct(this)) {
      let cmd = this.queued; this.queued = null;
      if (!cmd && this.ctrl && !this.ctrl.ai) {
        const b = ATTACK_BTNS.find((k) => this.ctrl.pressed(k)) || this.pendingBtn;
        this.pendingBtn = null;
        if (b) cmd = { move: b[1] === 'P' ? 'JP' : 'JK' };
      }
      if (cmd && (cmd.move === 'JK' || cmd.move === 'JP')) {
        this.airMove = MOVES[cmd.move]; this.airT = 0; this.hitDone = false; SFX.whoosh();
      }
    }
    if (this.airMove) {
      this.airT++;
      this.approach(POSES[this.airMove.pose], 0.45);
    } else {
      this.approach(POSES.jump, 0.3);
      if (this.jumpDir) this.pose.rot = this.jumpDir * TAU * clamp((this.t - 3) / 40, 0, 1);
    }
    if (this.y <= 0 && this.vy < 0) {
      this.y = 0; this.vx = 0; this.pose.rot = 0; this.airMove = null;
      this.setState('land'); SFX.land();
    }
  }
  st_land() {
    this.approach(POSES.crouch, 0.4); this.faceOpp();
    if (this.t >= 5) this.setState('idle');
  }

  st_attack() {
    const mv = this.move, t = this.t, S = mv.startup, A = mv.active, R = mv.recovery;
    const strike = POSES[mv.pose];
    const base = mv.crouchBase ? POSES.crouch : POSES.idle;
    if (t <= S) {
      const k = t / S;
      if (mv.wind) this.pose = k < 0.5 ? lerpPose(this.pose0, POSES[mv.wind], ease(k * 2)) : lerpPose(POSES[mv.wind], strike, ease((k - 0.5) * 2));
      else this.pose = lerpPose(this.pose0, strike, ease(k));
      if (mv.step) this.x += mv.step * this.facing;
      if (t === S) {
        if (mv.spawn) this.m.spawnProj(this, mv.spawn);
        else SFX.whoosh();
      }
    } else if (t <= S + A) {
      this.pose = { ...strike };
      if (mv.dash) { this.vx = mv.speed * this.facing; this.y = lerp(this.y, mv.airY, 0.3); }
      if (mv.spin) this.pose.rot = (t - S) * mv.spin;
    } else if (t <= S + A + R) {
      this.pose = lerpPose(strike, base, ease((t - S - A) / R));
      if (mv.dash) { this.vx *= 0.8; this.y = lerp(this.y, 0, 0.3); }
    } else {
      this.y = 0; this.vx = 0;
      this.setState(mv.crouchBase && this.held('down') ? 'crouch' : 'idle');
      return;
    }
    if (mv.dash) this.x += this.vx;
  }

  st_throw() {
    this.approach(POSES.throw, 0.3);
    if (this.t >= 36) this.setState('idle');
  }
  st_thrown() {
    const a = this.thrower, k = Math.min(1, this.t / 26);
    this.x = lerp(this.tsx, a.x - a.facing * 95, ease(k));
    this.y = Math.sin(k * Math.PI) * 170;
    this.approach(POSES.air, 0.3);
    this.pose.rot = -k * Math.PI * 2.5;
    if (k >= 1) {
      this.y = 0; this.pose.rot = normAng(this.pose.rot);
      const M = this.m;
      this.health = Math.max(0, this.health - 12); this.damageTaken += 12;
      M.blood({ x: this.x, y: 20 }, 14, 0); M.shake = 10; SFX.thud(); SFX.hit(true);
      this.setState('down');
      if (this.health <= 0) M.onKO(this, a);
    }
  }

  st_tele(o) {
    const t = this.t;
    if (t < 12) this.flags.alpha = 1 - t / 12;
    if (t === 12) {
      const side = Math.sign(o.x - this.x) || 1;
      this.x = clamp(o.x + side * 95, 60, STAGE_W - 60); this.y = 0;
      this.faceOpp(); this.m.puff(this);
    }
    if (t > 12) this.flags.alpha = Math.min(1, (t - 12) / 6);
    if (t >= 18) {
      this.flags.alpha = 1;
      if (this.teleAttack) this.startMove(MOVES.TELEPUNCH); else this.setState('idle');
    }
  }

  st_hit() {
    this.stun--; this.vx *= 0.85; this.x += this.vx;
    this.approach(POSES[this.hitPose], 0.5);
    if (this.stun <= 0) this.recover();
  }

  st_air() {
    this.vy -= GRAV; this.y += this.vy; this.x += this.vx;
    const rot = this.pose.rot;
    this.approach(POSES.air, 0.25);
    this.pose.rot = rot + this.spinRate;
    if (this.y <= 0 && this.vy < 0) {
      this.y = 0;
      if (this.vy < -9 && !this.bounced) {
        this.vy = 4.5; this.y = 1; this.bounced = true; this.vx *= 0.6;
        SFX.thud(); this.m.dust(this.x); return;
      }
      this.bounced = false; this.vx *= 0.4;
      this.pose.rot = normAng(this.pose.rot);
      this.setState('down'); SFX.thud(); this.m.dust(this.x);
      this.m.shake = Math.max(this.m.shake, 4);
    }
  }

  st_down() {
    this.vx *= 0.8; this.x += this.vx; this.juggle = 0;
    this.approach(POSES.down, 0.3);
    if (!this.dead && this.t > 40) { this.setState('getup'); this.inv = 24; }
  }
  st_getup() {
    this.approach(this.t < 12 ? POSES.crouch : POSES.idle, 0.25);
    this.pose.flat = Math.abs(this.pose.rot) > 0.25;
    if (this.t >= 22) { this.faceOpp(); this.recover(); }
  }
  recover() {
    this.combo = 0;
    if (this.finishMe) { this.setState('dizzy'); this.m.startFinish(this); }
    else this.setState('idle');
  }

  st_frozen() {
    this.vx *= 0.8; this.x += this.vx;
    if (this.y > 0) { this.vy -= GRAV; this.y = Math.max(0, this.y + this.vy); }
    if (this.t >= 110) this.setState('idle');
  }
  st_pulled() {
    const dx = this.puller.x - this.x;
    this.x += Math.sign(dx) * 14; this.y = Math.max(0, this.y - 8);
    this.approach(POSES.hitHigh, 0.4);
    if (Math.abs(dx) < 100 || this.t > 60) { this.y = 0; this.setState('stunned'); }
  }
  st_stunned() {
    const d = POSES.dizzy, s = Math.sin(this.t * 0.12);
    this.approach(pose({ ...d, torso: d.torso + s * 0.12, head: d.head + s * 0.2 }), 0.3);
    if (this.t >= 65) this.setState('idle');
  }
  st_dizzy() {
    const d = POSES.dizzy, s = Math.sin(this.t * 0.08);
    this.vx *= 0.8; this.x += this.vx;
    this.approach(pose({ ...d, torso: d.torso + s * 0.15, head: d.head + s * 0.25, fa1: d.fa1 + s * 0.2 }), 0.2);
  }
  st_win() { this.vx = 0; this.approach(POSES.win, 0.15); }
  st_fatal() {
    if (this.fatalPhys) {
      this.vy -= GRAV; this.y += this.vy; this.x += this.vx;
      if (this.y < 0) { this.y = 0; this.vy = 0; this.vx = 0; }
    }
    const target = typeof this.forcePose === 'string' ? (this.forcePose === 'walk' ? walkPose((this.walkPh += 0.2)) : POSES[this.forcePose]) : this.forcePose;
    this.approach(target, this.poseSpeed);
  }

  // -------------------------------------------------------------------------
  // Combat
  // -------------------------------------------------------------------------
  activeHit() {
    let mv = null;
    if (this.state === 'attack') {
      const a = this.move;
      if (a.limb && this.t > a.startup && this.t <= a.startup + a.active) mv = a;
    } else if (this.state === 'jump' && this.airMove && this.airT > this.airMove.startup) mv = this.airMove;
    if (!mv || this.hitDone) return null;
    const p = this.wp(this.limbPt(mv.limb));
    return { x: p.x, y: p.y, r: mv.r || 16, m: mv };
  }

  hurtbox() {
    const J = this.J;
    let x1 = 1e9, x2 = -1e9, top = -1e9, bot = 1e9;
    for (const k of ['hip', 'sh', 'hd', 'fk', 'bk', 'ff', 'bf']) {
      const p = this.wp(J[k]);
      if (k !== 'ff' && k !== 'bf') { x1 = Math.min(x1, p.x); x2 = Math.max(x2, p.x); }
      top = Math.max(top, p.y); bot = Math.min(bot, p.y);
    }
    return { x1: x1 - 14, x2: x2 + 14, y1: Math.max(0, bot - 6), y2: top + 15 };
  }

  hittable() {
    if (this.inv > 0 || this.dead) return false;
    if (['down', 'getup', 'fatal', 'tele', 'thrown', 'win'].includes(this.state)) return false;
    if (this.state === 'air' && this.juggle >= 3) return false;
    return true;
  }

  isBlocking(att, mv) {
    if (mv.unblockable) return false;
    const facingAtt = (att.x - this.x) * this.facing > 0;
    if (!facingAtt) return false;
    if (this.state === 'block') return mv.level !== 'low';
    return this.state === 'cblock';
  }

  launch(att, f) {
    const away = Math.sign(this.x - att.x) || -this.facing;
    this.setState('air');
    this.vx = away * f[0]; this.vy = f[1]; this.y = Math.max(this.y, 1);
    this.juggle++; this.bounced = false;
    this.spinRate = f[1] > 12 ? -0.17 : -0.05;
  }

  takeHit(att, mv, pt) {
    const M = this.m;
    const away = Math.sign(this.x - att.x) || -this.facing;
    if (this.isBlocking(att, mv)) {
      this.health = Math.max(Math.min(this.health, 0.5), this.health - (mv.dmg || 5) * 0.15);
      this.stun = mv.blockstun || 12; this.vx = away * (mv.push || 6) * 0.9;
      M.spark(pt, true); SFX.block(); M.hitstop = 3;
      return 'block';
    }
    if (M.phase === 'finish' && this.state === 'dizzy') {
      this.dead = true; this.finishMe = false; this.launch(att, [6, 13]);
      M.blood(pt, 30, away); SFX.hit(true); M.hitstop = 8; M.shake = 10;
      M.onFinishHit(att, this);
      return 'hit';
    }
    const dmg = mv.dmg;
    this.health = Math.max(0, this.health - dmg); this.damageTaken += dmg;
    this.combo = HURT.has(this.state) ? this.combo + 1 : 1;
    if (this.combo >= 2) M.showCombo(att, this.combo);
    M.blood(pt, dmg * (mv.blood || 1.4), away);
    M.spark(pt, false);
    SFX.hit(mv.heavy || dmg >= 10);
    M.hitstop = mv.heavy ? 7 : 4;
    if (mv.heavy) M.shake = Math.max(M.shake, 8);
    this.flash = 4;
    if (this.health <= 0) { this.launch(att, [6, 14]); M.onKO(this, att); return 'hit'; }
    if (mv.launch || this.y > 0 || this.state === 'air') this.launch(att, mv.launch || [4, 9]);
    else {
      this.setState('hit');
      this.stun = mv.hitstun || 16; this.vx = away * (mv.push || 6);
      this.hitPose = mv.level === 'high' || mv.level === 'overhead' ? 'hitHigh' : 'hitLow';
    }
    return 'hit';
  }

  onHitLanded(mv) {
    if (mv.dash) this.t = mv.startup + mv.active;
  }
}
