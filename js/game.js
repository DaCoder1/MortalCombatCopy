'use strict';
const GAME_TITLE = ['MORTAL', 'KLASH'];

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const KEYMAPS = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], HP: ['KeyU'], LP: ['KeyJ'], HK: ['KeyO'], LK: ['KeyL'], BL: ['KeyI', 'KeyK', 'Space'] },
  {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    HP: ['Numpad7', 'Period'], LP: ['Numpad4', 'Comma'], HK: ['Numpad9', 'Quote'], LK: ['Numpad6', 'Semicolon'], BL: ['Numpad8', 'Numpad5', 'Numpad0', 'Slash'],
  },
];
const ACTIONS = ['up', 'down', 'left', 'right', 'HP', 'LP', 'HK', 'LK', 'BL'];
const PAD_BTNS = { up: [12], down: [13], left: [14], right: [15], LK: [0], HK: [1], LP: [2], HP: [3], BL: [4, 5, 6, 7] };

const Keys = { down: new Set(), taps: new Set() };
addEventListener('keydown', (e) => {
  SFX.init();
  if (!e.repeat) Keys.taps.add(e.code);
  Keys.down.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash', 'Quote'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyP') { Game.settings.pixel = !Game.settings.pixel; resize(); }
  if (e.code === 'KeyM') SFX.toggleMusic();
  if (e.code === 'KeyB') Game.settings.blood = !Game.settings.blood;
  if (e.code === 'KeyF') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
});
addEventListener('keyup', (e) => Keys.down.delete(e.code));
addEventListener('blur', () => Keys.down.clear());
addEventListener('pointerdown', () => SFX.init());

class Ctrl {
  constructor(maps, pads) { this.maps = maps; this.pads = pads; this.held = {}; this.prev = {}; this.taps = new Set(); }
  poll() {
    const gp = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const a of ACTIONS) {
      let h = false;
      for (const m of this.maps) for (const code of m[a]) { if (Keys.down.has(code)) h = true; if (Keys.taps.has(code)) this.taps.add(a); }
      for (const pi of this.pads) {
        const p = gp && gp[pi];
        if (!p) continue;
        for (const b of PAD_BTNS[a]) if (p.buttons[b] && p.buttons[b].pressed) h = true;
        const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
        if ((a === 'left' && ax < -0.5) || (a === 'right' && ax > 0.5) || (a === 'up' && ay < -0.5) || (a === 'down' && ay > 0.5)) h = true;
      }
      this.held[a] = h;
    }
  }
  pressed(a) { return this.taps.has(a) || (!!this.held[a] && !this.prev[a]); }
  anyAttack() { return ['HP', 'LP', 'HK', 'LK'].some((a) => this.pressed(a)); }
  endFrame() { this.prev = { ...this.held }; this.taps.clear(); }
}

// Menu input: everything, plus Enter / Escape.
const Menu = {
  c: new Ctrl(KEYMAPS, [0, 1]),
  up() { return this.c.pressed('up'); }, down() { return this.c.pressed('down'); },
  left() { return this.c.pressed('left'); }, right() { return this.c.pressed('right'); },
  ok() { return Keys.taps.has('Enter') || Keys.taps.has('NumpadEnter') || this.c.anyAttack(); },
  back() { return Keys.taps.has('Escape') || Keys.taps.has('Backspace'); },
};

const Game = {
  settings: { pixel: true, blood: true },
  scene: null, frame: 0,
  solo: new Ctrl(KEYMAPS, [0, 1]),
  pctrl: [new Ctrl([KEYMAPS[0]], [0]), new Ctrl([KEYMAPS[1]], [1])],
  ladder: null,
  set(s) { this.scene = s; },
  ctrls() { return [Menu.c, this.solo, ...this.pctrl]; },

  startFight(chars, mode, stage) {
    const two = mode === '2p';
    const lvl = this.ladder ? clamp(0.35 + this.ladder.idx * 0.1, 0, 0.9) : 0.6;
    const m = new Match({
      chars, stage,
      ctrls: two ? this.pctrl : [this.solo, new AICtrl()],
      ai: two ? [null, null] : [null, lvl],
      onEnd: (side) => this.onMatchEnd(side, mode),
    });
    this.set(new FightScene(m, mode));
  },
  onMatchEnd(side, mode) {
    if (mode === '2p') { this.set(new SelectScene('2p')); return; }
    const L = this.ladder;
    if (side === 0) {
      L.idx++;
      if (L.idx >= L.opps.length) this.set(new EndingScene(L.player));
      else this.set(new VersusScene([L.player, L.opps[L.idx]], '1p', L.idx % STAGES.length));
    } else this.set(new ContinueScene());
  },
};

