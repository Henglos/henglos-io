// The path a wire is drawn along. Without waypoints, the usual bezier from an
// output (leaving right) to an input (coming in from the left). With them, a
// smooth curve through every waypoint, in order — a centripetal Catmull-Rom
// spline drawn as cubic beziers, which never loops or overshoots however close
// or sharp the points are — still leaving and entering horizontally.
// A waypoint with a `handle` sets its own curve: the bezier control on its way
// out, relative to it — the one on its way in mirrors it (a smooth point, as in
// a vector editor). Without one, the curve through it is worked out.
// A wire going back to a node behind (a loop) with no waypoints of its own goes
// round below both nodes on its own — see loopWaypoints.

export type WirePoint = { x: number; y: number };

/** A point the wire goes through — and, optionally, its control handle. */
export type WireWaypoint = WirePoint & { handle?: WirePoint };

/** A waypoint's two bezier controls, on the canvas: before it (in) and after it (out). */
export type WireHandles = { in: WirePoint; out: WirePoint; custom: boolean };

/** A node's box on the canvas. */
export type WireBox = { x: number; y: number; width: number; height: number };

/** A wire as drawn: its SVG path, and where its middle is. */
export type WirePathResult = {
	/** The SVG path. */
	path: string;
	/** Where the wire's middle is — for the "+" that inserts an action there. Never on a waypoint. */
	labelX: number;
	labelY: number;
};

const dist = (a: WirePoint, b: WirePoint) => Math.hypot(b.x - a.x, b.y - a.y);

// How far a wire runs straight out of an output (and into an input) before it
// bends — like React Flow's bezier: more when the next point is far, never none.
const lead = (a: WirePoint, b: WirePoint) => Math.max(40, Math.min(160, dist(a, b) * 0.5));

// Point at t on the cubic bezier p0 → p3 with controls c1, c2.
const cubicAt = (p0: WirePoint, c1: WirePoint, c2: WirePoint, p3: WirePoint, t: number): WirePoint => {
	const u = 1 - t;
	return {
		x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
		y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
	};
};

// Centripetal Catmull-Rom (alpha ½) as bezier controls: the one leaving `p1`
// towards `p2` (p0 before it), and the one arriving at `p2` from `p1` (p3
// after it). Coincident points fall back to the point itself.
const ALPHA = 0.5;
const knot = (a: WirePoint, b: WirePoint) => Math.pow(dist(a, b), ALPHA);

function controlOut(p0: WirePoint, p1: WirePoint, p2: WirePoint): WirePoint {
	const d1 = knot(p0, p1);
	const d2 = knot(p1, p2);
	if (d1 < 1e-6 || d2 < 1e-6) return p1;
	const a = 2 * d1 * d1 + 3 * d1 * d2 + d2 * d2;
	const n = 3 * d1 * (d1 + d2);
	return { x: (d1 * d1 * p2.x - d2 * d2 * p0.x + a * p1.x) / n, y: (d1 * d1 * p2.y - d2 * d2 * p0.y + a * p1.y) / n };
}

function controlIn(p1: WirePoint, p2: WirePoint, p3: WirePoint): WirePoint {
	const d2 = knot(p1, p2);
	const d3 = knot(p2, p3);
	if (d2 < 1e-6 || d3 < 1e-6) return p2;
	const b = 2 * d3 * d3 + 3 * d3 * d2 + d2 * d2;
	const n = 3 * d3 * (d3 + d2);
	return { x: (d3 * d3 * p1.x - d2 * d2 * p3.x + b * p2.x) / n, y: (d3 * d3 * p1.y - d2 * d2 * p3.y + b * p2.y) / n };
}

/** Each waypoint's controls as the wire is drawn — its own handle, or the worked-out ones. */
export function wireHandles(source: WirePoint, waypoints: readonly WireWaypoint[], target: WirePoint): WireHandles[] {
	const points: WirePoint[] = [source, ...waypoints, target];
	return waypoints.map((point, i) => {
		if (point.handle) {
			return {
				in: { x: point.x - point.handle.x, y: point.y - point.handle.y },
				out: { x: point.x + point.handle.x, y: point.y + point.handle.y },
				custom: true,
			};
		}
		const before = points[i]!;
		const after = points[i + 2]!;
		return { in: controlIn(before, point, after), out: controlOut(before, point, after), custom: false };
	});
}

