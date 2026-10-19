'use strict';
// ---------------------------------------------------------------------------
// Pose solving: angles -> joint positions (local space, facing right,
// feet on y = 0, up is negative y).
// ---------------------------------------------------------------------------
const JOINT_KEYS = ['hip', 'sh', 'neck', 'hd', 'fs', 'bs', 'fe', 'fh', 'be', 'bh', 'fhip', 'bhip', 'fk', 'ff', 'bk', 'bf'];

function limbPts(J, o, e, h, a1, a2, l1, l2) {
  const s = J[o];
  J[e] = { x: s.x + Math.sin(a1) * l1, y: s.y + Math.cos(a1) * l1 };
  const a = a1 + a2;
  J[h] = { x: J[e].x + Math.sin(a) * l2, y: J[e].y + Math.cos(a) * l2 };
}

function groundOffset(J) {
  let m = -1e9;
  const chk = (p, r) => { if (p.y + r > m) m = p.y + r; };
  chk(J.ff, 6); chk(J.bf, 6); chk(J.fk, 9); chk(J.bk, 9); chk(J.fh, 7); chk(J.bh, 7); chk(J.hd, 15); chk(J.hip, 14); chk(J.sh, 14);
  return -m;
}

function solvePose(p) {
  const B = BODY, J = {};
  const t = p.torso;
  J.hip = { x: 0, y: 0 };
  J.sh = { x: Math.sin(t) * B.torso, y: -Math.cos(t) * B.torso };
  const ht = t + p.head;
  J.neck = { x: J.sh.x + Math.sin(ht) * B.neck, y: J.sh.y - Math.cos(ht) * B.neck };
  J.hd = { x: J.neck.x + Math.sin(ht) * B.head, y: J.neck.y - Math.cos(ht) * B.head };
  J.fs = { x: J.sh.x + 2, y: J.sh.y + 6 };
  J.bs = { x: J.sh.x - 3, y: J.sh.y + 6 };
  limbPts(J, 'fs', 'fe', 'fh', p.fa1, p.fa2, B.ua, B.fa);
  limbPts(J, 'bs', 'be', 'bh', p.ba1, p.ba2, B.ua, B.fa);
  J.fhip = { x: 3, y: 0 };
  J.bhip = { x: -3, y: 0 };
  limbPts(J, 'fhip', 'fk', 'ff', p.fl1, p.fl2, B.th, B.sh);
  limbPts(J, 'bhip', 'bk', 'bf', p.bl1, p.bl2, B.th, B.sh);

  let off = 0;
  if (!p.flat) off = groundOffset(J);
  if (p.rot) {
    const cx = J.sh.x / 2, cy = J.sh.y / 2, c = Math.cos(p.rot), s = Math.sin(p.rot);
    for (const k of JOINT_KEYS) {
      const q = J[k], dx = q.x - cx, dy = q.y - cy;
      J[k] = { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
    }
  }
  if (p.flat) off = groundOffset(J);
  for (const k of JOINT_KEYS) J[k].y += off;
  return J;
}

const lerpPose = (a, b, k) => {
  const r = { flat: k < 0.5 ? a.flat : b.flat };
  for (const key of POSE_KEYS) r[key] = a[key] + (b[key] - a[key]) * k;
  return r;
};

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------
const OUTLINE = '#0a0a0a';
const midPt = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

function seg(ctx, a, b, w, col) {
  ctx.strokeStyle = col; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}
function shadedSeg(ctx, a, b, w, col) {
  seg(ctx, a, b, w, col);
  ctx.globalAlpha *= 0.35;
  seg(ctx, { x: a.x - w * 0.12, y: a.y - w * 0.16 }, { x: b.x - w * 0.12, y: b.y - w * 0.16 }, w * 0.38, shade(col, 0.45));
  ctx.globalAlpha /= 0.35;
}
function dot(ctx, p, r, col) {
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
}

// ---------------------------------------------------------------------------
// Fighter rendering. opts: tint/tintK, skeleton, headless, flash
// ---------------------------------------------------------------------------
function renderFighter(ctx, lk, J, o = {}) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (o.skeleton) { renderSkeleton(ctx, J); return; }
  let T = o.tint ? (h) => mix(h, o.tint, o.tintK) : (h) => h;
  if (o.flash) { const base = T; T = (h) => mix(base(h), '#ffffff', 0.6); }
  const D = (h) => shade(T(h), -0.32);
  const lw = lk.legW || 1;

  drawArm(ctx, J.bs, J.be, J.bh, lk, D);
  drawLeg(ctx, J.bhip, J.bk, J.bf, lk, D, lw);
  drawTorso(ctx, J, lk, T);
  drawLeg(ctx, J.fhip, J.fk, J.ff, lk, T, lw);
  if (o.headless) {
    seg(ctx, J.sh, J.neck, 13, OUTLINE); seg(ctx, J.sh, J.neck, 10, '#7a0000'); dot(ctx, J.neck, 5, '#b00000');
  } else {
    seg(ctx, J.sh, J.neck, 14, OUTLINE);
    seg(ctx, J.sh, J.neck, 11, T(lk.style === 'ninja' ? lk.hood : lk.skin));
    const hv = { x: J.hd.x - J.neck.x, y: J.hd.y - J.neck.y };
    drawHead(ctx, lk, T, J.hd.x, J.hd.y, Math.atan2(hv.x, -hv.y), o);
  }
  drawArm(ctx, J.fs, J.fe, J.fh, lk, T);
}

