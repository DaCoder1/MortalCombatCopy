'use strict';
// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------
const W = 960, H = 540, GROUND = 500, STAGE_W = 1500, GRAV = 0.8;
const TAU = Math.PI * 2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const _rgbCache = new Map();
function hexRgb(h) {
  let c = _rgbCache.get(h);
  if (c) return c;
  let s = h.slice(1);
  if (s.length === 3) s = s.replace(/./g, '$&$&');
  const n = parseInt(s, 16);
  c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  _rgbCache.set(h, c);
  return c;
}
const _mixCache = new Map();
function mix(h1, h2, k) {
  k = Math.round(clamp(k, 0, 1) * 20) / 20;
  const key = h1 + h2 + k;
  let r = _mixCache.get(key);
  if (r) return r;
  const a = hexRgb(h1), b = hexRgb(h2);
  r = '#' + [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k).toString(16).padStart(2, '0')).join('');
  _mixCache.set(key, r);
  return r;
}
const shade = (h, k) => (k < 0 ? mix(h, '#000000', -k) : mix(h, '#ffffff', k));

// ---------------------------------------------------------------------------
// Skeleton & poses
// Angle convention (fighter facing right):
//   torso: 0 = upright, + = lean forward.
//   limbs: 0 = pointing straight down, +PI/2 = forward, PI = up (absolute).
//   the second segment (forearm / shin) is relative to the first.
//   rot: whole-body rotation (canvas clockwise), flat: ground the rotated body.
// ---------------------------------------------------------------------------
const BODY = { torso: 72, neck: 7, head: 15, ua: 37, fa: 34, th: 57, sh: 57 };
const POSE_KEYS = ['torso', 'head', 'fa1', 'fa2', 'ba1', 'ba2', 'fl1', 'fl2', 'bl1', 'bl2', 'rot'];
const BASE_POSE = { torso: 0.08, head: 0, fa1: 0.6, fa2: 2.0, ba1: 0.25, ba2: 2.2, fl1: 0.35, fl2: -0.4, bl1: -0.3, bl2: -0.1, rot: 0, flat: false };
const pose = (o) => Object.assign({}, BASE_POSE, o);

const CROUCH_LEGS = { fl1: 1.35, fl2: -2.3, bl1: 0.9, bl2: -2.35 };
const TUCK_LEGS = { fl1: 1.6, fl2: -2.4, bl1: 1.0, bl2: -2.2 };
const GUARD = { fa1: 0.85, fa2: 1.9, ba1: 0.55, ba2: 2.1 };