// ---------------------------------------------------------------------------
// Shared drawing helpers for menus
// ---------------------------------------------------------------------------
function menuBackdrop(ctx, t) {
  const g = ctx.createRadialGradient(W / 2, H * 0.6, 50, W / 2, H * 0.6, W * 0.75);
  g.addColorStop(0, '#3a0a04'); g.addColorStop(0.6, '#140302'); g.addColorStop(1, '#000');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 40; i++) { // drifting embers
    const x = (i * 97 + t * (0.3 + (i % 5) * 0.15)) % W, y = H - ((i * 53 + t * (0.6 + (i % 3) * 0.3)) % H);
    ctx.fillStyle = `rgba(255,${100 + (i % 4) * 30},20,${0.25 + (i % 3) * 0.15})`;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
}

function drawFigure(ctx, c, x, y, s, facing, poseObj, opts = {}) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s * facing, s);
  renderFighter(ctx, c.look, solvePose(poseObj), opts);
  ctx.restore();
}

function moveLines(c) {
  const out = c.specials.map((s) => [s.name, seqText(s.seq, s.btn)]);
  for (const f of c.fatalities) out.push(['FATALITY: ' + f.name, seqText(f.seq, f.btn) + (f.max <= 160 ? '  (close)' : '')]);
  return out;
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------
class TitleScene {
  constructor() { this.sel = 0; this.items = ['1 PLAYER', '2 PLAYERS', 'MOVE LIST']; this.t = 0; this.newDemo(); }
  newDemo() {
    const a = pick(CHARACTERS);
    let b = pick(CHARACTERS); while (b === a) b = pick(CHARACTERS);
    this.demo = new Match({ chars: [a, b], ctrls: [new AICtrl(), new AICtrl()], ai: [0.75, 0.75], stage: rndi(0, STAGES.length - 1), demo: true, onEnd: () => this.newDemo() });
  }
  update() {
    this.t++;
    this.demo.update();
    if (Menu.up()) { this.sel = (this.sel + this.items.length - 1) % this.items.length; SFX.select(); }
    if (Menu.down()) { this.sel = (this.sel + 1) % this.items.length; SFX.select(); }
    if (Menu.ok()) {
      SFX.init(); SFX.confirm();
      if (this.sel === 0) Game.set(new SelectScene('1p'));
      else if (this.sel === 1) Game.set(new SelectScene('2p'));
      else Game.set(new MoveListScene());
    }
  }
  drawWorld(ctx) { this.demo.drawWorld(ctx); }
  drawUI(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
    const pulse = 1 + Math.sin(this.t * 0.05) * 0.03;
    drawMedallion(ctx, W / 2, 78, 50 * pulse, true);
    bigText(ctx, GAME_TITLE.join(' '), W / 2, 172, 100, 'gold');
    smallText(ctx, 'THE TOURNAMENT AWAITS', W / 2, 232, 22, '#c8a060', 'center');
    this.items.forEach((it, i) => {
      const on = i === this.sel;
      bigText(ctx, it, W / 2, 298 + i * 52, on ? 44 : 34, on ? 'red' : 'white', 'center', on ? 1 : 0.75);
      if (on) { drawMedallion(ctx, W / 2 - 170, 298 + i * 52, 14); drawMedallion(ctx, W / 2 + 170, 298 + i * 52, 14); }
    });
    const st = Game.settings;
    smallText(ctx, `[P] PIXELS: ${st.pixel ? 'ON' : 'OFF'}    [M] MUSIC: ${SFX.musicOn ? 'ON' : 'OFF'}    [B] BLOOD: ${st.blood ? 'ON' : 'OFF'}    [F] FULLSCREEN`, W / 2, H - 46, 18, '#a89070', 'center');
    smallText(ctx, 'ENTER / ATTACK TO SELECT', W / 2, H - 20, 16, '#7a6a50', 'center');
  }
}

const GRID = { cols: 4, w: 104, h: 112, gap: 8, x: (W - (4 * 104 + 3 * 8)) / 2, y: 120 };
const RANDOM_SLOT = CHARACTERS.length; // index 7 = random

class SelectScene {
  constructor(mode) {
    this.mode = mode; this.t = 0;
    this.cur = [0, 1]; this.done = [false, mode === '1p']; this.picked = [null, null]; this.out = 0;
    SFX.say('Choose your fighter', 0.4);
  }
  ctrlFor(p) { return this.mode === '1p' ? null : Game.pctrl[p]; }
  move(p, dx, dy) {
    const n = CHARACTERS.length + 1, cols = GRID.cols;
    let i = this.cur[p];
    if (dx) i = (i + dx + n) % n;
    if (dy) { i += dy * cols; if (i >= n) i -= cols * 2; if (i < 0) i += cols * 2; i = clamp(i, 0, n - 1); }
    this.cur[p] = i; SFX.select();
  }
  update() {
    this.t++;
    for (let p = 0; p < 2; p++) {
      if (this.done[p]) continue;
      const c = this.ctrlFor(p);
      const L = c ? c.pressed('left') : Menu.left(), R = c ? c.pressed('right') : Menu.right();
      const U = c ? c.pressed('up') : Menu.up(), D = c ? c.pressed('down') : Menu.down();
      const OK = c ? c.anyAttack() || (p === 0 && Keys.taps.has('Enter')) : Menu.ok();
      if (L) this.move(p, -1, 0); if (R) this.move(p, 1, 0); if (U) this.move(p, 0, -1); if (D) this.move(p, 0, 1);
      if (OK) {
        const ch = this.cur[p] === RANDOM_SLOT ? pick(CHARACTERS) : CHARACTERS[this.cur[p]];
        this.picked[p] = ch; this.done[p] = true;
        SFX.confirm(); SFX.say(ch.name.toLowerCase(), 0.4);
      }
    }
    if (Menu.back()) { Game.set(new TitleScene()); return; }
    if (this.done[0] && this.done[1] && ++this.out > 45) {
      if (this.mode === '1p') {
        const opps = CHARACTERS.filter((c) => c !== this.picked[0]).sort(() => Math.random() - 0.5);
        Game.ladder = { player: this.picked[0], opps, idx: 0 };
        Game.set(new VersusScene([this.picked[0], opps[0]], '1p', 0));
      } else {
        Game.ladder = null;
        Game.set(new VersusScene(this.picked, '2p', rndi(0, STAGES.length - 1)));
      }
    }
  }
  cellRect(i) {
    const c = i % GRID.cols, r = Math.floor(i / GRID.cols);
    return { x: GRID.x + c * (GRID.w + GRID.gap), y: GRID.y + r * (GRID.h + GRID.gap) };
  }
  drawUI(ctx) {
    menuBackdrop(ctx, this.t);
    bigText(ctx, 'CHOOSE YOUR FIGHTER', W / 2, 60, 52, 'gold');
    for (let i = 0; i <= CHARACTERS.length; i++) {
      const { x, y } = this.cellRect(i);
      ctx.fillStyle = '#000'; ctx.fillRect(x - 3, y - 3, GRID.w + 6, GRID.h + 6);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, GRID.w, GRID.h); ctx.clip();
      if (i < CHARACTERS.length) {
        const c = CHARACTERS[i], col = c.look.mask || c.look.torso;
        const g = ctx.createLinearGradient(0, y, 0, y + GRID.h);
        g.addColorStop(0, shade(col, -0.55)); g.addColorStop(1, shade(col, -0.85));
        ctx.fillStyle = g; ctx.fillRect(x, y, GRID.w, GRID.h);
        drawFigure(ctx, c, x + GRID.w / 2 - 6, y + 236, 0.95, 1, POSES.idle);
      } else {
        ctx.fillStyle = '#1a1010'; ctx.fillRect(x, y, GRID.w, GRID.h);
        bigText(ctx, '?', x + GRID.w / 2, y + GRID.h / 2, 80, 'gold');
      }
      ctx.restore();
    }
    for (let p = 1; p >= 0; p--) {
      if (this.mode === '1p' && p === 1) continue;
      const { x, y } = this.cellRect(this.cur[p]);
      const col = p === 0 ? '#ff2a1a' : '#2a8aff';
      const blink = this.done[p] || (this.t >> 3) % 2 === 0;
      ctx.strokeStyle = blink ? col : shade(col, -0.4); ctx.lineWidth = 5;
      ctx.strokeRect(x - 2 + p * 4, y - 2 + p * 4, GRID.w + 4 - p * 8, GRID.h + 4 - p * 8);
      smallText(ctx, p === 0 ? '1P' : '2P', x + (p === 0 ? 6 : GRID.w - 26), y + GRID.h - 12, 18, col);
    }
    // big previews
    for (let p = 0; p < 2; p++) {
      const x = p === 0 ? 125 : W - 125;
      let c = this.picked[p] || (this.cur[p] === RANDOM_SLOT ? null : CHARACTERS[this.cur[p]]);
      if (this.mode === '1p' && p === 1) { bigText(ctx, '?', x, 330, 120, 'white', 'center', 0.4); smallText(ctx, 'CPU', x, 470, 26, '#888', 'center'); continue; }
      if (!c) { bigText(ctx, '?', x, 330, 120, 'gold'); continue; }
      const ps = this.done[p] ? POSES.win : idlePose(this.t + p * 30);
      drawFigure(ctx, c, x, 450, 1.0, p === 0 ? 1 : -1, ps);
      bigText(ctx, c.name, x, 482, 34, p === 0 ? 'red' : 'blue');
    }
    // info box for P1's hover
    const c = this.cur[0] === RANDOM_SLOT ? null : CHARACTERS[this.cur[0]];
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(GRID.x - 4, 372, GRID.w * 4 + GRID.gap * 3 + 8, 150);
    if (c) {
      smallText(ctx, c.bio, W / 2, 388, 16, '#c8b090', 'center');
      moveLines(c).forEach(([n, s], i) => {
        smallText(ctx, n, GRID.x + 10, 414 + i * 22, 17, n.startsWith('FATALITY') ? '#ff5040' : '#f2c230');
        smallText(ctx, s, GRID.x + GRID.w * 4 + GRID.gap * 3 - 10, 414 + i * 22, 17, '#ffffff', 'right');
      });
    } else smallText(ctx, 'A RANDOM WARRIOR WILL BE CHOSEN', W / 2, 440, 20, '#c8b090', 'center');
    smallText(ctx, 'ESC: BACK', 12, H - 12, 14, '#7a6a50');
  }
}

