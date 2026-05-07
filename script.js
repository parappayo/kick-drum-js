const { attachRotaryKnob, syncNeedle } = globalThis.RotaryKnob;

const MIN_RAMP_S = 0.001;
const END_PITCH_HZ = 45;

let audioContext;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new window.AudioContext();
  }
  return audioContext;
}

function getKickTiming() {
  const pitchStart = Number.parseFloat(
    document.getElementById("pitchStart").value,
  );
  const pitchDecay = Number.parseFloat(
    document.getElementById("pitchDecay").value,
  );
  const gainDecay = Number.parseFloat(
    document.getElementById("gainDecay").value,
  );
  const drive = Number.parseFloat(document.getElementById("drive").value);
  return { pitchStart, pitchDecay, gainDecay, drive };
}

/** @param {number} amount 0 (clean) … 1 (heavy) */
function makeDriveShaperCurve(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  const a = clamp(amount, 0, 1);
  const k = 1 + a * 10;
  const peak = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    const distorted = peak > 1e-6 ? Math.tanh(k * x) / peak : x;
    curve[i] = (1 - a) * x + a * distorted;
  }
  return curve;
}

function clamp(n, lo, hi) {
  return Math.min(Math.max(n, lo), hi);
}

/**
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} destination
 * @param {number} now
 * @param {{ pitchStart: number, pitchDecay: number, gainDecay: number, drive: number }} timing
 */
function scheduleKick(ctx, destination, now, timing) {
  const { pitchStart, pitchDecay, gainDecay, drive } = timing;

  const pitchT = Math.max(MIN_RAMP_S, pitchDecay);
  const gainT = Math.max(MIN_RAMP_S, gainDecay);

  const stopTime = now + Math.max(pitchDecay, gainDecay);

  const oscillator = ctx.createOscillator();
  oscillator.type = "sine";

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(1, now);

  const waveShaper = ctx.createWaveShaper();
  waveShaper.curve = makeDriveShaperCurve(drive);
  waveShaper.oversample = "4x";

  oscillator.frequency.setValueAtTime(pitchStart, now);
  oscillator.frequency.exponentialRampToValueAtTime(END_PITCH_HZ, now + pitchT);

  gainNode.gain.exponentialRampToValueAtTime(0.001, now + gainT);

  oscillator.connect(gainNode);
  gainNode.connect(waveShaper);
  waveShaper.connect(destination);

  oscillator.start(now);
  oscillator.stop(stopTime);
}

function playKick() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  scheduleKick(ctx, ctx.destination, now, getKickTiming());
}

function writeAscii(dv, offset, s) {
  for (let i = 0; i < s.length; i++) {
    dv.setUint8(offset + i, s.charCodeAt(i));
  }
}

function floatChannelTo16BitPcm(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const x = Math.max(-1, Math.min(1, float32[i]));
    out[i] = x < 0 ? Math.round(x * 0x8000) : Math.round(x * 0x7fff);
  }
  return out;
}

/** Mono 16-bit PCM WAV. */
function encodeWavMono16(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate;
  const pcm = floatChannelTo16BitPcm(audioBuffer.getChannelData(0));
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(buffer);

  writeAscii(dv, 0, "RIFF");
  dv.setUint32(4, 36 + dataBytes, true);
  writeAscii(dv, 8, "WAVE");
  writeAscii(dv, 12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  writeAscii(dv, 36, "data");
  dv.setUint32(40, dataBytes, true);

  for (let i = 0; i < pcm.length; i++) {
    dv.setInt16(44 + i * 2, pcm[i], true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportKickWav() {
  const timing = getKickTiming();
  const durationSec = Math.max(timing.pitchDecay, timing.gainDecay);
  const ctxLive = getAudioContext();
  const sampleRate = ctxLive.sampleRate;
  const length = Math.ceil(sampleRate * durationSec) + 8;
  const offline = new OfflineAudioContext(1, length, sampleRate);
  scheduleKick(offline, offline.destination, 0, timing);
  const rendered = await offline.startRendering();
  const wav = encodeWavMono16(rendered);
  downloadBlob(wav, "kick.wav");
}

async function onKickClick() {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  playKick();
}

function bindKnobInput(rangeId) {
  const input = document.getElementById(rangeId);
  const update = () => {
    syncNeedle(input);
  };
  input.addEventListener("input", update);
  update();
}

document.querySelectorAll("[data-knob]").forEach((field) => {
  attachRotaryKnob(field);
});

bindKnobInput("pitchStart");
bindKnobInput("pitchDecay");
bindKnobInput("gainDecay");
bindKnobInput("drive");

const kickBtn = document.getElementById("kickBtn");
kickBtn.addEventListener("click", onKickClick);

const exportWavBtn = document.getElementById("exportWavBtn");
exportWavBtn.addEventListener("click", () => {
  exportKickWav().catch((err) => {
    console.error(err);
  });
});
