'use strict';
function circleRect(c, r) {
  const x = clamp(c.x, r.x1, r.x2), y = clamp(c.y, r.y1, r.y2);
  return (c.x - x) ** 2 + (c.y - y) ** 2 <= c.r * c.r;
}
const FIRE_COLS = { fire: ['#ff3a00', '#ff9a1a', '#ffe080'], pink: ['#ff3aa0', '#ff9ae0', '#ffe0f4'] };
const BLOOD_COLS = ['#b00000', '#8a0000', '#d01010', '#6a0000'];

class Match {
  // opts: { chars:[c0,c1], ctrls:[c0,c1], ai:[lvl|null, lvl|null], stage, demo, onEnd }
  constructor(opts) {
    this.opts = opts;
    this.f = [0, 1].map((i) => new Fighter(this, opts.chars[i], i, opts.ctrls[i]));
    this.ai = this.f.map((f, i) => (opts.ai[i] != null ? new AIBrain(f, opts.ai[i]) : null));
    this.stage = getStage(opts.stage);
    this.frame = 0; this.round = 0;
    this.decals = [];
    this.startRound();
  }

  startRound() {
    this.round++;
    for (const f of this.f) f.reset();
    this.projs = []; this.parts = []; this.gibs = []; this.trophies = []; this.bolts = []; this.texts = []; this.combos = [];
    this.decals.length = 0;
    this.phase = 'intro'; this.pt = 0; this.timer = 99;
    this.cam = STAGE_W / 2 - W / 2; this.shake = 0; this.hitstop = 0;
    this.darken = 0; this.darkenTarget = 0;
    this.fatal = null; this.finishWinner = null; this.winner = null; this.loser = null;
    this.final = false; this.winShown = -1; this.fatalityDone = false;
  }

  canAct(f) { return this.phase === 'fight' || (this.phase === 'finish' && f === this.finishWinner); }
  other(f) { return this.f[1 - f.side]; }
  say(t) { if (!this.opts.demo) SFX.say(t); }
  text(str, style = 'gold', size = 72, dur = 90, y = 200) { this.texts.push({ str, style, size, dur, y, t: 0 }); }

  // -------------------------------------------------------------------------
  update() {
    this.frame++;
    this.darken = lerp(this.darken, this.darkenTarget, 0.05);
    if (this.hitstop > 0) { this.hitstop--; for (const f of this.f) f.capture(); return; }
    this.pt++;
    const pt = this.pt;
    switch (this.phase) {
      case 'intro':
        if (pt === 1) { this.text('ROUND ' + this.round, 'gold', 80, 70); this.say('Round ' + ['one', 'two', 'three', 'four', 'five'][Math.min(this.round - 1, 4)]); }
        if (pt === 72) { this.text('FIGHT!', 'red', 110, 50); this.say('Fight!'); SFX.gong(); }
        if (pt >= 92) { this.phase = 'fight'; this.pt = 0; }
        break;
      case 'fight':
        if (this.frame % 60 === 0 && this.timer > 0 && !this.opts.demo) { this.timer--; if (this.timer === 0) this.timeUp(); }
        break;
      case 'finish':
        if (pt === 420 && this.finishVictim.state === 'dizzy') {
          const v = this.finishVictim; v.dead = true; v.finishMe = false; v.launch(this.finishWinner, [1, 4]);
          this.onFinishHit(this.finishWinner, v);
        }
        break;
      case 'fatality':
        this.fatal.update();
        if (this.fatal.done) { this.phase = 'ko'; this.pt = 100; this.final = true; this.fatalityDone = true; }
        break;
      case 'ko': this.updateKO(); break;
    }
    for (let i = 0; i < 2; i++) if (this.ai[i]) this.ai[i].update(this);
    const px = this.f.map((f) => f.x);
    for (const f of this.f) f.update();
    this.resolve(px);
    this.checkHits();
    this.updateProjs();
    this.updateParts();
    for (const t of this.texts) t.t++;
    this.texts = this.texts.filter((t) => t.t < t.dur);
    for (const c of this.combos) c.t++;
    this.combos = this.combos.filter((c) => c.t < 70);
    const target = clamp((this.f[0].x + this.f[1].x) / 2 - W / 2, 0, STAGE_W - W);
    this.cam += (target - this.cam) * 0.15;
    for (const f of this.f) f.shownHealth = f.shownHealth > f.health ? Math.max(f.health, f.shownHealth - 0.45) : f.health;
  }

  updateKO() {
    const w = this.winner;
    if (this.winShown < 0 && this.pt >= 100) {
      const ready = w.y === 0 && ['idle', 'walk', 'crouch', 'block', 'cblock', 'land', 'fatal', 'win', 'throw'].includes(w.state);
      if (ready || this.pt > 400) {
        this.winShown = this.pt;
        w.y = 0; w.setState('win');
        this.text(w.c.name + ' WINS', 'gold', 64, 220, 150);
        if (w.damageTaken === 0 && !this.fatalityDone) {
          this.text('FLAWLESS VICTORY', 'gold', 54, 200, 225);
          setTimeout(() => this.say('Flawless victory'), 900);
        }
        this.say(w.c.name.toLowerCase() + ' wins');
      }
    }
    if (this.winShown >= 0 && this.pt === this.winShown + 210) {
      if (this.final) this.opts.onEnd && this.opts.onEnd(w.side, this);
      else this.startRound();
    }
  }