const POSES = {
  idle: pose({}),
  crouch: pose({ torso: 0.7, ...GUARD, ...CROUCH_LEGS }),
  jump: pose({ torso: 0.3, fa1: 1.2, fa2: 1.6, ba1: 0.8, ba2: 1.8, ...TUCK_LEGS }),
  jab: pose({ torso: 0.15, fa1: 1.55, fa2: 0.05 }),
  punchWind: pose({ torso: 0.0, fa1: 0.1, fa2: 2.5, ba1: 0.9, ba2: 1.6 }),
  punch: pose({ torso: 0.3, fa1: 1.75, fa2: 0, ba1: -0.3, ba2: 1.9, fl1: 0.55, fl2: -0.3, bl1: -0.55, bl2: 0 }),
  upperWind: pose({ torso: 0.6, fa1: -0.5, fa2: 0.6, ba1: 0.6, ba2: 1.9, ...CROUCH_LEGS }),
  uppercut: pose({ torso: 0.05, fa1: 2.3, fa2: 0.3, ba1: -0.4, ba2: 0.8, fl1: 0.25, fl2: -0.1, bl1: -0.35, bl2: 0 }),
  kickWind: pose({ torso: -0.1, fl1: 1.5, fl2: -2.2, bl1: -0.1, bl2: 0 }),
  lowkick: pose({ torso: -0.15, fl1: 1.35, fl2: -0.05, bl1: -0.15, bl2: -0.05 }),
  highkick: pose({ torso: -0.45, fl1: 2.15, fl2: -0.05, bl1: -0.05, bl2: 0, fa1: 0.3, fa2: 2.3, ba1: -0.3, ba2: 1.5 }),
  roundhouse: pose({ torso: -0.6, fl1: 2.1, fl2: 0, bl1: 0, bl2: 0, fa1: 1.0, fa2: 0.4, ba1: -1.2, ba2: 0.3 }),
  sweep: pose({ torso: 0.9, fa1: 0.9, fa2: 0.2, ba1: 0.6, ba2: 0.2, fl1: 1.55, fl2: 0, bl1: 1.1, bl2: -2.5 }),
  cpunch: pose({ torso: 0.55, fa1: 1.6, fa2: 0, ba1: 0.5, ba2: 2.1, ...CROUCH_LEGS }),
  clk: pose({ torso: 0.5, ...GUARD, fl1: 1.55, fl2: 0, bl1: 0.9, bl2: -2.35 }),
  chk: pose({ torso: 0.05, ...GUARD, fl1: 2.05, fl2: 0, bl1: 0.9, bl2: -2.35 }),
  jkick: pose({ torso: -0.2, fl1: 1.5, fl2: -0.05, bl1: 0.6, bl2: -1.9, fa1: 0.8, fa2: 1.8, ba1: -0.5, ba2: 1.0 }),
  jpunch: pose({ torso: 0.4, fa1: 1.9, fa2: 0, ba1: 0.5, ba2: 1.6, ...TUCK_LEGS }),
  block: pose({ torso: -0.05, fa1: 1.15, fa2: 2.3, ba1: 0.95, ba2: 2.45 }),
  cblock: pose({ torso: 0.45, fa1: 1.2, fa2: 2.2, ba1: 1.0, ba2: 2.4, ...CROUCH_LEGS }),
  hitHigh: pose({ torso: -0.45, head: -0.3, fa1: -0.4, fa2: 0.8, ba1: -0.7, ba2: 0.6, fl1: 0.4, fl2: -0.2, bl1: -0.4, bl2: 0 }),
  hitLow: pose({ torso: 0.7, head: 0.3, fa1: 0.3, fa2: 0.6, ba1: 0, ba2: 0.6, fl1: 0.1, fl2: -0.4, bl1: -0.3, bl2: -0.2 }),
  air: pose({ torso: -0.5, head: -0.3, fa1: -1.5, fa2: 0.5, ba1: -2.0, ba2: 0.5, fl1: 0.8, fl2: -0.4, bl1: 0.3, bl2: -0.2 }),
  down: pose({ torso: 0, head: 0.1, fa1: 0.3, fa2: 0.2, ba1: -0.2, ba2: 0.2, fl1: 0.1, fl2: 0, bl1: -0.05, bl2: 0, rot: -Math.PI / 2, flat: true }),
  dizzy: pose({ torso: 0.3, head: 0.5, fa1: 0.1, fa2: 0.2, ba1: -0.1, ba2: 0.2 }),
  win: pose({ torso: -0.05, fa1: 2.9, fa2: 0.3, ba1: 0.2, ba2: 0.4, fl1: 0.25, fl2: -0.1, bl1: -0.25, bl2: 0 }),
  throw: pose({ torso: -0.35, fa1: 2.7, fa2: 0.5, ba1: 2.5, ba2: 0.5 }),
  fireball: pose({ torso: 0.25, fa1: 1.6, fa2: 0, ba1: 1.5, ba2: 0.1, fl1: 0.55, fl2: -0.3, bl1: -0.55, bl2: 0 }),
  flykick: pose({ torso: -0.3, fl1: 1.6, fl2: 0, bl1: 0.9, bl2: -2.0, fa1: 1.0, fa2: 1.5, ba1: -0.8, ba2: 0.4 }),
  flypunch: pose({ torso: 0.9, fa1: 2.0, fa2: 0, ba1: 1.9, ba2: 0.1, fl1: -0.3, fl2: -0.2, bl1: -0.5, bl2: -0.1 }),
  torpedo: pose({ torso: 0, fa1: Math.PI, fa2: 0, ba1: Math.PI - 0.15, ba2: 0, fl1: 0.05, fl2: 0, bl1: -0.05, bl2: 0, rot: Math.PI / 2 }),
  slide: pose({ torso: -0.9, fl1: 1.6, fl2: 0, bl1: 1.2, bl2: -2.3, fa1: -0.6, fa2: 0.3, ba1: -1.2, ba2: 0.3 }),
  tuck: pose({ torso: 0.9, fa1: 1.5, fa2: 2.0, ba1: 1.3, ba2: 2.1, ...TUCK_LEGS }),
  reach: pose({ torso: 0.3, fa1: 1.75, fa2: 0.1, ba1: 0.3, ba2: 2.2 }),
  breath: pose({ torso: 0.15, head: -0.15, fa1: 0.25, fa2: 0.3, ba1: 0.1, ba2: 0.3 }),
  kneel: pose({ torso: 0.2, head: 0.4, fa1: 0.1, fa2: 0.1, ba1: -0.1, ba2: 0.1, fl1: 1.45, fl2: -1.5, bl1: 0.2, bl2: -1.6 }),
};