class VersusScene {
  constructor(chars, mode, stage) { this.chars = chars; this.mode = mode; this.stage = stage; this.t = 0; SFX.gong(); }
  update() {
    this.t++;
    if (this.t > 170 || (this.t > 30 && Menu.ok())) Game.startFight(this.chars, this.mode, this.stage);
  }
  drawUI(ctx) {
    menuBackdrop(ctx, this.t);
    ctx.fillStyle = 'rgba(120,0,0,0.35)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * 0.56, 0); ctx.lineTo(W * 0.44, H); ctx.lineTo(0, H); ctx.fill();
    const slide = Math.min(1, this.t / 25);
    drawFigure(ctx, this.chars[0], lerp(-150, 250, ease(slide)), 500, 1.45, 1, idlePose(this.t));
    drawFigure(ctx, this.chars[1], lerp(W + 150, W - 250, ease(slide)), 500, 1.45, -1, idlePose(this.t + 30));
    bigText(ctx, this.chars[0].name, 250, 520, 40, 'red');
    bigText(ctx, this.chars[1].name, W - 250, 520, 40, 'blue');
    const k = this.t < 30 ? 2 - this.t / 30 : 1;
    bigText(ctx, 'VS', W / 2, 280, 140 * k, 'gold');
    if (Game.ladder && this.mode === '1p') bigText(ctx, `BATTLE ${Game.ladder.idx + 1} OF ${Game.ladder.opps.length}`, W / 2, 50, 40, 'white');
    smallText(ctx, STAGES[this.stage].name, W / 2, 400, 22, '#c8a060', 'center');
  }
}

