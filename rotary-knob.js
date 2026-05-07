/**
 * Rotary encoder UI bound to a native `<input type="range">`.
 *
 * ## DOM (required inside `field`)
 * - `.knob-range-input` — the range input (may be visually hidden for AT/keyboard)
 * - `.knob-dial` — dial surface receiving pointer events
 * - `.knob-needle` — `<g>` or element updated with `transform="rotate(deg cx cy)"`;
 *   needle graphics assume a 64×64 viewBox with center at (32, 32).
 *
 * ## Optional
 * - `[data-knob]` on `field` — used by {@link syncNeedle} to find `.knob-needle`
 *
 * Loaded as a classic script: API is exposed on {@link globalThis.RotaryKnob}.
 * Implementation is wrapped in an IIFE so top-level `function` names do not become
 * globals and collide with `const { attachRotaryKnob } = RotaryKnob` in app scripts.
 */

(function () {
"use strict";

/** @typedef {object} RotaryKnobOptions
 * @property {number} [innerDeadPx=5] — ignore angle inside this radius (px) from dial center
 * @property {number} [turnRadians=Math.PI*2] — cursor travel (rad) for one full min→max sweep
 */

/** Arc limits (radians, atan2 space) for needle position vs value. */
const KNOB_ANGLE_MIN = (-3 * Math.PI) / 4;
const KNOB_ANGLE_MAX = (3 * Math.PI) / 4;

const DEFAULT_TURN_RADIANS = 2 * Math.PI;
const DEFAULT_INNER_DEAD_PX = 5;

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

/**
 * Updates the dial needle angle from the range input’s current `value`.
 * `input` must lie inside a subtree that matches `input.closest("[data-knob]")`
 * and contains `.knob-needle`.
 *
 * @param {HTMLInputElement} input
 */
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
 * Enables relative (drag) control on the dial and keeps the hidden range in sync.
 *
 * @param {HTMLElement} field — root element containing `.knob-range-input` and `.knob-dial`
 * @param {RotaryKnobOptions} [options]
 * @returns {() => void} `destroy` — remove pointer listeners (e.g. hot-swap / tests)
 */
function attachRotaryKnob(field, options = {}) {
  const input = field.querySelector(".knob-range-input");
  const dial = field.querySelector(".knob-dial");
  if (!input || !dial) {
    return () => {};
  }

  const innerDeadPx =
    options.innerDeadPx ?? DEFAULT_INNER_DEAD_PX;
  const turnRadians = options.turnRadians ?? DEFAULT_TURN_RADIANS;

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

    const deltaValue = (deltaAngle / turnRadians) * range;
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

  function onLostPointerCapture() {
    dial.removeEventListener("pointermove", onPointerMove);
  }

  dial.addEventListener("pointerdown", onPointerDown);
  dial.addEventListener("pointerup", onPointerUp);
  dial.addEventListener("pointercancel", onPointerUp);
  dial.addEventListener("lostpointercapture", onLostPointerCapture);

  return function destroy() {
    dial.removeEventListener("pointerdown", onPointerDown);
    dial.removeEventListener("pointerup", onPointerUp);
    dial.removeEventListener("pointercancel", onPointerUp);
    dial.removeEventListener("lostpointercapture", onLostPointerCapture);
    dial.removeEventListener("pointermove", onPointerMove);
  };
}

globalThis.RotaryKnob = {
  attachRotaryKnob,
  syncNeedle,
};
})();