// ---------------------------------------------------------------------------
// Normal moves. limb: fh = front hand, ff = front foot, hd = head, c = torso
// level: high (ducks under), mid, low (needs crouch block), overhead
// launch: [vx, vy] knockdown force
// ---------------------------------------------------------------------------
const MOVES = {
  LP: { name: 'LP', pose: 'jab', startup: 4, active: 4, recovery: 7, dmg: 4, limb: 'fh', level: 'high', hitstun: 14, push: 5 },
  HP: { name: 'HP', pose: 'punch', wind: 'punchWind', startup: 7, active: 4, recovery: 12, dmg: 7, limb: 'fh', level: 'high', hitstun: 18, push: 7, step: 1.5 },
  LK: { name: 'LK', pose: 'lowkick', startup: 6, active: 4, recovery: 11, dmg: 7, limb: 'ff', level: 'mid', hitstun: 16, push: 6 },
  HK: { name: 'HK', pose: 'highkick', wind: 'kickWind', startup: 8, active: 5, recovery: 15, dmg: 9, limb: 'ff', level: 'high', hitstun: 18, push: 8, step: 1 },
  RH: { name: 'RH', pose: 'roundhouse', wind: 'kickWind', startup: 11, active: 5, recovery: 20, dmg: 12, limb: 'ff', level: 'high', launch: [7, 7], heavy: true },
  SWEEP: { name: 'SWEEP', pose: 'sweep', wind: 'crouch', startup: 8, active: 6, recovery: 22, dmg: 9, limb: 'ff', level: 'low', launch: [2, 5], crouchBase: true },
  UPPER: { name: 'UPPER', pose: 'uppercut', wind: 'upperWind', startup: 7, active: 5, recovery: 26, dmg: 15, limb: 'fh', level: 'mid', launch: [5, 17], heavy: true, blood: 3, r: 26, step: 3 },
  CLP: { name: 'CLP', pose: 'cpunch', startup: 4, active: 4, recovery: 8, dmg: 4, limb: 'fh', level: 'mid', hitstun: 12, push: 4, crouchBase: true },
  CLK: { name: 'CLK', pose: 'clk', startup: 5, active: 4, recovery: 10, dmg: 5, limb: 'ff', level: 'low', hitstun: 13, push: 5, crouchBase: true },
  CHK: { name: 'CHK', pose: 'chk', startup: 7, active: 5, recovery: 16, dmg: 8, limb: 'ff', level: 'mid', hitstun: 18, push: 8, crouchBase: true },
  JK: { name: 'JK', pose: 'jkick', startup: 4, active: 99, recovery: 0, dmg: 9, limb: 'ff', level: 'overhead', air: true, launch: [4, 6] },
  JP: { name: 'JP', pose: 'jpunch', startup: 4, active: 99, recovery: 0, dmg: 8, limb: 'fh', level: 'overhead', air: true, hitstun: 20, push: 6 },
  TELEPUNCH: { name: 'TELEPUNCH', pose: 'punch', startup: 3, active: 5, recovery: 20, dmg: 10, limb: 'fh', level: 'high', launch: [8, 8], heavy: true },
};

const PROJ_MOVE = { name: 'PROJ', pose: 'fireball', startup: 11, active: 1, recovery: 24 };

const PROJECTILES = {
  spear: { kind: 'spear', speed: 15, dmg: 5, r: 14, effect: 'pull', range: 560, sfx: 'spear' },
  ice: { kind: 'ice', speed: 9, dmg: 4, r: 18, effect: 'freeze', sfx: 'ice' },
  acid: { kind: 'acid', speed: 11, dmg: 8, r: 15, sfx: 'spit' },
  orb: { kind: 'orb', speed: 5, dmg: 12, r: 26, launch: [6, 8], sfx: 'orb' },
  fire: { kind: 'fire', speed: 11, dmg: 9, r: 20, sfx: 'fire' },
  ring: { kind: 'ring', speed: 12, dmg: 8, r: 18, sfx: 'ring' },
  knife: { kind: 'knife', speed: 15, dmg: 8, r: 13, sfx: 'knife' },
  lightning: { kind: 'lightning', speed: 16, dmg: 10, r: 20, launch: [5, 7], sfx: 'zap' },
};