class FightScene {
  constructor(m, mode) { this.m = m; this.mode = mode; this.paused = false; }
  update() {
    if (Keys.taps.has('Enter') || Keys.taps.has('Escape')) { this.paused = !this.paused; SFX.select(); }
    if (this.paused) {
      if (Keys.taps.has('KeyQ')) Game.set(new TitleScene());
      return;
    }
    this.m.update();
  }
  drawWorld(ctx) { this.m.drawWorld(ctx); }
  drawUI(ctx) {
    this.m.drawUI(ctx);
    if (this.m.round === 1 && this.m.phase === 'intro') smallText(ctx, 'ENTER = PAUSE / MOVE LIST', W / 2, H - 16, 16, '#c8b090', 'center');
    if (!this.paused) return;
    ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(0, 0, W, H);
    bigText(ctx, 'PAUSED', W / 2, 70, 64, 'gold');
    this.m.f.forEach((f, i) => {
      const x = i === 0 ? 80 : W / 2 + 40;
      bigText(ctx, f.c.name, x, 140, 36, i === 0 ? 'red' : 'blue', 'left');
      moveLines(f.c).forEach(([n, s], k) => {
        smallText(ctx, n, x, 185 + k * 30, 19, n.startsWith('FATALITY') ? '#ff5040' : '#f2c230');
        smallText(ctx, s, x + 370, 185 + k * 30, 19, '#fff', 'right');
      });
    });
    smallText(ctx, 'Directions are shown facing right (→ = toward opponent).  Fatalities only during FINISH HIM/HER.', W / 2, 400, 16, '#c8b090', 'center');
    smallText(ctx, 'ENTER: RESUME      Q: QUIT TO TITLE', W / 2, 470, 22, '#ffffff', 'center');
  }
}

