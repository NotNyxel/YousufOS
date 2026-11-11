// Ambient sound for the living room. Everything except the Qur'an option is
// generated live with the Web Audio API: no audio files, no licences, and it
// never repeats exactly.
export const AMBIENT = [
  { id: "off", label: "Off" },
  { id: "calm", label: "Calm ambient music" },
  { id: "rain", label: "Gentle rain" },
  { id: "ocean", label: "Ocean waves" },
  { id: "wind", label: "Desert wind" },
  { id: "night", label: "Desert night (crickets)" },
  { id: "quran", label: "Qur'an · Mishary Alafasy (online)" },
  { id: "quran-sudais", label: "Qur'an · Abdul Rahman Al-Sudais (online)" },
];

const RECITERS = { quran: "mishaari_raashid_al_3afaasee", "quran-sudais": "abdurrahmaan_as-sudays" };
const SURAHS = [1, 36, 55, 56, 67, 18, 19, 12, 25, 31, 50, 78, 87, 93, 94];

let ctx = null;
let master = null;
let stopFns = [];
let audioEl = null;
let current = null;
let volume = 0.35;

const gainFor = (v) => Math.pow(v, 2) * 0.9;

function noise(kind, seconds = 6) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown") {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else if (kind === "pink") {
        b0 = 0.99765 * b0 + w * 0.099;
        b1 = 0.963 * b1 + w * 0.2965;
        b2 = 0.57 * b2 + w * 1.0526;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
      } else d[i] = w * 0.5;
    }
  }
  return buf;
}

function loop(buf) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.start();
  stopFns.push(() => s.stop());
  return s;
}

function lfo(freq, depth, target, offset = 0) {
  const o = ctx.createOscillator();
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(target);
  if (offset) target.value = offset;
  o.start();
  stopFns.push(() => o.stop());
}

function reverb(seconds = 4.5) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const c = ctx.createConvolver();
  c.buffer = buf;
  return c;
}

function every(minMs, maxMs, fn) {
  let id;
  const tick = () => {
    fn();
    id = setTimeout(tick, minMs + Math.random() * (maxMs - minMs));
  };
  id = setTimeout(tick, minMs);
  stopFns.push(() => clearTimeout(id));
}

