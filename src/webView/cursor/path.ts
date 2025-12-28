type Pt = { x: number; y: number };

type HumanMoveOpts = {
  durationMs?: number; // total time
  hz?: number; // approx moves per second (30~120)
  jitterPx?: number; // micro shake
  curvePx?: number; // how "curvy" the path is
  overshootChance?: number; // chance to overshoot
  overshootMaxPx?: number; // max overshoot distance
  seed?: number; // optional deterministic
};

function mulberry32(seed: number) {
  return function () {
    // eslint-disable-next-line no-multi-assign,no-param-reassign
    let t = (seed += 0x6d2b79f5);
    // eslint-disable-next-line no-bitwise
    t = Math.imul(t ^ (t >>> 15), t | 1);
    // eslint-disable-next-line no-bitwise
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    // eslint-disable-next-line no-bitwise
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// ease that makes speed non-linear (slow start -> fast -> slow)
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// slight irregularity in timing (still monotonic)
function wobbleTime(t: number, r: () => number) {
  const w = (r() - 0.5) * 0.06; // +/- 0.03
  return clamp(t + w * (1 - Math.abs(2 * t - 1)), 0, 1);
}

function dist(a: Pt, b: Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

function norm(vx: number, vy: number) {
  const d = Math.hypot(vx, vy) || 1;
  return { x: vx / d, y: vy / d };
}

function perp(vx: number, vy: number) {
  return { x: -vy, y: vx };
}

function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

export function buildHumanCursorPath(
  from: Pt,
  to: Pt,
  opts: HumanMoveOpts = {},
) {
  const durationMs = opts.durationMs ?? 320;
  const hz = opts.hz ?? 75;
  const jitterPx = opts.jitterPx ?? 0.9;
  const curvePx = opts.curvePx ?? 40;
  const overshootChance = opts.overshootChance ?? 0.35;
  const overshootMaxPx = opts.overshootMaxPx ?? 28;

  const r = opts.seed != null ? mulberry32(opts.seed) : Math.random;

  const d = dist(from, to);
  // steps loosely tied to distance + hz
  const steps = Math.max(8, Math.round((durationMs / 1000) * hz + d / 60));

  // create a “curvy” cubic bezier between from -> to
  const vx = to.x - from.x;
  const vy = to.y - from.y;
  const n = norm(vx, vy);
  const p = perp(n.x, n.y);

  // control points offset perpendicular to direction
  const bend = clamp(d * 0.18, 10, curvePx) * (r() < 0.5 ? -1 : 1);
  const c1: Pt = {
    x: from.x + vx * 0.25 + p.x * bend,
    y: from.y + vy * 0.25 + p.y * bend,
  };
  const c2: Pt = {
    x: from.x + vx * 0.75 - p.x * bend * 0.6,
    y: from.y + vy * 0.75 - p.y * bend * 0.6,
  };

  // optional overshoot: add an intermediate target past "to", then come back
  const doOvershoot = r() < overshootChance && d > 40;
  let over: Pt | null = null;
  if (doOvershoot) {
    const overDist = clamp(d * (0.06 + r() * 0.06), 6, overshootMaxPx);
    // overshoot mostly along direction, tiny sideways error
    const side = (r() - 0.5) * overDist * 0.6;
    over = {
      x: to.x + n.x * overDist + p.x * side,
      y: to.y + n.y * overDist + p.y * side,
    };
  }

  const points: Pt[] = [];
  const times: number[] = [];

  // segment A: from -> (over or to)
  const endA = over ?? to;
  const totalA = doOvershoot ? Math.round(steps * 0.78) : steps;

  for (let i = 0; i < totalA; i++) {
    const t0 = i / (totalA - 1);
    // non-linear speed + slight time wobble
    const t = easeInOutCubic(wobbleTime(t0, r));
    const pt = bezier(from, c1, c2, endA, t);

    // micro jitter that fades near endpoints
    const fade = Math.sin(Math.PI * t0); // 0 at ends, 1 mid
    const jx = (r() - 0.5) * 2 * jitterPx * fade;
    const jy = (r() - 0.5) * 2 * jitterPx * fade;

    points.push({ x: pt.x + jx, y: pt.y + jy });
    times.push(Math.round(durationMs * (i / (steps - 1))));
  }

  // segment B: over -> to (correction), faster + a tiny “snap back”
  if (doOvershoot && over) {
    const stepsB = Math.max(5, steps - totalA);
    const startIdx = times[times.length - 1] ?? 0;
    const remain = Math.max(60, Math.round(durationMs * 0.22));

    // make a short correction curve
    const backVx = to.x - over.x;
    const backVy = to.y - over.y;
    const nn = norm(backVx, backVy);
    const pp = perp(nn.x, nn.y);
    const bend2 = clamp(dist(over, to) * 0.25, 6, 18) * (r() < 0.5 ? -1 : 1);

    const b1: Pt = {
      x: over.x + backVx * 0.35 + pp.x * bend2,
      y: over.y + backVy * 0.35 + pp.y * bend2,
    };
    const b2: Pt = {
      x: over.x + backVx * 0.75 - pp.x * bend2 * 0.5,
      y: over.y + backVy * 0.75 - pp.y * bend2 * 0.5,
    };

    for (let i = 1; i < stepsB; i++) {
      const t0 = i / (stepsB - 1);
      // correction often looks “snappier”: easeOut-ish
      const t = 1 - (1 - t0) ** 3;
      const pt = bezier(over, b1, b2, to, t);

      const fade = Math.sin(Math.PI * (1 - t0)); // jitter fades as it lands
      const jx = (r() - 0.5) * 2 * (jitterPx * 0.6) * fade;
      const jy = (r() - 0.5) * 2 * (jitterPx * 0.6) * fade;

      points.push({ x: pt.x + jx, y: pt.y + jy });
      times.push(startIdx + Math.round(remain * t0));
    }
  }

  // finalize: integer pixels
  const finalPoints = points.map((pt) => ({
    x: Math.round(pt.x),
    y: Math.round(pt.y),
  }));
  const finalTimes = times.map((t) => Math.max(0, t));

  return { points: finalPoints, timesMs: finalTimes };
}