class ContinueScene {
  constructor() { this.t = 0; this.n = 9; SFX.say('Game over', 0.3); }
  update() {
    this.t++;
    if (this.n >= 0 && this.t % 70 === 0) { this.n--; if (this.n >= 0) SFX.select(); }
    if (this.n >= 0 && this.t > 20 && Menu.ok()) {
      const L = Game.ladder;
      Game.set(new VersusScene([L.player, L.opps[L.idx]], '1p', L.idx % STAGES.length));
    }
    if (this.n < 0 && this.t % 70 > 60) Game.set(new TitleScene());
  }
  drawUI(ctx) {
    menuBackdrop(ctx, this.t);
    if (this.n >= 0) {
      bigText(ctx, 'CONTINUE?', W / 2, 180, 80, 'gold');
      bigText(ctx, String(this.n), W / 2, 320, 140, 'red');
      smallText(ctx, 'PRESS ATTACK', W / 2, 440, 24, '#c8b090', 'center');
    } else bigText(ctx, 'GAME OVER', W / 2, H / 2, 100, 'red');
  }
}

class EndingScene {
  constructor(c) { this.c = c; this.t = 0; SFX.say(c.name.toLowerCase() + ' is the champion', 0.35); }
  update() { this.t++; if (this.t > 90 && Menu.ok()) Game.set(new TitleScene()); }
  drawUI(ctx) {
    menuBackdrop(ctx, this.t * 3);
    drawMedallion(ctx, W / 2, 110, 60);
    bigText(ctx, 'CONGRATULATIONS', W / 2, 210, 64, 'gold');
    drawFigure(ctx, this.c, W / 2, 500, 1.2, 1, POSES.win);
    bigText(ctx, this.c.name, W / 2, 270, 48, 'red');
    smallText(ctx, 'IS THE CHAMPION OF THE MORTAL TOURNAMENT', W / 2, 305, 22, '#e8d8b0', 'center');
  }
}