const DASHES = {
  slide: { name: 'SLIDE', pose: 'slide', startup: 5, active: 18, recovery: 16, speed: 10, airY: 0, dmg: 9, limb: 'ff', level: 'low', launch: [3, 6], dash: true },
  flykick: { name: 'FLYKICK', pose: 'flykick', startup: 6, active: 22, recovery: 16, speed: 13, airY: 70, dmg: 11, limb: 'ff', level: 'mid', launch: [7, 8], dash: true, heavy: true },
  flypunch: { name: 'FLYPUNCH', pose: 'flypunch', startup: 6, active: 20, recovery: 16, speed: 13, airY: 90, dmg: 10, limb: 'fh', level: 'mid', launch: [6, 8], dash: true },
  ball: { name: 'BALL', pose: 'tuck', startup: 6, active: 24, recovery: 14, speed: 12, airY: 25, dmg: 10, limb: 'c', level: 'mid', launch: [6, 9], dash: true, spin: 0.45, r: 34 },
  torpedo: { name: 'TORPEDO', pose: 'torpedo', startup: 6, active: 22, recovery: 16, speed: 15, airY: 110, dmg: 12, limb: 'hd', level: 'mid', launch: [9, 9], dash: true, heavy: true, r: 30 },
};

// ---------------------------------------------------------------------------
// Kombatants. seq: F=forward B=back U=up D=down (relative to facing).
// ---------------------------------------------------------------------------
const NINJA = (main, eyes) => ({
  style: 'ninja', thigh: main, shin: main, boot: '#141414', foot: '#101010', torso: main, belt: '#141414',
  upper: '#c48a64', fore: '#c48a64', bracer: '#141414', hand: '#1a1a1a', skin: '#c48a64',
  hood: '#151515', mask: main, eyes, detail: 'straps',
});