  onKO(victim, att) {
    if (this.phase !== 'fight') return;
    this.winner = att; this.loser = victim;
    att.wins++;
    this.final = att.wins >= 2;
    for (const p of this.projs) p.dead = true;
    if (this.final) { victim.finishMe = true; this.phase = 'koWait'; this.pt = 0; }
    else { victim.dead = true; this.phase = 'ko'; this.pt = 0; SFX.scream(); }
  }
  startFinish(victim) {
    this.phase = 'finish'; this.pt = 0;
    this.finishVictim = victim; this.finishWinner = this.other(victim);
    victim.inv = 0;
    this.text('FINISH ' + victim.c.pron + '!', 'red', 92, 150, 190);
    this.say('Finish ' + victim.c.pron.toLowerCase());
  }
  onFinishHit(att) {
    this.phase = 'ko'; this.pt = 0; this.winner = att; this.final = true;
    SFX.scream();
  }
  startFatality(w, v, def) {
    this.phase = 'fatality'; this.pt = 0;
    for (const p of this.projs) p.dead = true;
    this.fatal = new Fatality(this, w, v, def);
  }
  timeUp() {
    const [a, b] = this.f;
    const w = a.health >= b.health ? a : b, l = this.other(w);
    this.text('TIME', 'gold', 90, 80, 200);
    this.winner = w; this.loser = l; w.wins++; this.final = w.wins >= 2;
    l.dead = true; if (l.state !== 'down') l.launch(w, [2, 6]);
    this.phase = 'ko'; this.pt = 0;
  }

  resolve(px) {
    const [a, b] = this.f;
    const solid = (f) => !['tele', 'thrown', 'fatal', 'down'].includes(f.state);
    let dx = b.x - a.x;
    if (solid(a) && solid(b) && Math.abs(dx) < 56 && Math.abs(a.y - b.y) < 110) {
      const s = dx === 0 ? a.facing : Math.sign(dx), push = (56 - Math.abs(dx)) / 2;
      a.x -= push * s; b.x += push * s;
    }
    const MAXD = W - 90;
    dx = b.x - a.x;
    if (Math.abs(dx) > MAXD) {
      const ex = Math.abs(dx) - MAXD, s = Math.sign(dx);
      const awayA = (px[0] - a.x) * s, awayB = (b.x - px[1]) * s;
      let ka = awayA > 0 ? (awayB > 0 ? 0.5 : 1) : awayB > 0 ? 0 : 0.5;
      a.x += ex * ka * s; b.x -= ex * (1 - ka) * s;
    }
    for (const f of this.f) f.x = clamp(f.x, 40, STAGE_W - 40);
  }