class MoveListScene {
  constructor() { this.page = 0; this.t = 0; }
  update() {
    this.t++;
    const n = CHARACTERS.length + 1;
    if (Menu.left()) { this.page = (this.page + n - 1) % n; SFX.select(); }
    if (Menu.right()) { this.page = (this.page + 1) % n; SFX.select(); }
    if (Menu.back() || (this.t > 10 && Keys.taps.has('Enter'))) Game.set(new TitleScene());
  }
  drawUI(ctx) {
    menuBackdrop(ctx, this.t);
    smallText(ctx, '← →  CHANGE PAGE      ESC: BACK', W / 2, H - 16, 16, '#a89070', 'center');
    if (this.page === 0) {
      bigText(ctx, 'CONTROLS', W / 2, 50, 56, 'gold');
      const rows = [
        ['', 'PLAYER 1', 'PLAYER 2'],
        ['Move / Jump / Crouch', 'W A S D', 'Arrow keys'],
        ['High Punch (HP)', 'U', 'Num 7  or  .'],
        ['Low Punch (LP)', 'J', 'Num 4  or  ,'],
        ['High Kick (HK)', 'O', 'Num 9  or  \''],
        ['Low Kick (LK)', 'L', 'Num 6  or  ;'],
        ['Block (BLK)', 'I / K / Space', 'Num 8 / 5 / 0  or  /'],
      ];
      rows.forEach((r, i) => {
        smallText(ctx, r[0], 120, 110 + i * 34, 20, '#f2c230');
        smallText(ctx, r[1], 520, 110 + i * 34, 20, i ? '#fff' : '#ff6040', 'center');
        smallText(ctx, r[2], 760, 110 + i * 34, 20, i ? '#fff' : '#4aa0ff', 'center');
      });
      const tips = [
        'Down + HP = UPPERCUT     Back + LK = SWEEP     Back + HK = ROUNDHOUSE',
        'LP / HP up close = THROW (beats block)     Hold Down + Block for low attacks',
        'Projectiles can be ducked.  Gamepads supported (X/Y punch, A/B kick, bumpers block).',
        'In 1 player mode both key sets control your fighter.  Pause anytime with ENTER.',
      ];
      tips.forEach((t, i) => smallText(ctx, t, W / 2, 380 + i * 28, 17, '#c8b090', 'center'));
      return;
    }
    const c = CHARACTERS[this.page - 1];
    drawFigure(ctx, c, 190, 470, 1.25, 1, idlePose(this.t));
    bigText(ctx, c.name, 600, 70, 60, 'red');
    smallText(ctx, c.bio, 600, 120, 18, '#c8b090', 'center');
    moveLines(c).forEach(([n, s], i) => {
      smallText(ctx, n, 380, 175 + i * 40, 24, n.startsWith('FATALITY') ? '#ff5040' : '#f2c230');
      smallText(ctx, s, 880, 175 + i * 40, 24, '#ffffff', 'right');
    });
    smallText(ctx, 'Directions shown facing right.  Fatalities: only at FINISH HIM/HER.', 600, 440, 16, '#a89070', 'center');
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const wcan = document.createElement('canvas');
const wctx = wcan.getContext('2d');
let wScale = 1;
const scan = document.createElement('canvas');

function resize() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  const cw = Math.floor(W * s), ch = Math.floor(H * s), dpr = window.devicePixelRatio || 1;
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  wScale = Game.settings.pixel ? 2 / 3 : canvas.width / W;
  wcan.width = Math.round(W * wScale); wcan.height = Math.round(H * wScale);
  scan.width = canvas.width; scan.height = canvas.height;
  const sc = scan.getContext('2d');
  sc.fillStyle = 'rgba(0,0,0,0.13)';
  const step = Math.max(2, Math.round(canvas.height / 270));
  for (let y = 0; y < scan.height; y += step) sc.fillRect(0, y, scan.width, Math.max(1, step / 2));
}
addEventListener('resize', resize);

function step() {
  for (const c of Game.ctrls()) c.poll();
  Game.scene.update();
  for (const c of Game.ctrls()) c.endFrame();
  Keys.taps.clear();
  Game.frame++;
}

function render() {
  const sc = Game.scene;
  wctx.setTransform(wScale, 0, 0, wScale, 0, 0);
  if (sc.drawWorld) sc.drawWorld(wctx);
  else { wctx.fillStyle = '#000'; wctx.fillRect(0, 0, W, H); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = !Game.settings.pixel;
  ctx.drawImage(wcan, 0, 0, canvas.width, canvas.height);
  const s = canvas.width / W;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.imageSmoothingEnabled = true;
  sc.drawUI(ctx);
  if (Game.settings.pixel) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(scan, 0, 0); }
}

let acc = 0, last = performance.now();
function loop(now) {
  acc += Math.min(100, now - last); last = now;
  while (acc >= 1000 / 60) { step(); acc -= 1000 / 60; }
  render();
  requestAnimationFrame(loop);
}

resize();
if (document.fonts) document.fonts.load('40px Anton').catch(() => {});
Game.set(new TitleScene());
requestAnimationFrame(loop);
window.__game = Game;
