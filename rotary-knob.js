/**
 * Rotary encoder UI bound to a native `<input type="range">`.
 *
 * ## DOM (required inside `field`)
 * - `.knob-range-input` — the range input (may be visually hidden for AT/keyboard)
 * - `.knob-dial` — dial surface receiving pointer events (drag left/right only;
 *   while the primary button is held, `pointermove` is tracked on `window` so the
 *   cursor can leave the dial)
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
 * @property {number} [pixelsPerFullRange=220] — horizontal drag (px) for one full min→max sweep
 */

/** Arc limits (radians, atan2 space) for needle position vs value. */
const KNOB_ANGLE_MIN = (-3 * Math.PI) / 4;
const KNOB_ANGLE_MAX = (3 * Math.PI) / 4;

const DEFAULT_PIXELS_PER_FULL_RANGE = 220;

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
 * Enables horizontal drag on the dial: value changes only from left/right pointer motion
 * (Y is ignored). Keeps the hidden range in sync.
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

  const pixelsPerFullRange =
    options.pixelsPerFullRange ?? DEFAULT_PIXELS_PER_FULL_RANGE;

  /** `-1` when not dragging */
  let dragPointerId = -1;
  /** @type {number | null} */
  let lastClientX = null;

  function teardownDrag() {
    if (dragPointerId === -1) {
      return;
    }
    const pid = dragPointerId;
    dragPointerId = -1;
    lastClientX = null;

    window.removeEventListener("pointermove", onWindowPointerMove, true);
    window.removeEventListener("pointerup", onWindowPointerUp, true);
    window.removeEventListener("pointercancel", onWindowPointerUp, true);

    try {
      dial.releasePointerCapture(pid);
    } catch {
      /* already released */
    }
  }

  function onWindowPointerMove(e) {
    if (dragPointerId === -1 || e.pointerId !== dragPointerId) {
      return;
    }
    if (lastClientX === null) {
      lastClientX = e.clientX;
      return;
    }

    const min = Number(input.min);
    const max = Number(input.max);
    const range = max - min;
    const deltaX = e.clientX - lastClientX;
    lastClientX = e.clientX;

    if (pixelsPerFullRange <= 0 || range === 0) {
      return;
    }

    // Drag right → higher value (clockwise on the dial).
    const deltaValue = (deltaX / pixelsPerFullRange) * range;
    setRangeValue(input, Number.parseFloat(input.value) + deltaValue);
  }

  function onWindowPointerUp(e) {
    if (dragPointerId === -1 || e.pointerId !== dragPointerId) {
      return;
    }
    teardownDrag();
  }

  function onLostPointerCapture(e) {
    if (dragPointerId !== -1 && e.pointerId === dragPointerId) {
      teardownDrag();
    }
  }

  function onPointerDown(e) {
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    input.focus({ preventScroll: true });

    if (dragPointerId !== -1) {
      teardownDrag();
    }

    dragPointerId = e.pointerId;
    lastClientX = e.clientX;

    try {
      dial.setPointerCapture(e.pointerId);
    } catch {
      /* still track via window listeners */
    }

    window.addEventListener("pointermove", onWindowPointerMove, true);
    window.addEventListener("pointerup", onWindowPointerUp, true);
    window.addEventListener("pointercancel", onWindowPointerUp, true);
  }

  dial.addEventListener("pointerdown", onPointerDown);
  dial.addEventListener("lostpointercapture", onLostPointerCapture);

  return function destroy() {
    teardownDrag();
    dial.removeEventListener("pointerdown", onPointerDown);
    dial.removeEventListener("lostpointercapture", onLostPointerCapture);
  };
}

globalThis.RotaryKnob = {
  attachRotaryKnob,
  syncNeedle,
};
})();