function drawArm(ctx, s, e, h, lk, T) {
  seg(ctx, s, e, 18, OUTLINE); seg(ctx, e, h, 16, OUTLINE); dot(ctx, h, 9.5, OUTLINE);
  shadedSeg(ctx, s, e, 14.5, T(lk.upper));
  shadedSeg(ctx, e, h, 12.5, T(lk.fore));
  if (lk.style === 'god') seg(ctx, s, midPt(s, e, 1.05), 19, T(lk.upper)); // robe sleeve
  if (lk.bracer) seg(ctx, midPt(e, h, 0.45), midPt(e, h, 0.92), 13.5, T(lk.bracer));
  dot(ctx, h, 8, T(lk.hand));
}

function drawLeg(ctx, hip, k, a, lk, T, lw) {
  const sv = { x: a.x - k.x, y: a.y - k.y }, sl = Math.hypot(sv.x, sv.y) || 1;
  const toe = { x: a.x + (sv.y / sl) * 17, y: a.y - (sv.x / sl) * 17 };
  seg(ctx, hip, k, 23 * lw, OUTLINE); seg(ctx, k, a, 19 * lw, OUTLINE); seg(ctx, a, toe, 12, OUTLINE);
  shadedSeg(ctx, hip, k, 19.5 * lw, T(lk.thigh));
  shadedSeg(ctx, k, a, 15.5 * lw, T(lk.shin));
  seg(ctx, midPt(k, a, 0.55), a, 16 * lw, T(lk.boot));
  seg(ctx, a, toe, 9, T(lk.foot));
}

function drawTorso(ctx, J, lk, T) {
  const u0 = { x: J.sh.x - J.hip.x, y: J.sh.y - J.hip.y }, len = Math.hypot(u0.x, u0.y) || 1;
  const u = { x: u0.x / len, y: u0.y / len }, n = { x: -u.y, y: u.x };
  const P = (base, along, side) => ({ x: base.x + u.x * along + n.x * side, y: base.y + u.y * along + n.y * side });
  const hipW = lk.female ? 15 : 16, shW = lk.female ? 17 : 20;
  const pts = [P(J.hip, -4, -hipW), P(J.hip, -4, hipW), P(J.hip, len * 0.62, shW + 3), P(J.sh, 4, shW - 2), P(J.sh, 6, -shW + 4), P(J.hip, len * 0.55, -shW + 1)];
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = T(lk.torso); ctx.fill();
  ctx.lineWidth = 3.5; ctx.strokeStyle = OUTLINE; ctx.stroke();
  // light from the front-top
  ctx.save(); ctx.clip();
  ctx.globalAlpha = 0.18; seg(ctx, P(J.hip, 4, 9), P(J.sh, -2, 12), 12, '#ffffff'); ctx.globalAlpha = 1;

  if (lk.detail === 'straps') {
    seg(ctx, P(J.sh, 2, 16), P(J.hip, 10, -14), 6, T('#141414'));
    seg(ctx, P(J.sh, 2, -14), P(J.hip, 10, 14), 6, T('#141414'));
  } else if (lk.detail === 'abs') {
    ctx.globalAlpha = 0.35;
    seg(ctx, P(J.hip, len * 0.72, 4), P(J.hip, len * 0.72, 18), 2.5, shade(T(lk.skin), -0.5));
    for (let i = 0; i < 3; i++) seg(ctx, P(J.hip, 12 + i * 11, 9), P(J.hip, 12 + i * 11, 18), 2, shade(T(lk.skin), -0.5));
    ctx.globalAlpha = 1;
  } else if (lk.detail === 'top') {
    seg(ctx, P(J.sh, 2, -10), P(J.sh, 2, 18), 9, T(lk.skin));
  } else if (lk.detail === 'vest') {
    seg(ctx, P(J.hip, 4, -15), P(J.sh, 4, -15), 14, T(lk.vest));
    seg(ctx, P(J.sh, 2, 16), P(J.hip, 14, -10), 7, T('#5a4a2a'));
  } else if (lk.detail === 'robe') {
    seg(ctx, P(J.sh, 2, 18), P(J.hip, 4, 0), 5, T(lk.belt));
  }
  ctx.restore();
  seg(ctx, P(J.hip, 7, -hipW - 2), P(J.hip, 7, hipW + 3), 9, T(lk.belt));
  if (lk.style === 'monk' || lk.style === 'ninja') seg(ctx, P(J.hip, 7, -hipW), P(J.hip, -16, -hipW - 10), 6, T(lk.belt)); // sash tail
}

