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
  const pitchDecay = Number.parseFloat(
    document.getElementById("pitchDecay").value,
  );
  const gainDecay = Number.parseFloat(
    document.getElementById("gainDecay").value,
  );
  return { pitchDecay, gainDecay };
}

function playKick() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const { pitchDecay, gainDecay } = getKickTiming();

  const pitchT = Math.max(MIN_RAMP_S, pitchDecay);
  const gainT = Math.max(MIN_RAMP_S, gainDecay);

  const stopTime = now + Math.max(pitchDecay, gainDecay);

  const oscillator = ctx.createOscillator();
  oscillator.type = "sine";

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(1, now);

  oscillator.frequency.setValueAtTime(150, now);
  oscillator.frequency.exponentialRampToValueAtTime(45, now + pitchT);

  gainNode.gain.exponentialRampToValueAtTime(0.001, now + gainT);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

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

function bindKnob(rangeId, valueId, decimals = 2) {
  const input = document.getElementById(rangeId);
  const valueEl = document.getElementById(valueId);
  const update = () => {
    valueEl.textContent = Number.parseFloat(input.value).toFixed(decimals);
    syncNeedle(input);
  };
  input.addEventListener("input", update);
  update();
}

document.querySelectorAll("[data-knob]").forEach((field) => {
  attachRotaryKnob(field);
});

bindKnob("pitchDecay", "pitchDecayVal");
bindKnob("gainDecay", "gainDecayVal");

const kickBtn = document.getElementById("kickBtn");
kickBtn.addEventListener("click", onKickClick);