const SCENES = {
  rain() {
    const bed = loop(noise("brown"));
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const g1 = ctx.createGain();
    g1.gain.value = 0.55;
    bed.connect(lp).connect(g1).connect(master);
    const hiss = loop(noise("white"));
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3200;
    bp.Q.value = 0.6;
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;
    hiss.connect(bp).connect(g2).connect(master);
    const drop = noise("white", 0.2);
    every(25, 140, () => {
      const s = ctx.createBufferSource();
      s.buffer = drop;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1800 + Math.random() * 4000;
      f.Q.value = 3;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.12, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      const p = ctx.createStereoPanner();
      p.pan.value = Math.random() * 2 - 1;
      s.connect(f).connect(g).connect(p).connect(master);
      s.start(t, Math.random() * 0.1, 0.06);
    });
  },
  ocean() {
    const src = loop(noise("brown", 8));
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    const g = ctx.createGain();
    src.connect(lp).connect(g).connect(master);
    lfo(0.085, 650, lp.frequency, 850);
    lfo(0.085, 0.38, g.gain, 0.6);
    const foam = loop(noise("white"));
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2500;
    const fg = ctx.createGain();
    foam.connect(hp).connect(fg).connect(master);
    lfo(0.085, 0.05, fg.gain, 0.055);
  },
  wind() {
    const src = loop(noise("pink", 8));
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    src.connect(bp).connect(g).connect(master);
    lfo(0.05, 260, bp.frequency, 560);
    lfo(0.13, 120, bp.frequency);
    lfo(0.07, 0.35, g.gain, 0.65);
    const high = loop(noise("white"));
    const bp2 = ctx.createBiquadFilter();
    bp2.type = "bandpass";
    bp2.Q.value = 6;
    const g2 = ctx.createGain();
    g2.gain.value = 0.02;
    high.connect(bp2).connect(g2).connect(master);
    lfo(0.03, 400, bp2.frequency, 1400);
  },
  night() {
    const bed = loop(noise("brown"));
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    bed.connect(lp).connect(g).connect(master);
    const crickets = [
      { f: 4300, pan: -0.6, gap: [700, 1400] },
      { f: 4650, pan: 0.5, gap: [900, 1800] },
      { f: 3900, pan: 0.1, gap: [1500, 3200] },
    ];
    for (const c of crickets) {
      every(c.gap[0], c.gap[1], () => {
        const t0 = ctx.currentTime;
        const o = ctx.createOscillator();
        o.frequency.value = c.f + Math.random() * 60;
        const gg = ctx.createGain();
        gg.gain.value = 0;
        for (let i = 0; i < 3; i++) {
          const t = t0 + i * 0.07;
          gg.gain.setValueAtTime(0, t);
          gg.gain.linearRampToValueAtTime(0.025, t + 0.012);
          gg.gain.linearRampToValueAtTime(0, t + 0.045);
        }
        const p = ctx.createStereoPanner();
        p.pan.value = c.pan;
        o.connect(gg).connect(p).connect(master);
        o.start(t0);
        o.stop(t0 + 0.3);
      });
    }
  },
  calm() {
    const rev = reverb(5);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    rev.connect(wet).connect(master);
    const dry = ctx.createGain();
    dry.gain.value = 0.45;
    dry.connect(master);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    lp.connect(dry);
    lp.connect(rev);
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // Dmaj9 - Bm9 - Gmaj7 - Asus2, slow and warm
    const chords = [
      [50, 57, 62, 66, 69, 76],
      [47, 54, 62, 66, 69, 73],
      [43, 50, 59, 62, 66, 71],
      [45, 52, 57, 59, 64, 71],
    ];
    let step = 0;
    const playChord = () => {
      const t = ctx.currentTime;
      for (const m of chords[step % chords.length]) {
        for (const det of [-5, 5]) {
          const o = ctx.createOscillator();
          o.type = m < 55 ? "sine" : "triangle";
          o.frequency.value = hz(m);
          o.detune.value = det;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(m < 55 ? 0.05 : 0.022, t + 3.5);
          g.gain.setValueAtTime(m < 55 ? 0.05 : 0.022, t + 9);
          g.gain.linearRampToValueAtTime(0, t + 14);
          o.connect(g).connect(lp);
          o.start(t);
          o.stop(t + 14.2);
        }
      }
      step++;
    };
    playChord();
    every(10000, 10000, playChord);
    const bells = [74, 76, 78, 81, 83, 86];
    every(3500, 9000, () => {
      const t = ctx.currentTime;
      const m = bells[Math.floor(Math.random() * bells.length)];
      for (const [mult, amp] of [[1, 0.035], [2.76, 0.008]]) {
        const o = ctx.createOscillator();
        o.frequency.value = hz(m) * mult;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(amp, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
        o.connect(g).connect(rev);
        o.connect(g).connect(dry);
        o.start(t);
        o.stop(t + 4.2);
      }
    });
  },
};

function startQuran(id) {
  const reciter = RECITERS[id];
  let i = Math.floor(Math.random() * SURAHS.length);
  audioEl = new Audio();
  audioEl.volume = Math.min(1, volume * 1.1);
  const next = () => {
    const n = String(SURAHS[i++ % SURAHS.length]).padStart(3, "0");
    audioEl.src = `https://download.quranicaudio.com/quran/${reciter}/${n}.mp3`;
    audioEl.play().catch(() => {});
  };
  audioEl.onended = next;
  audioEl.onerror = () => setTimeout(next, 5000);
  next();
}

export function startAmbient(id, vol) {
  volume = vol;
  if (current === id) return setAmbientVolume(vol);
  stopAmbient();
  current = id;
  if (!id || id === "off") return;
  if (id.startsWith("quran")) return startQuran(id);
  if (!SCENES[id]) return;
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume?.();
  master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(gainFor(vol), ctx.currentTime + 3);
  master.connect(ctx.destination);
  SCENES[id]();
}

export function setAmbientVolume(vol) {
  volume = vol;
  if (master && ctx) master.gain.setTargetAtTime(gainFor(vol), ctx.currentTime, 0.4);
  if (audioEl) audioEl.volume = Math.min(1, vol * 1.1);
}

export function stopAmbient() {
  current = null;
  if (audioEl) {
    audioEl.onended = null;
    audioEl.onerror = null;
    audioEl.pause();
    audioEl = null;
  }
  if (master && ctx) {
    const m = master;
    const fns = stopFns;
    m.gain.setTargetAtTime(0, ctx.currentTime, 0.35);
    setTimeout(() => {
      fns.forEach((f) => {
        try {
          f();
        } catch {
          /* already stopped */
        }
      });
      m.disconnect();
    }, 1500);
  }
  master = null;
  stopFns = [];
}