// Head in its own frame: up = -y, face toward +x.
function drawHead(ctx, lk, T, x, y, ang, o = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const R = 15;
  const circle = (col, r = R) => { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = col; ctx.fill(); };
  if (lk.style === 'god') { // long hair behind
    ctx.fillStyle = OUTLINE; ctx.fillRect(-18, -6, 14, 34);
    ctx.fillStyle = T(lk.hair); ctx.fillRect(-16, -6, 11, 32);
  }
  if (lk.style === 'agent') { // ponytail
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(-10, -9); ctx.quadraticCurveTo(-28, -4, -24, 18); ctx.stroke();
    ctx.strokeStyle = T(lk.hair); ctx.lineWidth = 7; ctx.stroke();
  }
  circle(OUTLINE, R + 2);
  if (lk.style === 'ninja') {
    circle(T(lk.hood));
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip();
    ctx.fillStyle = T(lk.mask); ctx.beginPath(); ctx.moveTo(-3, 1); ctx.lineTo(R, -1); ctx.lineTo(R, R); ctx.lineTo(-6, R); ctx.closePath(); ctx.fill();
    ctx.fillStyle = T(lk.mask); ctx.fillRect(-R, -11, 2 * R, 3); // hood band
    ctx.restore();
    ctx.fillStyle = T(lk.eyes); ctx.fillRect(4, -6, 11, 3.5);
    ctx.globalAlpha = 0.35; ctx.fillRect(2, -8, 15, 7); ctx.globalAlpha = 1;
  } else {
    circle(T(lk.skin));
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip();
    if (lk.style === 'monk') {
      ctx.fillStyle = T(lk.hair); ctx.fillRect(-R, -R, 2 * R, 8); ctx.fillRect(-R, -R, 12, 2 * R - 6);
      ctx.fillStyle = T(lk.band); ctx.fillRect(-R, -8, 2 * R, 4);
    } else if (lk.style === 'agent') {
      ctx.fillStyle = T(lk.hair); ctx.beginPath(); ctx.moveTo(-R, R); ctx.lineTo(-R, -R); ctx.lineTo(R, -R); ctx.lineTo(R, -8); ctx.lineTo(2, -6); ctx.lineTo(-4, 6); ctx.closePath(); ctx.fill();
    } else if (lk.style === 'merc') {
      ctx.fillStyle = shade(T(lk.skin), -0.25); ctx.fillRect(-R, 4, 2 * R, R); // stubble
      ctx.fillStyle = T(lk.plate); ctx.beginPath(); ctx.moveTo(0, -R); ctx.lineTo(R, -R); ctx.lineTo(R, 1); ctx.lineTo(1, -1); ctx.closePath(); ctx.fill();
    } else if (lk.style === 'god') {
      ctx.fillStyle = T(lk.hair); ctx.fillRect(-R, -R, 12, 2 * R);
    }
    ctx.restore();
    if (lk.style === 'merc') {
      ctx.fillStyle = lk.glow; ctx.beginPath(); ctx.arc(8, -6, 3.2, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(8, -6, 7, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    } else if (lk.style === 'god') {
      ctx.fillStyle = lk.eyes; ctx.fillRect(5, -5, 8, 3);
      ctx.globalAlpha = 0.4; ctx.fillRect(3, -8, 12, 8); ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#1a1010'; ctx.fillRect(8, -5, 4, 3);
      ctx.fillStyle = shade(T(lk.skin), -0.3); ctx.fillRect(13, 5, 3, 2);
    }
    if (lk.style === 'monk') { // headband tails
      ctx.strokeStyle = T(lk.band); ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-13, -6); ctx.lineTo(-28, -2); ctx.moveTo(-13, -5); ctx.lineTo(-26, 5); ctx.stroke();
    }
  }
  if (lk.style === 'god') { // straw hat
    ctx.beginPath(); ctx.moveTo(-34, -5); ctx.lineTo(0, -30); ctx.lineTo(34, -5); ctx.closePath();
    ctx.fillStyle = T(lk.hat); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
    ctx.strokeStyle = shade(T(lk.hat), -0.3); ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(i * 14, -6); ctx.stroke(); }
  }
  ctx.restore();
}

