'use strict';
// ---------- Звук: всё синтезируется на лету ----------
const SND = { ac: null, vol: 0.5, noise: null, last: {}, crackle: null, on: true };
function sndInit() {
  if (SND.ac) { if (SND.ac.state === 'suspended') SND.ac.resume(); return }
  try { SND.ac = new (window.AudioContext || window.webkitAudioContext)() } catch (e) { return }
  const ac = SND.ac, len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  SND.noise = buf; SND.master = ac.createGain(); SND.master.gain.value = SND.vol; SND.master.connect(ac.destination);
  // фоновый треск пожаров: громкость зависит от числа видимых очагов
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.7;
  const g = ac.createGain(); g.gain.value = 0; src.connect(bp); bp.connect(g); g.connect(SND.master); src.start();
  SND.crackle = g;
}
function sndNoise(t0, dur, type, freq, q, vol, out) {
  const ac = SND.ac, s = ac.createBufferSource(); s.buffer = SND.noise;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(out); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  return f;
}
function sndTone(t0, dur, type, f0, f1, vol, out) {
  const ac = SND.ac, o = ac.createOscillator(), g = ac.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
}
// x, y — клетка источника; дальние и невидимые звуки тише или не звучат
function play(k, x, y) {
  if (!SND.ac || !SND.on || SND.ac.state !== 'running') return;
  let vol = 1;
  if (x !== undefined && G) {
    const [sx, sy] = toScreen(x, y), d = Math.hypot(sx - W / 2, sy - H / 2) / Math.max(W, H);
    if (d > 0.9) return; vol = Math.max(0, 1 - d * 1.1);
    const me = G.players[G.me]; if (me && !G.over && !me.vis[tIdx(Math.floor(Math.max(0, Math.min(MAPN - 1, x))), Math.floor(Math.max(0, Math.min(MAPN - 1, y))))] && !['alarm', 'roar', 'ready'].includes(k)) return;
  }
  const now = SND.ac.currentTime; if (SND.last[k] && now - SND.last[k] < (k === 'hit' || k === 'chop' ? 0.06 : 0.12)) return; SND.last[k] = now;
  const out = SND.ac.createGain(); out.gain.value = vol; out.connect(SND.master); const t = now + 0.005;
  switch (k) {
    case 'hit': sndNoise(t, 0.09, 'bandpass', 1800 + Math.random() * 800, 3, 0.5, out); sndTone(t, 0.07, 'square', 900 + Math.random() * 400, 500, 0.06, out); break;
    case 'chop': sndNoise(t, 0.07, 'lowpass', 900, 1, 0.5, out); sndTone(t, 0.08, 'sine', 220, 150, 0.25, out); break;
    case 'bow': sndNoise(t, 0.16, 'highpass', 2500, 1, 0.22, out); break;
    case 'magic': sndTone(t, 0.35, 'sine', 380, 900, 0.18, out); sndTone(t, 0.35, 'triangle', 760, 1500, 0.06, out); break;
    case 'throw': sndNoise(t, 0.3, 'lowpass', 500, 1, 0.35, out); break;
    case 'boom': sndNoise(t, 0.6, 'lowpass', 280, 1, 0.9, out); sndTone(t, 0.4, 'sine', 90, 40, 0.4, out); break;
    case 'fire': case 'ignite': sndNoise(t, 0.6, 'bandpass', 900, 0.6, 0.5, out); sndNoise(t, 0.3, 'lowpass', 300, 1, 0.4, out); break;
    case 'collapse': sndNoise(t, 1.2, 'lowpass', 220, 1, 1, out); sndNoise(t + 0.15, 0.8, 'bandpass', 700, 1, 0.4, out); sndTone(t, 0.9, 'sine', 70, 35, 0.4, out); break;
    case 'roar': sndTone(t, 1.3, 'sawtooth', 120, 55, 0.25, out); sndNoise(t, 1.2, 'bandpass', 500, 0.8, 0.5, out); break;
    case 'thunder': sndNoise(t, 1.6, 'lowpass', 380, 1, 1, out); sndNoise(t, 0.15, 'highpass', 3000, 1, 0.6, out); break;
    case 'heal': sndTone(t, 0.6, 'sine', 660, 0, 0.15, out); sndTone(t + 0.1, 0.6, 'sine', 990, 0, 0.12, out); break;
    case 'rain': sndNoise(t, 2.5, 'highpass', 1800, 0.5, 0.35, out); break;
    case 'build': sndTone(t, 0.09, 'sine', 170 + Math.random() * 40, 120, 0.4, out); sndNoise(t, 0.05, 'bandpass', 1200, 2, 0.25, out); break;
    case 'splash': sndNoise(t, 0.25, 'bandpass', 2200, 1, 0.3, out); break;
    case 'ack': sndTone(t, 0.07, 'triangle', 520, 0, 0.08, out); break;
    case 'ready': sndTone(t, 0.12, 'triangle', 520, 0, 0.12, out); sndTone(t + 0.12, 0.16, 'triangle', 780, 0, 0.12, out); break;
    case 'done': sndTone(t, 0.12, 'triangle', 600, 0, 0.12, out); sndTone(t + 0.1, 0.12, 'triangle', 750, 0, 0.12, out); sndTone(t + 0.2, 0.2, 'triangle', 900, 0, 0.12, out); break;
    case 'alarm': { const f = sndNoise(t, 0.01, 'lowpass', 100, 1, 0.001, out); sndTone(t, 0.7, 'sawtooth', 196, 0, 0.12, out); sndTone(t + 0.25, 0.7, 'sawtooth', 247, 0, 0.12, out); break }
    case 'click': sndTone(t, 0.04, 'square', 900, 0, 0.04, out); break;
  }
}
function sndCrackle(n) { if (SND.crackle) SND.crackle.gain.setTargetAtTime(SND.on ? Math.min(0.35, n * 0.04) : 0, SND.ac.currentTime, 0.4) }
