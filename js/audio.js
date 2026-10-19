'use strict';
// All sound is synthesized with WebAudio, so the game ships with no assets.
const SFX = (() => {
  let ctx = null, master = null, musicGain = null, noiseBuf = null;
  let musicOn = true, musicTimer = null, nextNote = 0, step = 0;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = musicOn ? 0.22 : 0; musicGain.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      startMusic();
    } catch (e) { ctx = null; }
  }

  function noise(dur, freq, q, gain, type = 'bandpass', out = master, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  function tone(f0, f1, dur, type, gain, out = master, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
  }

  // --- announcer (browser speech synthesis, deep & slow) ---
  let voice = null;
  function pickVoice() {
    if (!window.speechSynthesis) return;
    const vs = speechSynthesis.getVoices();
    voice = vs.find((v) => /en/i.test(v.lang) && /male|daniel|fred|alex|david|george/i.test(v.name)) || vs.find((v) => /en/i.test(v.lang)) || null;
  }
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function say(text, pitch = 0.3) {
    if (!window.speechSynthesis || !ctx) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.pitch = pitch; u.rate = 0.82; u.volume = 1;
      speechSynthesis.speak(u);
    } catch (e) { /* speech is optional */ }
  }

  // --- music: brooding taiko + bass loop in A minor ---
  const BASS = [55, 0, 0, 55, 0, 0, 65.4, 0, 55, 0, 0, 49, 0, 41.2, 0, 0, 55, 0, 0, 55, 0, 0, 73.4, 0, 65.4, 0, 0, 61.7, 0, 49, 0, 0];
  function startMusic() {
    if (!ctx || musicTimer) return;
    nextNote = ctx.currentTime + 0.1;
    musicTimer = setInterval(scheduler, 30);
  }
  function scheduler() {
    const spb = 60 / 96 / 4; // 16th notes at 96 bpm
    while (nextNote < ctx.currentTime + 0.15) {
      const s = step % 32, when = nextNote - ctx.currentTime;
      if (s % 8 === 0 || s === 11 || s === 27) { tone(110, 38, 0.35, 'sine', 0.9, musicGain, when); noise(0.12, 180, 1, 0.4, 'lowpass', musicGain, when); }
      if (s === 4 || s === 12 || s === 20 || s === 30) tone(220, 90, 0.18, 'triangle', 0.5, musicGain, when);
      if (s % 2 === 0) noise(0.04, 7000, 1, 0.08, 'highpass', musicGain, when);
      if (BASS[s]) tone(BASS[s] * 2, BASS[s] * 2 * 0.98, 0.32, 'sawtooth', 0.22, musicGain, when);
      if (step % 128 === 0) { tone(110, 100, 3.5, 'sine', 0.35, musicGain, when); tone(166, 160, 3.0, 'sine', 0.2, musicGain, when); noise(2.5, 900, 0.5, 0.15, 'bandpass', musicGain, when); }
      if (s === 0) { tone(440, 440, 0.9, 'triangle', 0.05, musicGain, when); tone(523, 523, 0.9, 'triangle', 0.04, musicGain, when + 0.6); }
      nextNote += spb; step++;
    }
  }
  function toggleMusic() {
    musicOn = !musicOn;
    if (musicGain) musicGain.gain.value = musicOn ? 0.22 : 0;
    return musicOn;
  }

  return {
    init, say, toggleMusic,
    get musicOn() { return musicOn; },
    hit(heavy) { noise(heavy ? 0.22 : 0.12, heavy ? 500 : 900, 0.8, heavy ? 1 : 0.7, 'lowpass'); tone(heavy ? 140 : 200, 45, heavy ? 0.22 : 0.12, 'sine', 0.9); },
    block() { tone(1300, 800, 0.07, 'square', 0.12); noise(0.06, 3500, 2, 0.3); },
    whoosh() { noise(0.13, 1400, 0.6, 0.18); },
    jump() { noise(0.08, 600, 0.7, 0.12); },
    land() { tone(90, 40, 0.12, 'sine', 0.5); noise(0.08, 300, 1, 0.25, 'lowpass'); },
    thud() { tone(70, 30, 0.3, 'sine', 1); noise(0.25, 250, 0.7, 0.6, 'lowpass'); },
    fire() { noise(0.5, 700, 0.4, 0.5); tone(160, 60, 0.4, 'sawtooth', 0.15); },
    ice() { tone(1800, 2400, 0.25, 'sine', 0.2); noise(0.3, 6000, 3, 0.2); },
    spear() { noise(0.15, 2000, 1, 0.3); tone(600, 200, 0.2, 'square', 0.08); },
    spit() { noise(0.2, 1200, 2, 0.4); },
    orb() { tone(80, 160, 0.6, 'sawtooth', 0.2); },
    ring() { tone(900, 1400, 0.2, 'sine', 0.2); tone(700, 1200, 0.2, 'sine', 0.15, master, 0.07); },
    knife() { noise(0.12, 3000, 2, 0.35); },
    zap() { noise(0.35, 4000, 0.5, 0.5, 'highpass'); tone(120, 60, 0.35, 'sawtooth', 0.3); },
    teleport() { tone(200, 1200, 0.25, 'sine', 0.25); noise(0.3, 900, 0.5, 0.3); },
    explode() { noise(0.9, 400, 0.5, 1, 'lowpass'); tone(80, 25, 0.8, 'sine', 1); },
    shatter() { for (let i = 0; i < 6; i++) tone(rnd(2000, 4000), rnd(800, 1500), 0.3, 'triangle', 0.12, master, i * 0.03); noise(0.4, 5000, 1, 0.5, 'highpass'); },
    splat() { noise(0.25, 400, 1.5, 0.6, 'lowpass'); },
    scream() { tone(700, 180, 1.1, 'sawtooth', 0.12); tone(720, 190, 1.1, 'square', 0.05); },
    gong() { tone(98, 90, 2.5, 'sine', 0.6); tone(147, 140, 2.0, 'sine', 0.3); noise(1.5, 800, 0.4, 0.2); },
    select() { tone(500, 700, 0.06, 'square', 0.12); },
    confirm() { tone(300, 600, 0.15, 'square', 0.15); tone(150, 80, 0.3, 'sine', 0.5); },
  };
})();