  checkHits() {
    for (const A of this.f) {
      const D = this.other(A), h = A.activeHit();
      if (!h || !D.hittable()) continue;
      if (circleRect(h, D.hurtbox())) {
        A.hitDone = true;
        D.takeHit(A, h.m, h);
        A.onHitLanded(h.m);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Projectiles
  // -------------------------------------------------------------------------
  spawnProj(owner, def) {
    const hand = owner.wp(owner.J.fh);
    this.projs.push({ owner, def, x: hand.x + owner.facing * 12, y: Math.max(hand.y, 70), vx: def.speed * owner.facing, dist: 0, t: 0, dead: false });
    owner.projOut++;
    SFX[def.sfx]();
    if (def.kind === 'spear') { this.text('GET OVER HERE!', 'gold', 46, 60, 300); this.say('Get over here!'); }
  }

  updateProjs() {
    for (const p of this.projs) {
      if (p.dead) continue;
      p.t++; p.x += p.vx; p.dist += Math.abs(p.vx);
      const d = p.def, dir = Math.sign(p.vx);
      if (d.kind === 'fire' || d.kind === 'acid' || d.kind === 'orb') {
        const cols = d.kind === 'fire' ? FIRE_COLS.fire : ['#2aff40', '#9aff60', '#e0ffb0'];
        this.part({ x: p.x - dir * 8, y: p.y + rnd(-6, 6), vx: -dir * rnd(1, 3), vy: rnd(-0.5, 1.5), life: 18, type: 'fire', size: d.r * 0.7, col: pick(cols) });
      } else if (d.kind === 'ice') {
        this.part({ x: p.x, y: p.y + rnd(-10, 10), vx: -dir * rnd(0, 2), vy: rnd(-1, 1), life: 20, type: 'spark', size: 3, col: '#cfeeff' });
      }
      if ((d.range && p.dist > d.range) || p.x < -60 || p.x > STAGE_W + 60) { this.killProj(p); continue; }
      const D = this.other(p.owner);
      const c = { x: p.x, y: p.y, r: d.r };
      if (D.hittable() && circleRect(c, D.hurtbox())) {
        const mv = { name: 'PROJ', dmg: d.dmg, level: 'mid', hitstun: 22, push: 7, launch: d.launch, heavy: d.dmg >= 10, blood: 1.2 };
        const res = D.takeHit(p.owner, mv, c);
        if (res === 'hit' && D.health > 0 && !D.dead && this.phase === 'fight') {
          if (d.effect === 'freeze') { D.setState('frozen'); D.vx = 0; SFX.ice(); }
          if (d.effect === 'pull') { D.setState('pulled'); D.puller = p.owner; D.y = Math.max(D.y, 0); }
        }
        this.impact(p);
        this.killProj(p);
      }
    }
    // projectiles cancel each other out
    const live = this.projs.filter((p) => !p.dead);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (a.owner !== b.owner && Math.abs(a.x - b.x) < a.def.r + b.def.r && Math.abs(a.y - b.y) < 40) {
        this.impact(a); this.impact(b); this.killProj(a); this.killProj(b); SFX.explode();
      }
    }
    this.projs = this.projs.filter((p) => !p.dead);
  }
  killProj(p) { if (!p.dead) { p.dead = true; p.owner.projOut = Math.max(0, p.owner.projOut - 1); } }
  impact(p) {
    const k = p.def.kind;
    const col = k === 'fire' ? FIRE_COLS.fire : k === 'acid' || k === 'orb' ? ['#2aff40', '#9aff60'] : k === 'ice' ? ['#cfeeff', '#ffffff'] : k === 'ring' ? ['#ff60a0', '#ffd0e0'] : ['#ffffff', '#ffe080'];
    for (let i = 0; i < 16; i++) this.part({ x: p.x, y: p.y, vx: rnd(-5, 5), vy: rnd(-4, 5), life: rndi(12, 24), type: 'fire', size: rnd(4, 10), col: pick(col) });
  }

  // -------------------------------------------------------------------------
  // Particles & gore
  // -------------------------------------------------------------------------
  part(o) { if (this.parts.length < 900) this.parts.push(Object.assign({ grav: 0, max: o.life }, o)); }
  blood(pt, n, dir) {
    const on = Game.settings.blood;
    n = Math.min(90, Math.round(n));
    for (let i = 0; i < n; i++) {
      const vx = dir ? dir * rnd(1, 7) + rnd(-2, 2) : rnd(-8, 8);
      if (on) this.part({ x: pt.x, y: pt.y, vx, vy: rnd(1, 10), life: 80, type: 'blood', size: rnd(2, 5.5), col: pick(BLOOD_COLS), grav: 0.45 });
      else if (i < 6) this.part({ x: pt.x, y: pt.y, vx: vx * 0.5, vy: rnd(1, 4), life: 20, type: 'spark', size: 3, col: '#ffffff', grav: 0.2 });
    }
  }
  fountain(pt) {
    if (!Game.settings.blood) return;
    for (let i = 0; i < 3; i++) this.part({ x: pt.x, y: pt.y, vx: rnd(-1.8, 1.8), vy: rnd(6, 11), life: 90, type: 'blood', size: rnd(2.5, 5), col: pick(BLOOD_COLS), grav: 0.45 });
  }
  spark(pt, blocked) {
    for (let i = 0; i < (blocked ? 8 : 6); i++) {
      const a = rnd(0, TAU), s = rnd(3, 8);
      this.part({ x: pt.x, y: pt.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 10, type: 'spark', size: 3, col: blocked ? '#9ad0ff' : '#fff2a0' });
    }
  }
  puff(f) {
    const c = f.wp(midPt(f.J.hip, f.J.sh, 0.5));
    for (let i = 0; i < 18; i++) this.part({ x: c.x + rnd(-25, 25), y: c.y + rnd(-60, 60), vx: rnd(-1.5, 1.5), vy: rnd(-0.5, 2), life: rndi(20, 35), type: 'smoke', size: rnd(10, 22), col: f.c.id === 'scorch' ? '#ff7a20' : '#8a8a9a' });
  }
  dust(x) {
    for (let i = 0; i < 10; i++) this.part({ x: x + rnd(-40, 40), y: 4, vx: rnd(-2, 2), vy: rnd(0.3, 1.5), life: 25, type: 'smoke', size: rnd(8, 16), col: '#6a5a50' });
  }
  showCombo(att, n) {
    this.combos = this.combos.filter((c) => c.side !== att.side);
    this.combos.push({ side: att.side, n, t: 0 });
  }
  gib(x, y, type, o = {}) {
    if (this.gibs.length > 160) return;
    this.gibs.push(Object.assign({ x, y, vx: rnd(-7, 7), vy: rnd(4, 14), rot: rnd(0, TAU), vr: rnd(-0.4, 0.4), type, size: 1, rest: false }, o));
  }
  explodeBody(v, ice = false) {
    const c = v.wp(midPt(v.J.hip, v.J.sh, 0.5));
    v.flags.hidden = true;
    if (ice) {
      for (let i = 0; i < 26; i++) this.gib(c.x + rnd(-20, 20), c.y + rnd(-60, 60), 'ice', { size: rnd(0.6, 1.6) });
      for (let i = 0; i < 5; i++) this.gib(c.x, c.y, 'chunk');
      this.blood(c, 25, 0);
    } else {
      this.gib(c.x, c.y + 50, 'skull', { vy: rnd(10, 16) });
      for (let i = 0; i < 9; i++) this.gib(c.x, c.y + rnd(-40, 40), 'bone');
      for (let i = 0; i < 3; i++) this.gib(c.x, c.y, 'rib');
      if (Game.settings.blood) for (let i = 0; i < 14; i++) this.gib(c.x, c.y + rnd(-40, 40), 'chunk', { size: rnd(0.7, 1.4) });
      this.blood(c, 90, 0);
      for (let i = 0; i < 20; i++) this.part({ x: c.x + rnd(-30, 30), y: c.y + rnd(-50, 50), vx: rnd(-2, 2), vy: rnd(0, 2), life: rndi(25, 45), type: 'smoke', size: rnd(14, 28), col: '#5a4a4a' });
    }
    this.shake = 18;
  }
  collapseSkeleton(v) {
    const J = v.J;
    for (const [a, b] of [['bs', 'be'], ['be', 'bh'], ['fs', 'fe'], ['fe', 'fh'], ['bhip', 'bk'], ['bk', 'bf'], ['fhip', 'fk'], ['fk', 'ff'], ['hip', 'sh']]) {
      const p = v.wp(midPt(J[a], J[b], 0.5));
      this.gib(p.x, p.y, 'bone', { vx: rnd(-2, 2), vy: rnd(0, 3) });
    }
    for (let i = 0; i < 3; i++) { const p = v.wp(midPt(J.hip, J.sh, 0.4 + i * 0.2)); this.gib(p.x, p.y, 'rib', { vx: rnd(-2, 2), vy: rnd(0, 3) }); }
    const h = v.wp(J.hd);
    this.gib(h.x, h.y, 'skull', { vx: rnd(-2, 2), vy: rnd(2, 5) });
    v.flags.hidden = true;
  }

  updateParts() {
    for (const p of this.parts) {
      p.x += p.vx; p.y += p.vy; p.vy -= p.grav; p.life--;
      if (p.type === 'fire') { p.vy += 0.15; p.size *= 0.95; }
      if (p.type === 'smoke') { p.vy += 0.03; p.size *= 1.02; }
      if (p.type === 'blood' && p.y <= 0) {
        p.life = 0;
        if (Math.random() < 0.45 && this.decals.length < 260) this.decals.push({ x: p.x, y: GROUND + rnd(-6, 18), w: rnd(4, 13), col: pick(BLOOD_COLS) });
      }
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const g of this.gibs) {
      if (g.rest) continue;
      g.vy -= GRAV; g.x += g.vx; g.y += g.vy; g.rot += g.vr;
      if (g.type === 'chunk' && Game.settings.blood && Math.random() < 0.3) this.part({ x: g.x, y: g.y, vx: 0, vy: 0, life: 30, type: 'blood', size: 2.5, col: '#8a0000', grav: 0.45 });
      if (g.y <= 4 && g.vy < 0) {
        g.y = 4; g.vy *= -0.35; g.vx *= 0.6; g.vr *= 0.5;
        if (Math.abs(g.vy) < 1.5) { g.rest = true; g.vy = 0; }
      }
      g.x = clamp(g.x, 10, STAGE_W - 10);
    }
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------
  drawWorld(ctx) {
    const sh = this.shake > 0.5 ? this.shake : 0;
    this.shake *= 0.85;
    const cam = this.cam;
    ctx.save();
    ctx.translate(rnd(-sh, sh), rnd(-sh, sh) * 0.6);
    drawStage(ctx, this.stage, cam, this.frame);
    for (const d of this.decals) {
      ctx.fillStyle = d.col; ctx.beginPath(); ctx.ellipse(d.x - cam, d.y, d.w, d.w * 0.32, 0, 0, TAU); ctx.fill();
    }
    if (this.darken > 0.01) { ctx.fillStyle = `rgba(0,0,0,${this.darken})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    for (const f of this.f) {
      if (f.flags.hidden || f.flags.sink) continue;
      const s = Math.max(0.3, 1 - f.y / 350);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(f.x - cam, GROUND + 3, 52 * s, 9 * s, 0, 0, TAU); ctx.fill();
    }
    for (const g of this.gibs) this.drawGib(ctx, g, cam);
    const order = [...this.f].sort((a, b) => (a.state === 'attack' || a.state === 'fatal' && a === this.fatal?.w ? 1 : 0) - (b.state === 'attack' || b.state === 'fatal' && b === this.fatal?.w ? 1 : 0));
    for (const f of order) this.drawFighter(ctx, f);
    for (const t of this.trophies) this.drawTrophy(ctx, t, cam);
    for (const p of this.projs) this.drawProj(ctx, p, cam);
    for (const b of this.bolts) drawBolt(ctx, b.a.x - cam, GROUND - b.a.y, b.b.x - cam, GROUND - b.b.y);
    this.drawParts(ctx, cam);
    ctx.restore();
  }

  drawFighter(ctx, f) {
    if (f.flags.hidden) return;
    const o = {};
    if (f.state === 'frozen') { o.tint = '#a8dcff'; o.tintK = 0.6; }
    if (f.flags.tint) { o.tint = f.flags.tint; o.tintK = f.flags.tintK; }
    if (f.flags.skeleton) o.skeleton = true;
    if (f.flags.headless) o.headless = true;
    if (f.flash > 0) o.flash = true;
    const sx = f.x - this.cam + (f.flags.shakeX || 0), sy = GROUND - f.y;
    ctx.save();
    ctx.globalAlpha = f.flags.alpha;
    if (f.flags.sink) { ctx.beginPath(); ctx.rect(sx - 250, -50, 500, GROUND + 52); ctx.clip(); ctx.translate(sx, sy + f.flags.sink); }
    else ctx.translate(sx, sy);
    ctx.scale(f.facing, 1);
    renderFighter(ctx, f.c.look, f.J, o);
    ctx.restore();
    if (f.state === 'frozen' || f.flags.ice) { // ice block
      const hb = f.hurtbox();
      ctx.fillStyle = 'rgba(170,220,255,0.28)'; ctx.strokeStyle = 'rgba(230,248,255,0.8)'; ctx.lineWidth = 2;
      ctx.fillRect(hb.x1 - this.cam - 6, GROUND - hb.y2 - 6, hb.x2 - hb.x1 + 12, hb.y2 - hb.y1 + 8);
      ctx.strokeRect(hb.x1 - this.cam - 6, GROUND - hb.y2 - 6, hb.x2 - hb.x1 + 12, hb.y2 - hb.y1 + 8);
    }
  }

  drawProj(ctx, p, cam) {
    const x = p.x - cam, y = GROUND - p.y, d = p.def, dir = Math.sign(p.vx), t = p.t;
    ctx.save();
    switch (d.kind) {
      case 'spear': {
        const hand = p.owner.wp(p.owner.J.fh);
        ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hand.x - cam, GROUND - hand.y);
        const hx = hand.x - cam, hy = GROUND - hand.y;
        ctx.quadraticCurveTo((hx + x) / 2, (hy + y) / 2 + 8, x, y); ctx.stroke();
        ctx.fillStyle = '#d8d8e0'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + dir * 22, y); ctx.lineTo(x - dir * 4, y - 8); ctx.lineTo(x, y); ctx.lineTo(x - dir * 4, y + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      }
      case 'ice': case 'fire': case 'acid': case 'orb': {
        const cols = d.kind === 'ice' ? ['#ffffff', '#9ad8ff', 'rgba(60,140,255,0)'] : d.kind === 'fire' ? ['#fff4c0', '#ff8a1a', 'rgba(255,40,0,0)'] : d.kind === 'orb' ? ['#f0ffe0', '#40c040', 'rgba(80,0,120,0)'] : ['#f0ffc0', '#40ff40', 'rgba(0,120,0,0)'];
        const r = d.r * (1.4 + Math.sin(t * 0.6) * 0.12);
        const g = ctx.createRadialGradient(x, y, 1, x, y, r);
        g.addColorStop(0, cols[0]); g.addColorStop(0.45, cols[1]); g.addColorStop(1, cols[2]);
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        if (d.kind === 'orb') { ctx.strokeStyle = 'rgba(200,120,255,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, d.r, t * 0.2, t * 0.2 + 4); ctx.stroke(); }
        break;
      }
      case 'ring':
        ctx.strokeStyle = '#ff5aa0'; ctx.lineWidth = 4; ctx.shadowColor = '#ff2a80'; ctx.shadowBlur = 12;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(x - dir * i * 16, y, 6, 20 - i * 3, 0, 0, TAU); ctx.stroke(); }
        break;
      case 'knife':
        ctx.translate(x, y); ctx.rotate(t * 0.6 * dir);
        ctx.fillStyle = '#d8dce4'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(14, -4); ctx.lineTo(20, 0); ctx.lineTo(14, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#3a2a1a'; ctx.fillRect(-20, -3, 10, 6);
        break;
      case 'lightning':
        drawBolt(ctx, x - dir * 50, y, x + dir * 20, y);
        ctx.globalCompositeOperation = 'lighter';
        { const g = ctx.createRadialGradient(x, y, 1, x, y, 34); g.addColorStop(0, 'rgba(220,240,255,0.9)'); g.addColorStop(1, 'rgba(80,140,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 34, 0, TAU); ctx.fill(); }
        break;
    }
    ctx.restore();
  }

  drawParts(ctx, cam) {
    for (const p of this.parts) {
      const x = p.x - cam, y = GROUND - p.y, a = clamp(p.life / p.max, 0, 1);
      if (p.type === 'blood') {
        ctx.fillStyle = p.col; ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.ellipse(x, y, p.size, p.size * (1 + Math.min(2, Math.abs(p.vy) * 0.15)), Math.atan2(p.vx, -p.vy), 0, TAU); ctx.fill();
      } else if (p.type === 'spark') {
        ctx.globalAlpha = a; ctx.strokeStyle = p.col; ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - p.vx * 2, y + p.vy * 2); ctx.stroke();
      } else if (p.type === 'fire') {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, p.size), 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.type === 'smoke') {
        ctx.globalAlpha = a * 0.5; ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(x, y, p.size, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawGib(ctx, g, cam) {
    ctx.save(); ctx.translate(g.x - cam, GROUND - g.y); ctx.rotate(g.rot); ctx.scale(g.size, g.size);
    ctx.lineCap = 'round';
    switch (g.type) {
      case 'bone':
        seg(ctx, { x: -11, y: 0 }, { x: 11, y: 0 }, 8, OUTLINE); seg(ctx, { x: -11, y: 0 }, { x: 11, y: 0 }, 5, BONE);
        for (const sx of [-12, 12]) for (const sy of [-3, 3]) dot(ctx, { x: sx, y: sy }, 3.2, BONE);
        break;
      case 'rib':
        ctx.strokeStyle = BONE; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(0, 0, 13, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        break;
      case 'skull': drawSkull(ctx, 0, 0, 0, 0.9); break;
      case 'chunk':
        ctx.fillStyle = '#5a0000'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 6, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#a01010'; ctx.beginPath(); ctx.ellipse(-2, -1, 6, 3.5, 0, 0, TAU); ctx.fill();
        break;
      case 'ice':
        ctx.fillStyle = 'rgba(190,230,255,0.85)'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(7, -9); ctx.lineTo(11, 5); ctx.lineTo(-4, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
    }
    ctx.restore();
  }

  drawTrophy(ctx, t, cam) {
    const w = t.owner, hand = w.wp(w.J.fh), x = hand.x - cam, y = GROUND - hand.y;
    ctx.save(); ctx.translate(x, y);
    if (t.type === 'head') {
      ctx.save(); ctx.scale(-w.facing, 1);
      for (let i = 0; i < 9; i++) { // dangling spine
        const sy = 16 + i * 8, sx = Math.sin(this.frame * 0.1 + i * 0.5) * i * 0.6;
        ctx.fillStyle = OUTLINE; ctx.fillRect(sx - 6, sy - 1, 12, 8);
        ctx.fillStyle = i % 2 ? BONE : '#d8ccb0'; ctx.fillRect(sx - 4.5, sy, 9, 6);
      }
      ctx.restore();
      drawHead(ctx, t.look, (h) => h, 0, 0, 0.3 * w.facing, {});
    } else if (t.type === 'heart') {
      const s = 1 + Math.sin(this.frame * 0.5) * 0.12;
      ctx.scale(s, s);
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-5, -3, 8, 0, TAU); ctx.arc(5, -3, 8, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(0, 15); ctx.lineTo(12, 0); ctx.fill();
      ctx.fillStyle = '#b00010'; ctx.beginPath(); ctx.arc(-5, -3, 6.5, 0, TAU); ctx.arc(5, -3, 6.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-11, -1); ctx.lineTo(0, 13); ctx.lineTo(11, -1); ctx.fill();
      if (this.frame % 4 === 0) this.fountain({ x: hand.x, y: hand.y - 6 });
    }
    ctx.restore();
  }

  drawUI(ctx) {
    const barW = 380, barH = 26, y = 22;
    for (let i = 0; i < 2; i++) {
      const f = this.f[i], x = i === 0 ? 34 : W - 34 - barW;
      ctx.fillStyle = '#000'; ctx.fillRect(x - 4, y - 4, barW + 8, barH + 8);
      ctx.fillStyle = '#b8862a'; ctx.fillRect(x - 2, y - 2, barW + 4, barH + 4);
      ctx.fillStyle = '#7a0000'; ctx.fillRect(x, y, barW, barH);
      const sw = barW * f.shownHealth / 100, hw = barW * f.health / 100;
      ctx.fillStyle = '#e0a020';
      if (i === 0) ctx.fillRect(x, y, sw, barH); else ctx.fillRect(x + barW - sw, y, sw, barH);
      const g = ctx.createLinearGradient(0, y, 0, y + barH);
      g.addColorStop(0, '#9aff6a'); g.addColorStop(0.5, '#1cb81c'); g.addColorStop(1, '#0a6a0a');
      ctx.fillStyle = g;
      if (i === 0) ctx.fillRect(x, y, hw, barH); else ctx.fillRect(x + barW - hw, y, hw, barH);
      ctx.font = `20px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.fillStyle = '#000'; ctx.fillText(f.c.name, i === 0 ? x + 8 : x + barW - 8, y + barH / 2 + 1);
      ctx.fillStyle = '#f0f0d0'; ctx.globalAlpha = 0.25; ctx.fillText(f.c.name, i === 0 ? x + 7 : x + barW - 9, y + barH / 2); ctx.globalAlpha = 1;
      for (let k = 0; k < 2; k++) drawMedallion(ctx, i === 0 ? x + 14 + k * 30 : x + barW - 14 - k * 30, y + barH + 22, 11, f.wins > k);
    }
    if (!this.opts.demo) bigText(ctx, String(this.timer).padStart(2, '0'), W / 2, 40, 50, 'gold');
    for (const c of this.combos) {
      const a = c.t < 50 ? 1 : 1 - (c.t - 50) / 20;
      bigText(ctx, `${c.n} HIT COMBO`, c.side === 0 ? 40 : W - 40, 110, 34, 'red', c.side === 0 ? 'left' : 'right', a);
    }
    for (const t of this.texts) {
      const k = t.t < 8 ? 1 + (8 - t.t) * 0.08 : 1;
      const a = t.t > t.dur - 15 ? (t.dur - t.t) / 15 : 1;
      if (t.str === 'FATALITY') drawFatalityText(ctx, W / 2, t.y, t.t, a);
      else bigText(ctx, t.str, W / 2, t.y, t.size * k, t.style, 'center', a);
    }
  }
}

function drawBolt(ctx, x1, y1, x2, y2) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass ? '#ffffff' : 'rgba(120,170,255,0.7)'; ctx.lineWidth = pass ? 2 : 7;
    ctx.beginPath(); ctx.moveTo(x1, y1);
    const n = 9;
    for (let i = 1; i < n; i++) ctx.lineTo(lerp(x1, x2, i / n) + rnd(-6, 6), lerp(y1, y2, i / n) + rnd(-14, 14));
    ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.restore();
}

function drawFatalityText(ctx, x, y, t, a) {
  bigText(ctx, 'FATALITY', x, y, 110, 'red', 'center', a);
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#8a0000';
  for (let i = 0; i < 14; i++) {
    const dx = x - 220 + i * 33 + ((i * 37) % 11), len = Math.min(60, Math.max(0, (t - 10 - (i % 5) * 6) * (0.8 + (i % 3) * 0.3)));
    if (len <= 0) continue;
    ctx.fillRect(dx, y + 40, 4, len);
    ctx.beginPath(); ctx.arc(dx + 2, y + 40 + len, 4, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Fatality scripts
// ---------------------------------------------------------------------------
class Fatality {
  constructor(m, w, v, def) {
    this.m = m; this.w = w; this.v = v; this.def = def; this.t = 0; this.done = false;
    for (const f of [w, v]) { f.setState('fatal'); f.vx = 0; f.vy = 0; f.y = 0; f.fatalPhys = false; f.poseSpeed = 0.25; f.inv = 0; }
    w.forcePose = 'idle'; v.forcePose = 'dizzy';
    this.dir = Math.sign(v.x - w.x) || 1;
    w.facing = this.dir; v.facing = -this.dir;
    m.darkenTarget = 0.62;
    const ends = { burn: [175, 330], melt: [190, 330], headrip: [165, 320], heart: [155, 310], explode: [150, 310], shatter: [160, 320], shock: [170, 330] };
    [this.fatAt, this.endAt] = ends[def.type];
  }
  approachTo(d) {
    const cur = Math.abs(this.v.x - this.w.x);
    if (cur > d + 4) { this.w.x += this.dir * Math.min(5, cur - d); this.w.forcePose = 'walk'; return false; }
    this.w.forcePose = 'idle';
    return true;
  }
  vpt(k) { return this.v.wp(this.v.J[k]); }
  vcenter() { return this.v.wp(midPt(this.v.J.hip, this.v.J.sh, 0.5)); }
  stream(cols, n, type = 'fire') {
    const h = this.w.wp(this.w.forcePose === 'breath' ? this.w.J.hd : this.w.J.fh);
    for (let i = 0; i < n; i++) this.m.part({ x: h.x + this.dir * 14, y: h.y + rnd(-4, 4), vx: this.dir * rnd(8, 12), vy: rnd(-1, 1.2), life: 26, type, size: rnd(5, 10), col: pick(cols) });
  }
  update() {
    const t = ++this.t;
    this['u_' + this.def.type](t);
    if (t === this.fatAt) { this.m.text('FATALITY', 'red', 110, 400, 200); this.m.say('Fatality', 0.2); SFX.gong(); }
    if (t >= this.endAt) this.done = true;
  }

  u_burn(t) {
    const { w, v, m } = this, cols = FIRE_COLS[this.def.color || 'fire'];
    if (t === 1) { w.forcePose = this.def.color === 'pink' ? 'reach' : 'breath'; SFX.fire(); }
    if (t >= 8 && t < 70) this.stream(cols, 3);
    if (t === 30) { SFX.scream(); SFX.fire(); v.forcePose = 'hitHigh'; }
    if (t >= 30 && t < 150) for (const k of ['hd', 'sh', 'hip', 'fk', 'bk', 'fh']) {
      const p = this.vpt(k);
      if (Math.random() < 0.6) m.part({ x: p.x + rnd(-10, 10), y: p.y + rnd(-10, 10), vx: rnd(-1, 1), vy: rnd(1, 3), life: 24, type: 'fire', size: rnd(6, 13), col: pick(cols) });
    }
    if (t >= 30 && t < 80) { v.flags.tint = '#1a0600'; v.flags.tintK = (t - 30) / 50 * 0.85; }
    if (t === 80) { v.flags.skeleton = true; v.flags.tint = null; }
    if (t >= 80 && t < 140) v.flags.shakeX = rnd(-2, 2);
    if (t === 140) { m.collapseSkeleton(v); SFX.thud(); w.forcePose = 'win'; }
  }
  u_melt(t) {
    const { w, v, m } = this, cols = ['#2aff40', '#9aff60', '#e0ffb0'];
    if (t === 1) { w.forcePose = 'fireball'; SFX.spit(); }
    if (t >= 5 && t < 35) this.stream(cols, 3);
    if (t === 35) { v.forcePose = 'hitLow'; SFX.scream(); }
    if (t >= 35) { v.flags.tint = '#3aff2a'; v.flags.tintK = Math.min(0.6, (t - 35) / 60); }
    if (t === 60) { for (let i = 0; i < 8; i++) m.decals.push({ x: v.x + rnd(-50, 50), y: GROUND + rnd(-4, 12), w: rnd(20, 40), col: '#2a8a1a' }); w.forcePose = 'idle'; }
    if (t >= 60 && t < 185) {
      v.flags.sink += 1.75;
      for (let i = 0; i < 2; i++) m.part({ x: v.x + rnd(-40, 40), y: rnd(0, 8), vx: 0, vy: rnd(0.5, 2), life: 25, type: 'fire', size: rnd(3, 7), col: pick(cols) });
    }
    if (t === 185) v.flags.hidden = true;
  }
  u_headrip(t) {
    const { w, v, m } = this;
    if (t < 30) this.approachTo(80);
    if (t === 30) { w.forcePose = 'reach'; w.poseSpeed = 0.4; }
    if (t === 42) {
      v.flags.headless = true;
      m.trophies.push({ type: 'head', look: v.c.look, owner: w });
      m.blood(this.vpt('neck'), 40, -this.dir); SFX.splat(); SFX.scream();
      w.forcePose = 'win'; w.poseSpeed = 0.12;
    }
    if (t > 42 && t < 150) m.fountain(this.vpt('neck'));
    if (t === 80) { v.forcePose = 'kneel'; v.poseSpeed = 0.08; }
    if (t === 122) { v.forcePose = 'down'; v.poseSpeed = 0.1; SFX.thud(); }
  }
  u_heart(t) {
    const { w, v, m } = this;
    if (t < 26) this.approachTo(78);
    if (t === 26) { w.forcePose = 'punch'; w.poseSpeed = 0.5; }
    if (t === 32) {
      m.blood(this.vcenter(), 40, this.dir); SFX.splat(); SFX.scream();
      m.trophies.push({ type: 'heart', owner: w }); v.forcePose = 'hitLow';
    }
    if (t === 55) { w.forcePose = 'win'; w.poseSpeed = 0.1; }
    if (t > 32 && t < 120 && t % 2) m.fountain(this.vcenter());
    if (t === 110) { v.forcePose = 'down'; v.poseSpeed = 0.1; }
    if (t === 128) SFX.thud();
  }
  u_explode(t) {
    const { w, v, m } = this;
    if (t < 20) this.approachTo(85);
    if (t === 20) { w.forcePose = 'upperWind'; w.poseSpeed = 0.4; }
    if (t === 30) {
      w.forcePose = 'uppercut'; v.fatalPhys = true; v.vy = 17; v.vx = this.dir * 1.5; v.forcePose = 'air';
      SFX.hit(true); m.blood(this.vpt('hd'), 30, this.dir); m.shake = 10;
      for (let i = 0; i < 20; i++) m.part({ x: v.x, y: 140, vx: rnd(-4, 4), vy: rnd(-2, 6), life: 25, type: 'fire', size: rnd(6, 12), col: pick(FIRE_COLS.fire) });
    }
    if (t === 52) { m.explodeBody(v); SFX.explode(); }
    if (t === 70) { w.forcePose = 'win'; w.poseSpeed = 0.12; }
  }
  u_shatter(t) {
    const { w, v, m } = this, cols = ['#ffffff', '#bfe6ff', '#6ab8ff'];
    if (t === 1) { w.forcePose = 'fireball'; SFX.ice(); }
    if (t >= 5 && t < 30) this.stream(cols, 3, 'spark');
    if (t === 30) { v.flags.tint = '#bfe6ff'; v.flags.tintK = 0.7; v.flags.ice = true; v.poseSpeed = 0; SFX.ice(); w.forcePose = 'idle'; }
    if (t >= 40 && t < 72) this.approachTo(85);
    if (t === 72) { w.forcePose = 'upperWind'; w.poseSpeed = 0.4; }
    if (t === 80) w.forcePose = 'uppercut';
    if (t === 86) { v.flags.ice = false; m.explodeBody(v, true); SFX.shatter(); }
    if (t === 110) { w.forcePose = 'win'; w.poseSpeed = 0.12; }
  }
  u_shock(t) {
    const { w, v, m } = this;
    if (t === 1) w.forcePose = 'fireball';
    if (t >= 5 && t < 100) {
      m.bolts = [{ a: w.wp(w.J.fh), b: this.vcenter() }, { a: w.wp(w.J.bh), b: this.vpt('hd') }];
      v.flags.skeleton = (t >> 2) % 2 === 0; v.flags.shakeX = rnd(-4, 4); v.forcePose = 'hitHigh';
      if (t % 12 === 5) SFX.zap();
      if (t === 20) SFX.scream();
    }
    if (t === 100) { m.bolts = []; v.flags.skeleton = false; m.explodeBody(v); SFX.explode(); w.forcePose = 'win'; w.poseSpeed = 0.12; }
  }
}
