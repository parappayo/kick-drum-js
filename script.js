const MIN_RAMP_S = 0.001;

/** Arc limits (radians, atan2 space): ~7:30 → ~4:30 around the top. */
const KNOB_ANGLE_MIN = (-3 * Math.PI) / 4;
const KNOB_ANGLE_MAX = (3 * Math.PI) / 4;

let audioContext;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new window.AudioContext();
  }
  return audioContext;
}

function clamp(n, lo, hi) {
  return Math.min(Math.max(n, lo), hi);
}

function setRangeValue(input, raw) {
  const min = Number(input.min);
  const max = Number(input.max);
  const step = Number(input.step);
  const stepSafe = Number.isFinite(step) && step > 0 ? step : null;

  let v = clamp(raw, min, max);

  if (stepSafe) {
    const snapped = Math.round(v / stepSafe) * stepSafe;
    const decimals = (String(stepSafe).split(".")[1] || "").length;
    v = decimals > 0 ? Number(snapped.toFixed(decimals)) : snapped;
  }

  input.value = String(v);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function valueToNeedleDegrees(value, min, max) {
  const span = max - min;
  const t = span === 0 ? 0 : (Number(value) - min) / span;
  const pointerRad =
    KNOB_ANGLE_MIN + clamp(t, 0, 1) * (KNOB_ANGLE_MAX - KNOB_ANGLE_MIN);
  return ((pointerRad + Math.PI / 2) * 180) / Math.PI;
}

/** One full cursor orbit (2π rad) spans the whole min→max range. */
const RELATIVE_TURN_RADIANS = 2 * Math.PI;

function syncNeedle(input) {
  const field = input.closest("[data-knob]");
  const needle = field?.querySelector(".knob-needle");
  if (!needle) {
    return;
  }
  const min = Number(input.min);
  const max = Number(input.max);
  const deg = valueToNeedleDegrees(Number(input.value), min, max);
  needle.setAttribute("transform", `rotate(${deg} 32 32)`);
}

/**
 * @param {HTMLElement} field
 */
function attachRotaryKnob(field) {
  const input = field.querySelector(".knob-range-input");
  const dial = field.querySelector(".knob-dial");
  if (!input || !dial) {
    return;
  }

  const innerDeadPx = 5;
  /** @type {number} */
  let lastAngle;

  function centerOfDial() {
    const r = dial.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }

  function pointerAngleAndDist(e) {
    const { cx, cy } = centerOfDial();
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    return {
      angle: Math.atan2(dy, dx),
      dist: Math.hypot(dx, dy),
    };
  }

  function onPointerMove(e) {
    const min = Number(input.min);
    const max = Number(input.max);
    const range = max - min;
    const { angle, dist } = pointerAngleAndDist(e);

    if (dist < innerDeadPx) {
      lastAngle = Number.NaN;
      return;
    }

    if (Number.isNaN(lastAngle)) {
      lastAngle = angle;
      return;
    }

    let deltaAngle = angle - lastAngle;
    if (deltaAngle > Math.PI) {
      deltaAngle -= 2 * Math.PI;
    }
    if (deltaAngle < -Math.PI) {
      deltaAngle += 2 * Math.PI;
    }
    lastAngle = angle;

    const deltaValue = (deltaAngle / RELATIVE_TURN_RADIANS) * range;
    setRangeValue(input, Number.parseFloat(input.value) + deltaValue);
  }

  function onPointerDown(e) {
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    input.focus({ preventScroll: true });
    dial.setPointerCapture(e.pointerId);

    const { angle, dist } = pointerAngleAndDist(e);
    lastAngle = dist < innerDeadPx ? Number.NaN : angle;

    dial.addEventListener("pointermove", onPointerMove);
  }

  function onPointerUp(e) {
    dial.removeEventListener("pointermove", onPointerMove);
    try {
      dial.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  dial.addEventListener("pointerdown", onPointerDown);
  dial.addEventListener("pointerup", onPointerUp);
  dial.addEventListener("pointercancel", onPointerUp);
  dial.addEventListener("lostpointercapture", () => {
    dial.removeEventListener("pointermove", onPointerMove);
  });
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

document.querySelectorAll("[data-knob]").forEach(attachRotaryKnob);

bindKnob("pitchDecay", "pitchDecayVal");
bindKnob("gainDecay", "gainDecayVal");

const kickBtn = document.getElementById("kickBtn");
kickBtn.addEventListener("click", onKickClick);