const BONE = '#e9e2cc';
function renderSkeleton(ctx, J) {
  const bone = (a, b) => { seg(ctx, a, b, 8, OUTLINE); seg(ctx, a, b, 5, BONE); dot(ctx, a, 4.5, BONE); dot(ctx, b, 4.5, BONE); };
  bone(J.bs, J.be); bone(J.be, J.bh); bone(J.bhip, J.bk); bone(J.bk, J.bf);
  bone(J.hip, J.sh); bone(J.sh, J.neck);
  const u0 = { x: J.sh.x - J.hip.x, y: J.sh.y - J.hip.y }, len = Math.hypot(u0.x, u0.y) || 1;
  const u = { x: u0.x / len, y: u0.y / len }, n = { x: -u.y, y: u.x };
  for (let i = 0; i < 4; i++) {
    const a = len * (0.45 + i * 0.13), w = 15 - i;
    const c = { x: J.hip.x + u.x * a, y: J.hip.y + u.y * a };
    ctx.strokeStyle = BONE; ctx.lineWidth = 3.5; ctx.beginPath();
    ctx.moveTo(c.x - n.x * w, c.y - n.y * w);
    ctx.quadraticCurveTo(c.x - u.x * 8, c.y - u.y * 8, c.x + n.x * w, c.y + n.y * w); ctx.stroke();
  }
  ctx.fillStyle = BONE; ctx.beginPath(); ctx.ellipse(J.hip.x, J.hip.y, 15, 8, Math.atan2(n.y, n.x), 0, TAU); ctx.fill();
  bone(J.fhip, J.fk); bone(J.fk, J.ff);
  drawSkull(ctx, J.hd.x, J.hd.y, 0, 1);
  bone(J.fs, J.fe); bone(J.fe, J.fh);
}

function drawSkull(ctx, x, y, ang, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
  ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(0, -1, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = BONE; ctx.beginPath(); ctx.arc(0, -1, 13, 0, TAU); ctx.fill();
  ctx.fillRect(1, 6, 11, 8);
  ctx.fillStyle = '#1a1210'; ctx.beginPath(); ctx.arc(6, -3, 3.8, 0, TAU); ctx.fill();
  ctx.fillRect(10, 2, 3, 3);
  for (let i = 0; i < 3; i++) ctx.fillRect(3 + i * 3.5, 11, 1.4, 3);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Arcade-style text
// ---------------------------------------------------------------------------
const FONT = 'Anton, Impact, "Haettenschweiler", "Arial Narrow Bold", "Arial Black", sans-serif';
const TEXT_STYLES = {
  gold: ['#fff6b0', '#f2c230', '#b86a00'],
  red: ['#ff8a60', '#d40000', '#5a0000'],
  blue: ['#e0f4ff', '#6ab8ff', '#1a4aa0'],
  white: ['#ffffff', '#d8d8d8', '#8a8a8a'],
  green: ['#e0ffc0', '#62d040', '#1a6a10'],
};
function bigText(ctx, text, x, y, size, style = 'gold', align = 'center', alpha = 1) {
  const cols = TEXT_STYLES[style] || TEXT_STYLES.gold;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.14); ctx.strokeStyle = '#000';
  ctx.strokeText(text, x + size * 0.04, y + size * 0.06);
  ctx.strokeText(text, x, y);
  const g = ctx.createLinearGradient(0, y - size * 0.45, 0, y + size * 0.45);
  g.addColorStop(0, cols[0]); g.addColorStop(0.5, cols[1]); g.addColorStop(1, cols[2]);
  ctx.fillStyle = g; ctx.fillText(text, x, y);
  ctx.restore();
}
function smallText(ctx, text, x, y, size, col = '#e8e0c8', align = 'left') {
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y); ctx.fillStyle = col; ctx.fillText(text, x, y);
}

// Dragon medallion (title, round wins)
function drawMedallion(ctx, x, y, r, lit = true) {
  ctx.save(); ctx.translate(x, y);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, lit ? '#fff2a0' : '#6a6a6a'); g.addColorStop(0.6, lit ? '#d09a20' : '#3a3a3a'); g.addColorStop(1, lit ? '#6a3a00' : '#1a1a1a');
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, r + 2, 0, TAU); ctx.fill();
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.fillStyle = lit ? '#8a0000' : '#222'; ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, TAU); ctx.fill();
  ctx.fillStyle = lit ? '#f2c230' : '#555';
  ctx.font = `bold ${r * 1.05}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('龍', 0, r * 0.06);
  ctx.restore();
}
