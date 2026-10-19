'use strict';
// AI writes into a virtual controller (for movement / blocking) and queues
// attacks & specials directly on its fighter.
class AICtrl {
  constructor() { this.ai = true; this.held = {}; this.prev = {}; }
  poll() {}
  pressed(a) { return !!this.held[a] && !this.prev[a]; }
  endFrame() { this.prev = { ...this.held }; }
}

class AIBrain {
  constructor(f, level) {
    this.f = f; this.lv = clamp(level, 0, 1);
    this.intent = 'none'; this.intentT = 0; this.cool = rndi(20, 40);
    this.lastThreat = null; this.defend = false; this.defendDelay = 0;
    this.fatal = null; this.finishWait = -1;
  }
  setIntent(i, t) { this.intent = i; this.intentT = t; }
  applyIntent(c) {
    if (this.intentT-- <= 0) return;
    const f = this.f;
    if (this.intent === 'fwd') c.held[f.fwdKey()] = true;
    else if (this.intent === 'back') c.held[f.backKey()] = true;
    else if (this.intent === 'block') c.held.BL = true;
    else if (this.intent === 'crouch') c.held.down = true;
  }

  threat(m, f, o, dist) {
    if (o.state === 'attack' && o.move.limb && o.t <= o.move.startup + o.move.active) {
      const reach = o.move.dash ? 420 : 190;
      if (dist < reach) return { id: o.move.name + (m.frame - o.t), low: o.move.level === 'low' };
    }
    if (o.state === 'jump' && o.airMove && dist < 200) return { id: 'air' + (m.frame - o.t), low: false };
    for (const p of m.projs) {
      if (p.owner === o && Math.sign(f.x - p.x) === Math.sign(p.vx) && Math.abs(p.x - f.x) < 280) return { id: p, low: false, proj: p };
    }
    return null;
  }

  update(m) {
    const f = this.f, o = m.other(f), c = f.ctrl;
    c.held = {};
    if (m.phase === 'finish' && m.finishWinner === f) return this.finish(m, o, c);
    if (!m.canAct(f)) return;
    const dist = Math.abs(o.x - f.x), lv = this.lv;

    if (f.state === 'jump') {
      if (!f.airMove && dist < 190 && f.vy < 6 && Math.random() < 0.2 + lv * 0.3) f.queued = { move: Math.random() < 0.65 ? 'JK' : 'JP' };
      return;
    }
    if (!NEUTRAL.has(f.state)) return;

    // --- defense ---
    const th = this.threat(m, f, o, dist);
    if (th) {
      if (this.lastThreat !== th.id) {
        this.lastThreat = th.id;
        this.defend = Math.random() < 0.12 + lv * 0.7;
        this.defendDelay = Math.round(lerp(9, 1, lv));
        this.dodge = th.proj ? pick(['block', 'block', 'duck', 'jump']) : 'block';
      }
      if (this.defend) {
        if (this.defendDelay-- > 0) return;
        if (this.dodge === 'jump') { f.queued = { jump: 1 }; this.defend = false; return; }
        if (this.dodge === 'duck') { c.held.down = true; return; }
        c.held.BL = true; if (th.low) c.held.down = true;
        return;
      }
    } else this.lastThreat = null;

    if (this.cool > 0) { this.cool--; this.applyIntent(c); return; }

    // --- offense ---
    const sp = f.c.specials;
    const proj = sp.find((s) => s.type === 'proj'), dash = sp.find((s) => s.type === 'dash'), tele = sp.find((s) => s.type === 'teleport');
    const r = Math.random();
    this.cool = Math.round(lerp(42, 10, lv) * rnd(0.6, 1.4));

    if (['frozen', 'stunned', 'pulled'].includes(o.state)) {
      if (dist < 125) { f.queued = { move: pick(['UPPER', 'HP', 'HK', 'UPPER']) }; this.cool = 6; }
      else this.setIntent('fwd', 12);
    } else if (o.state === 'jump' && dist < 230 && r < 0.15 + lv * 0.5) {
      f.queued = { move: 'UPPER' };
    } else if (o.state === 'down' || o.state === 'getup') {
      this.setIntent(dist > 150 ? 'fwd' : 'none', 12); this.cool = 8;
    } else if (dist > 320) {
      if (r < 0.3 && proj && f.projOut === 0) f.queued = { special: proj };
      else if (r < 0.38 && tele) f.queued = { special: tele };
      else if (r < 0.75) this.setIntent('fwd', rndi(15, 35));
      else if (r < 0.87) f.queued = { jump: 1 };
      else this.setIntent('none', 15);
    } else if (dist > 140) {
      if (r < 0.14 && proj && f.projOut === 0) f.queued = { special: proj };
      else if (r < 0.26 && dash) f.queued = { special: dash };
      else if (r < 0.6) this.setIntent('fwd', rndi(8, 20));
      else if (r < 0.75) f.queued = { jump: 1 };
      else if (r < 0.85) this.setIntent('back', rndi(10, 20));
      else this.setIntent('block', 20);
    } else {
      const choice = pick(['HP', 'LP', 'HK', 'LK', 'SWEEP', 'RH', 'CLK', 'UPPER', 'THROW', 'HP', 'LK', 'block', 'back', 'jumpback']);
      if (choice === 'block') this.setIntent('block', 16);
      else if (choice === 'back') this.setIntent('back', 16);
      else if (choice === 'jumpback') f.queued = { jump: -1 };
      else f.queued = { move: choice === 'THROW' && dist > 88 ? 'HP' : choice };
      this.cool = Math.round(this.cool * 0.7);
    }
    this.applyIntent(c);
  }

  finish(m, o, c) {
    const f = this.f;
    if (!NEUTRAL.has(f.state)) return;
    if (this.fatal === null) {
      const chance = m.opts.demo ? 1 : 0.3 + this.lv * 0.6;
      this.fatal = Math.random() < chance ? pick(f.c.fatalities) : 'hit';
      this.finishWait = rndi(40, 90);
    }
    if (this.finishWait-- > 0) return;
    const dist = Math.abs(o.x - f.x);
    if (this.fatal === 'hit') {
      if (dist > 115) c.held[f.fwdKey()] = true; else f.queued = { move: 'UPPER' };
      return;
    }
    if (dist > this.fatal.max - 10) { c.held[f.fwdKey()] = true; return; }
    f.queued = { fatal: this.fatal };
  }
}
