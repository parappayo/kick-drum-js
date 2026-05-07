const { attachRotaryKnob, syncNeedle } = globalThis.RotaryKnob;

const MIN_RAMP_S = 0.001;

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

function playKick() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const { pitchStart, pitchDecay, gainDecay, drive } = getKickTiming();

  const pitchT = Math.max(MIN_RAMP_S, pitchDecay);
  const gainT = Math.max(MIN_RAMP_S, gainDecay);

  const stopTime = now + Math.max(pitchDecay, gainDecay);

  const endPitchHz = 45;

  const oscillator = ctx.createOscillator();
  oscillator.type = "sine";

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(1, now);

  const waveShaper = ctx.createWaveShaper();
  waveShaper.curve = makeDriveShaperCurve(drive);
  waveShaper.oversample = "4x";

  oscillator.frequency.setValueAtTime(pitchStart, now);
  oscillator.frequency.exponentialRampToValueAtTime(endPitchHz, now + pitchT);

  gainNode.gain.exponentialRampToValueAtTime(0.001, now + gainT);

  oscillator.connect(gainNode);
  gainNode.connect(waveShaper);
  waveShaper.connect(ctx.destination);

  oscillator.start(now);
  oscillator.stop(stopTime);
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