/** The wire from `source` (an output) through `waypoints` to `target` (an input). */
export function wirePath(source: WirePoint, waypoints: readonly WireWaypoint[], target: WirePoint): WirePathResult {
	const points: WireWaypoint[] = [source, ...waypoints, target];
	const handles = wireHandles(source, waypoints, target);

	// Out of the output and into the input: horizontal, like any wire — as far
	// out as the neighbouring waypoint's own handle reaches, when it has one, so
	// a half turn (a loop's) is as round on the output's side as on the other.
	const reach = (from: WirePoint, next: WireWaypoint) =>
		next.handle ? Math.max(lead(from, next), Math.abs(next.handle.x)) : lead(from, next);
	const outOf = (i: number): WirePoint => i === 0
		? { x: source.x + reach(source, points[1]!), y: source.y }
		: handles[i - 1]!.out;
	const into = (i: number): WirePoint => i === points.length - 1
		? { x: target.x - reach(target, points[i - 1]!), y: target.y }
		: handles[i - 1]!.in;

	const segments = points.slice(0, -1).map((from, i) => ({ from, c1: outOf(i), c2: into(i + 1), to: points[i + 1]! }));

	const path = `M ${source.x},${source.y} ` + segments.map(({ c1, c2, to }) => `C ${c1.x},${c1.y} ${c2.x},${c2.y} ${to.x},${to.y}`).join(" ");

	// Halfway along the middle stretch — between two points, so it never sits on a waypoint.
	const segment = segments[Math.floor(segments.length / 2)]!;
	const middle = cubicAt(segment.from, segment.c1, segment.c2, segment.to, 0.5);

	return { path, labelX: middle.x, labelY: middle.y };
}

// How far below the lower of the two nodes a loop runs; a wire counts as one
// when its input is less than LOOP_REACH ahead of its output.
const LOOP_GAP = 48;
const LOOP_REACH = 56;

// How far a loop's turn bulges out to the side, for a drop of `height` — about
// a half circle (a cubic's controls at ⅔ of the diameter), never cramped.
const bulge = (height: number) => Math.max(48, height * 0.62);

/**
 * The waypoints a wire takes on its own when it goes back to a node behind
 * its source (the loop into a Repeat) — a stadium: out of the output in a
 * half turn down to below both nodes, straight back along the bottom, a half
 * turn up into the input. Each corner is a waypoint with a level handle, so
 * the turns are round and the bottom stays straight. None for a wire going forward.
 */
export function loopWaypoints(source: WirePoint, target: WirePoint, sourceBox: WireBox, targetBox: WireBox): WireWaypoint[] {
	if (target.x > source.x + LOOP_REACH) return [];
	const bottom = Math.max(sourceBox.y + sourceBox.height, targetBox.y + targetBox.height) + LOOP_GAP;
	const outTurn = bulge(bottom - source.y);
	const inTurn = bulge(bottom - target.y);

	// Barely behind: no room for a straight stretch — one point in the middle.
	if (target.x > source.x - 2 * Math.min(outTurn, inTurn)) {
		const half = Math.max(outTurn, inTurn);
		return [{ x: Math.round((source.x + target.x) / 2), y: bottom, handle: { x: -half, y: 0 } }];
	}

	// The handle points the way the wire goes along the bottom — to the left.
	return [
		{ x: source.x, y: bottom, handle: { x: -outTurn, y: 0 } },
		{ x: target.x, y: bottom, handle: { x: -inTurn, y: 0 } },
	];
}

/**
 * Where a new waypoint at `point` goes among `waypoints` — between the two
 * points of the wire it lengthens least, so it lands on the stretch clicked.
 */
export function waypointInsertIndex(source: WirePoint, waypoints: readonly WirePoint[], target: WirePoint, point: WirePoint): number {
	const points = [source, ...waypoints, target];
	let best = 0;
	let bestDetour = Infinity;
	for (let i = 0; i < points.length - 1; i++) {
		const detour = dist(points[i]!, point) + dist(point, points[i + 1]!) - dist(points[i]!, points[i + 1]!);
		if (detour < bestDetour) {
			bestDetour = detour;
			best = i;
		}
	}
	return best;
}