const CHARACTERS = [
  {
    id: 'scorch', name: 'SCORCH', pron: 'HIM',
    bio: 'A specter risen from the Netherrealm, burning for vengeance.',
    look: NINJA('#d9ad17', '#ffffff'),
    specials: [
      { name: 'Spear', seq: 'BB', btn: 'LP', type: 'proj', proj: 'spear' },
      { name: 'Teleport Punch', seq: 'DB', btn: 'HP', type: 'teleport', attack: true },
    ],
    fatalities: [{ name: 'Hellfire', seq: 'BBF', btn: 'HP', max: 600, type: 'burn', color: 'fire' }],
  },
  {
    id: 'frost', name: 'FROSTBANE', pron: 'HIM',
    bio: 'A cold-blooded assassin of the Lin Kuei clan.',
    look: NINJA('#2f6bd0', '#e8f6ff'),
    specials: [
      { name: 'Ice Blast', seq: 'DF', btn: 'LP', type: 'proj', proj: 'ice' },
      { name: 'Slide', seq: 'DB', btn: 'LK', type: 'dash', dash: 'slide' },
    ],
    fatalities: [
      { name: 'Spine Rip', seq: 'FDF', btn: 'HP', max: 140, type: 'headrip' },
      { name: 'Deep Freeze', seq: 'FFD', btn: 'HK', max: 320, type: 'shatter' },
    ],
  },
  {
    id: 'venom', name: 'VENOM', pron: 'HIM',
    bio: 'A reptilian stalker of a race thought extinct.',
    look: NINJA('#3c9a2a', '#f4ff5a'),
    specials: [
      { name: 'Acid Spit', seq: 'FF', btn: 'HP', type: 'proj', proj: 'acid' },
      { name: 'Force Ball', seq: 'BB', btn: 'HP', type: 'proj', proj: 'orb' },
    ],
    fatalities: [{ name: 'Acid Bath', seq: 'BFD', btn: 'LK', max: 400, type: 'melt' }],
  },
  {
    id: 'jinlo', name: 'JIN LO', pron: 'HIM',
    bio: 'A Shaolin monk chosen to defend Earthrealm.',
    look: {
      style: 'monk', thigh: '#171717', shin: '#171717', boot: '#0f0f0f', foot: '#0f0f0f', torso: '#cf9466', belt: '#c01818',
      upper: '#cf9466', fore: '#cf9466', bracer: '#e6ddcc', hand: '#cf9466', skin: '#cf9466', hair: '#0d0d0d', band: '#c01818', detail: 'abs',
    },
    specials: [
      { name: 'Dragon Fire', seq: 'FF', btn: 'HP', type: 'proj', proj: 'fire' },
      { name: 'Flying Kick', seq: 'FF', btn: 'HK', type: 'dash', dash: 'flykick' },
    ],
    fatalities: [{ name: "Dragon's Fury", seq: 'FDB', btn: 'HP', max: 150, type: 'explode' }],
  },
  {
    id: 'vexa', name: 'VEXA', pron: 'HER',
    bio: 'A special forces agent hunting a fugitive across realms.',
    look: {
      style: 'agent', thigh: '#56702e', shin: '#56702e', boot: '#1b1b14', foot: '#141410', torso: '#56702e', belt: '#2a2a1a',
      upper: '#e6b48e', fore: '#e6b48e', bracer: null, hand: '#e6b48e', skin: '#e6b48e', hair: '#ead27a', detail: 'top', female: true,
    },
    specials: [
      { name: 'Energy Rings', seq: 'DB', btn: 'LP', type: 'proj', proj: 'ring' },
      { name: 'Square Flight', seq: 'FB', btn: 'HP', type: 'dash', dash: 'flypunch' },
    ],
    fatalities: [{ name: 'Kiss of Death', seq: 'FFB', btn: 'LK', max: 600, type: 'burn', color: 'pink' }],
  },
  {
    id: 'krane', name: 'KRANE', pron: 'HIM',
    bio: 'A ruthless mercenary with a cybernetic eye.',
    look: {
      style: 'merc', thigh: '#3a3d44', shin: '#3a3d44', boot: '#121212', foot: '#0e0e0e', torso: '#c08860', belt: '#222222',
      upper: '#c08860', fore: '#c08860', bracer: '#1a1a1a', hand: '#1a1a1a', skin: '#c08860', vest: '#1c1c1c', plate: '#a8adb5', glow: '#ff2020', detail: 'vest',
    },
    specials: [
      { name: 'Blade Toss', seq: 'DB', btn: 'HP', type: 'proj', proj: 'knife' },
      { name: 'Cannonball', seq: 'BF', btn: 'LK', type: 'dash', dash: 'ball' },
    ],
    fatalities: [{ name: 'Heart Rip', seq: 'FDF', btn: 'LP', max: 140, type: 'heart' }],
  },
  {
    id: 'raizen', name: 'RAIZEN', pron: 'HIM',
    bio: 'The god of thunder, protector of Earthrealm.',
    look: {
      style: 'god', thigh: '#e4e0d4', shin: '#e4e0d4', boot: '#2a2440', foot: '#1a1630', torso: '#efebe0', belt: '#3050c0',
      upper: '#efebe0', fore: '#d6ae8e', bracer: '#3050c0', hand: '#d6ae8e', skin: '#d6ae8e', hat: '#c9a24a', hair: '#f2f2f2', eyes: '#bfe8ff', detail: 'robe', legW: 1.25,
    },
    specials: [
      { name: 'Lightning', seq: 'DF', btn: 'LP', type: 'proj', proj: 'lightning' },
      { name: 'Torpedo', seq: 'BF', btn: 'HK', type: 'dash', dash: 'torpedo' },
      { name: 'Teleport', seq: 'DU', btn: null, type: 'teleport', attack: false },
    ],
    fatalities: [{ name: 'Overcharge', seq: 'FBF', btn: 'HP', max: 350, type: 'shock' }],
  },
];

const BUTTON_NAMES = { LP: 'LP', HP: 'HP', LK: 'LK', HK: 'HK', BL: 'BLK' };
const ARROWS = { F: '→', B: '←', U: '↑', D: '↓' };
function seqText(seq, btn) {
  return seq.split('').map((c) => ARROWS[c]).join(' ') + (btn ? ' + ' + BUTTON_NAMES[btn] : '');
}
