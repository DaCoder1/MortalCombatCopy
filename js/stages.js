'use strict';
// Stage art is painted procedurally once into offscreen canvases (a far
// parallax layer and a near layer), then animated details are drawn per frame.
const PARALLAX = 0.45;
const FAR_W = Math.ceil(W + (STAGE_W - W) * PARALLAX);
const STAGE_RES = 1.5;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * STAGE_RES); c.height = Math.ceil(h * STAGE_RES);
  const ctx = c.getContext('2d'); ctx.scale(STAGE_RES, STAGE_RES);
  return [c, ctx];
}

// Seeded random so stages look identical every time.
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([k, c]) => g.addColorStop(k, c));
  return g;
}

function mountains(ctx, R, w, base, amp, step, col) {
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
  let y = base;
  for (let x = 0; x <= w + step; x += step) { y = clamp(y + (R() - 0.5) * amp, base - amp * 1.4, base + amp * 0.6); ctx.lineTo(x, y); }
  ctx.lineTo(w, H); ctx.closePath(); ctx.fill();
}

function crowd(ctx, R, x0, x1, y, col) {
  for (let x = x0; x < x1; x += 15 + R() * 6) {
    const h = y + R() * 6;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, h, 8, 0, TAU); ctx.fill();
    ctx.fillRect(x - 13, h + 7, 26, 40);
  }
}

function flame(ctx, x, y, t, s = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const fl = 0.85 + Math.sin(t * 0.5 + x) * 0.1 + Math.random() * 0.08;
  const g = ctx.createRadialGradient(x, y, 2, x, y, 90 * s * fl);
  g.addColorStop(0, 'rgba(255,170,60,0.45)'); g.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 90 * s * fl, 0, TAU); ctx.fill();
  for (let i = 0; i < 3; i++) {
    const hh = (26 - i * 6) * s * fl, ww = (9 - i * 2.5) * s;
    ctx.fillStyle = ['#ff4a00', '#ff9a1a', '#fff0a0'][i];
    ctx.beginPath(); ctx.moveTo(x - ww, y);
    ctx.quadraticCurveTo(x - ww * 0.6 + Math.sin(t * 0.7 + i) * 3, y - hh * 0.6, x + Math.sin(t * 0.4 + i) * 3, y - hh);
    ctx.quadraticCurveTo(x + ww * 0.6, y - hh * 0.5, x + ww, y);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function torchPost(ctx, x, y) {
  ctx.fillStyle = '#1a120c'; ctx.fillRect(x - 4, y, 8, 34);
  ctx.fillStyle = '#4a3020'; ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.lineTo(x + 6, y + 10); ctx.lineTo(x - 6, y + 10); ctx.closePath(); ctx.fill();
}

const STAGES = [
  {
    name: 'THE PIT',
    build() {
      const R = seeded(7);
      const [far, f] = makeCanvas(FAR_W, H);
      f.fillStyle = vgrad(f, 0, H, [[0, '#04020a'], [0.4, '#160a28'], [0.7, '#3a1232'], [1, '#08040a']]);
      f.fillRect(0, 0, FAR_W, H);
      for (let i = 0; i < 180; i++) { f.fillStyle = `rgba(255,255,255,${0.2 + R() * 0.7})`; f.fillRect(R() * FAR_W, R() * 300, R() < 0.9 ? 1 : 2, R() < 0.9 ? 1 : 2); }
      const mx = FAR_W * 0.5, my = 118;
      const glow = f.createRadialGradient(mx, my, 40, mx, my, 260);
      glow.addColorStop(0, 'rgba(255,225,190,0.32)'); glow.addColorStop(1, 'rgba(255,200,160,0)');
      f.fillStyle = glow; f.fillRect(0, 0, FAR_W, 420);
      f.fillStyle = '#efe0c0'; f.beginPath(); f.arc(mx, my, 64, 0, TAU); f.fill();
      for (let i = 0; i < 9; i++) { f.fillStyle = 'rgba(150,120,100,0.25)'; f.beginPath(); f.arc(mx + (R() - 0.5) * 90, my + (R() - 0.5) * 90, 5 + R() * 12, 0, TAU); f.fill(); }
      f.fillStyle = 'rgba(30,10,40,0.75)';
      for (let i = 0; i < 9; i++) { f.beginPath(); f.ellipse(R() * FAR_W, 80 + R() * 120, 90 + R() * 120, 10 + R() * 10, 0, 0, TAU); f.fill(); }
      mountains(f, R, FAR_W, 300, 40, 26, '#1d0c24');
      mountains(f, R, FAR_W, 345, 28, 18, '#10061a');
      f.fillStyle = vgrad(f, 360, H, [[0, '#0a0410'], [1, '#000000']]); f.fillRect(0, 372, FAR_W, H);
      // the spike pit far below
      for (let x = 0; x < FAR_W; x += 9) {
        const tip = 395 + R() * 30;
        f.fillStyle = R() < 0.5 ? '#3a3440' : '#2a2630';
        f.beginPath(); f.moveTo(x - 4, 470); f.lineTo(x, tip); f.lineTo(x + 4, 470); f.closePath(); f.fill();
      }
      for (let i = 0; i < 9; i++) { // impaled victims
        const x = R() * FAR_W, y = 405 + R() * 15;
        f.fillStyle = '#4a3a3a'; f.save(); f.translate(x, y); f.rotate((R() - 0.5) * 1.5);
        f.fillRect(-12, -4, 24, 7); f.beginPath(); f.arc(15, -1, 5, 0, TAU); f.fill();
        f.fillRect(-20, -2, 10, 3); f.restore();
      }
      f.fillStyle = vgrad(f, 380, 470, [[0, 'rgba(90,30,70,0)'], [1, 'rgba(90,30,70,0.35)']]); f.fillRect(0, 380, FAR_W, 90);

      const [near, n] = makeCanvas(STAGE_W, H);
      // back railing
      n.fillStyle = '#2e2a34'; n.fillRect(0, 438, STAGE_W, 9);
      n.fillStyle = '#4a4552'; n.fillRect(0, 436, STAGE_W, 3);
      for (let x = 20; x < STAGE_W; x += 140) {
        n.fillStyle = vgrad(n, 420, 482, [[0, '#6a6472'], [1, '#2a2630']]); n.fillRect(x, 420, 18, 62);
        n.fillStyle = '#7a7482'; n.fillRect(x - 3, 416, 24, 7);
      }
      // bridge deck
      n.fillStyle = vgrad(n, 478, H, [[0, '#6a6570'], [0.5, '#46424c'], [1, '#1e1c22']]); n.fillRect(0, 478, STAGE_W, H - 478);
      n.strokeStyle = 'rgba(0,0,0,0.45)'; n.lineWidth = 1.5;
      [490, 506, 524].forEach((y, i) => {
        n.beginPath(); n.moveTo(0, y); n.lineTo(STAGE_W, y); n.stroke();
        for (let x = (i % 2) * 40; x < STAGE_W; x += 80 + i * 8) { n.beginPath(); n.moveTo(x, y); n.lineTo(x, y + 16 + i * 2); n.stroke(); }
      });
      n.fillStyle = 'rgba(255,255,255,0.08)'; n.fillRect(0, 478, STAGE_W, 3);
      n.fillStyle = '#121014'; n.fillRect(0, 534, STAGE_W, 6);
      return { far, near, torches: Array.from({ length: 6 }, (_, i) => ({ x: 29 + i * 280, y: 412, s: 0.6 })) };
    },
  },
  {
    name: 'COURTYARD',
    build() {
      const R = seeded(21);
      const [far, f] = makeCanvas(FAR_W, H);
      f.fillStyle = vgrad(f, 0, H, [[0, '#1a0404'], [0.35, '#5a140a'], [0.6, '#c0501e'], [0.75, '#f0a040'], [1, '#3a1a0a']]);
      f.fillRect(0, 0, FAR_W, H);
      const sx = FAR_W * 0.6;
      const sg = f.createRadialGradient(sx, 300, 30, sx, 300, 220);
      sg.addColorStop(0, 'rgba(255,230,140,0.8)'); sg.addColorStop(1, 'rgba(255,160,60,0)');
      f.fillStyle = sg; f.fillRect(0, 0, FAR_W, H);
      f.fillStyle = '#ffd890'; f.beginPath(); f.arc(sx, 300, 52, 0, TAU); f.fill();
      mountains(f, R, FAR_W, 330, 46, 30, '#5a1e10');
      mountains(f, R, FAR_W, 360, 24, 20, '#2a0c06');
      for (let i = 0; i < 4; i++) { // distant pagodas
        const x = 80 + i * (FAR_W / 4) + R() * 60, y = 360;
        f.fillStyle = '#1a0604';
        for (let k = 0; k < 4; k++) {
          const w = 70 - k * 14, yy = y - k * 26;
          f.fillRect(x - w * 0.35, yy - 22, w * 0.7, 22);
          f.beginPath(); f.moveTo(x - w * 0.6, yy - 18); f.quadraticCurveTo(x, yy - 34, x + w * 0.6, yy - 18); f.lineTo(x + w * 0.45, yy - 24); f.lineTo(x - w * 0.45, yy - 24); f.closePath(); f.fill();
        }
        f.fillRect(x - 2, y - 130, 4, 30);
      }

      const [near, n] = makeCanvas(STAGE_W, H);
      n.fillStyle = vgrad(n, 190, 480, [[0, '#3a1810'], [1, '#22100a']]); n.fillRect(0, 196, STAGE_W, 284);
      n.fillStyle = '#100604'; // balcony openings with spectators
      for (let x = 0; x < STAGE_W; x += 260) n.fillRect(x + 50, 236, 160, 160);
      for (let x = 0; x < STAGE_W; x += 260) {
        crowd(n, R, x + 58, x + 205, 300, '#060202');
        crowd(n, R, x + 66, x + 200, 340, '#0d0503');
      }
      // roof beam
      n.fillStyle = '#160806'; n.fillRect(0, 150, STAGE_W, 50);
      n.fillStyle = '#b8862a'; n.fillRect(0, 194, STAGE_W, 4); n.fillRect(0, 156, STAGE_W, 2);
      for (let x = 0; x < STAGE_W; x += 40) { n.fillStyle = '#2a120c'; n.fillRect(x + 4, 200, 26, 10); }
      // throne dais
      const cx = STAGE_W / 2;
      n.fillStyle = '#4a2416'; n.fillRect(cx - 110, 360, 220, 80);
      n.fillStyle = '#5a2e1c'; n.fillRect(cx - 80, 330, 160, 30);
      n.fillStyle = '#2a0e08'; n.fillRect(cx - 40, 230, 80, 100);
      n.fillStyle = '#b8862a'; n.fillRect(cx - 44, 226, 88, 6);
      n.fillStyle = '#080202'; n.beginPath(); n.arc(cx, 266, 13, 0, TAU); n.fill(); // seated sorcerer
      n.fillRect(cx - 22, 280, 44, 52);
      // pillars
      for (let x = 100; x < STAGE_W; x += 260) {
        n.fillStyle = vgrad(n, 0, 0, [[0, '#000']]);
        const g = n.createLinearGradient(x - 22, 0, x + 22, 0);
        g.addColorStop(0, '#4a0a06'); g.addColorStop(0.4, '#a82418'); g.addColorStop(1, '#3a0604');
        n.fillStyle = g; n.fillRect(x - 22, 196, 44, 284);
        n.fillStyle = '#b8862a'; n.fillRect(x - 25, 200, 50, 7); n.fillRect(x - 25, 455, 50, 7);
        torchPost(n, x, 300);
      }
      // balustrade
      n.fillStyle = '#4a2a1e'; n.fillRect(0, 446, STAGE_W, 34);
      n.fillStyle = '#6a3e2a'; n.fillRect(0, 442, STAGE_W, 6);
      for (let x = 10; x < STAGE_W; x += 34) { n.fillStyle = '#2a140c'; n.fillRect(x, 452, 14, 24); }
      // tiled floor in perspective
      n.fillStyle = vgrad(n, 478, H, [[0, '#7a5640'], [1, '#2a1a10']]); n.fillRect(0, 478, STAGE_W, H - 478);
      n.strokeStyle = 'rgba(0,0,0,0.4)'; n.lineWidth = 1.5;
      [492, 510, 532].forEach((y) => { n.beginPath(); n.moveTo(0, y); n.lineTo(STAGE_W, y); n.stroke(); });
      for (let x = -900; x < STAGE_W + 900; x += 70) { n.beginPath(); n.moveTo(cx + (x - cx) * 0.75, 478); n.lineTo(cx + (x - cx) * 1.3, H); n.stroke(); }
      return { far, near, torches: Array.from({ length: 6 }, (_, i) => ({ x: 100 + i * 260, y: 298, s: 0.8 })) };
    },
  },
  {
    name: "THE LAIR",
    build() {
      const R = seeded(99);
      const [far, f] = makeCanvas(FAR_W, H);
      f.fillStyle = '#0c0606'; f.fillRect(0, 0, FAR_W, H);
      for (let y = 0; y < 480; y += 22) {
        for (let x = (y / 22) % 2 ? -20 : 0; x < FAR_W; x += 44) {
          const v = 18 + Math.floor(R() * 16);
          f.fillStyle = `rgb(${v + 10},${v - 2},${v - 4})`; f.fillRect(x + 1, y + 1, 42, 20);
        }
      }
      for (let i = 0; i < 7; i++) { // chains
        const x = R() * FAR_W, len = 120 + R() * 180;
        f.strokeStyle = '#3a3434'; f.lineWidth = 3;
        for (let y = 0; y < len; y += 12) { f.beginPath(); f.ellipse(x, y, 4, 7, 0, 0, TAU); f.stroke(); }
      }
      for (let x = 30; x < FAR_W; x += 110) { // skull niches
        f.fillStyle = '#050202'; f.beginPath(); f.arc(x, 250, 26, Math.PI, 0); f.fillRect(x - 26, 250, 52, 34); f.fill();
        drawSkull(f, x, 266, 0, 0.9);
      }
      const rg = f.createLinearGradient(0, 260, 0, H);
      rg.addColorStop(0, 'rgba(160,20,0,0)'); rg.addColorStop(1, 'rgba(200,40,0,0.45)');
      f.fillStyle = rg; f.fillRect(0, 0, FAR_W, H);

      const [near, n] = makeCanvas(STAGE_W, H);
      for (let x = 60; x < STAGE_W; x += 360) {
        const g = n.createLinearGradient(x - 30, 0, x + 30, 0);
        g.addColorStop(0, '#120a08'); g.addColorStop(0.5, '#3a2c28'); g.addColorStop(1, '#0c0605');
        n.fillStyle = g; n.fillRect(x - 30, 120, 60, 360);
        n.fillStyle = '#2a201c'; n.fillRect(x - 38, 112, 76, 14); n.fillRect(x - 38, 466, 76, 14);
        drawSkull(n, x, 98, 0, 1.2);
        torchPost(n, x + 50, 290);
      }
      n.fillStyle = vgrad(n, 478, H, [[0, '#3a2c26'], [1, '#0e0908']]); n.fillRect(0, 478, STAGE_W, H - 478);
      n.strokeStyle = 'rgba(255,90,20,0.75)'; n.lineWidth = 2; n.shadowColor = '#ff4000'; n.shadowBlur = 8;
      for (let i = 0; i < 14; i++) {
        let x = R() * STAGE_W, y = 486 + R() * 40;
        n.beginPath(); n.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += 10 + R() * 20; y += (R() - 0.5) * 10; n.lineTo(x, clamp(y, 482, 538)); }
        n.stroke();
      }
      n.shadowBlur = 0;
      for (let i = 0; i < 26; i++) { // scattered bones
        const x = R() * STAGE_W, y = 482 + R() * 8;
        n.save(); n.translate(x, y); n.rotate((R() - 0.5) * 0.8);
        n.fillStyle = '#b8b098'; n.fillRect(-10, -2, 20, 4);
        n.beginPath(); n.arc(-10, -2, 3, 0, TAU); n.arc(-10, 2, 3, 0, TAU); n.arc(10, -2, 3, 0, TAU); n.arc(10, 2, 3, 0, TAU); n.fill();
        n.restore();
      }
      for (let i = 0; i < 5; i++) drawSkull(n, R() * STAGE_W, 480, (R() - 0.5), 0.7);
      return { far, near, torches: Array.from({ length: 5 }, (_, i) => ({ x: 110 + i * 360, y: 288, s: 0.9 })) };
    },
  },
];

const stageCache = {};
function getStage(i) {
  if (!stageCache[i]) stageCache[i] = Object.assign({ name: STAGES[i].name }, STAGES[i].build());
  return stageCache[i];
}

function drawStage(ctx, st, cam, t) {
  const fx = cam * PARALLAX;
  ctx.drawImage(st.far, fx * STAGE_RES, 0, W * STAGE_RES, H * STAGE_RES, 0, 0, W, H);
  ctx.drawImage(st.near, cam * STAGE_RES, 0, W * STAGE_RES, H * STAGE_RES, 0, 0, W, H);
  for (const tc of st.torches) {
    const x = tc.x - cam;
    if (x > -100 && x < W + 100) flame(ctx, x, tc.y, t * 0.25 + tc.x, tc.s);
  }
}
