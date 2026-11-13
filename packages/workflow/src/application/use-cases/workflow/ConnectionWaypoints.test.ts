import { describe, expect, it } from "vitest";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { ConnectionRuntime } from "../../../domain/entities/IConnection.runtime.js";
import { loopWaypoints, waypointInsertIndex, wireHandles, wirePath } from "../../../domain/value-objects/WirePath.js";
import { AddConnectionWaypoint } from "./AddConnectionWaypoint.use-case.js";
import { MoveConnectionWaypoint } from "./MoveConnectionWaypoint.use-case.js";
import { RemoveConnectionWaypoint } from "./RemoveConnectionWaypoint.use-case.js";
import { SetConnectionWaypointHandle } from "./SetConnectionWaypointHandle.use-case.js";
import { SetConnectionWaypoints } from "./SetConnectionWaypoints.use-case.js";
import { ShiftConnectionWaypoints } from "./ShiftConnectionWaypoints.use-case.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";

const withWire = (): IWorkflowRuntime => ({
	...new CreateWorkflow().execute("wf", "", { name: "esp32", description: "", pins: [] } as never, "board-pkg"),
	connections: [{ id: "c", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" }],
});

const waypointsOf = (workflow: IWorkflowRuntime) => workflow.connections[0]!.waypoints;

describe("connection waypoints", () => {

	it("adds, moves and removes them — dropping the field once none is left", () => {
		let workflow = new AddConnectionWaypoint().execute(withWire(), "c", 0, { x: 100.4, y: 300.6 });
		workflow = new AddConnectionWaypoint().execute(workflow, "c", 1, { x: 400, y: 300 });
		expect(waypointsOf(workflow)).toEqual([{ x: 100, y: 301 }, { x: 400, y: 300 }]);

		workflow = new MoveConnectionWaypoint().execute(workflow, "c", 0, { x: 120, y: 280 });
		expect(waypointsOf(workflow)).toEqual([{ x: 120, y: 280 }, { x: 400, y: 300 }]);

		workflow = new RemoveConnectionWaypoint().execute(workflow, "c", 0);
		workflow = new RemoveConnectionWaypoint().execute(workflow, "c", 0);
		expect(workflow.connections[0]).not.toHaveProperty("waypoints");
	});

	it("sets a waypoint's handle, keeps it when the waypoint moves, and drops it back to auto", () => {
		let workflow = new AddConnectionWaypoint().execute(withWire(), "c", 0, { x: 100, y: 100 });
		workflow = new SetConnectionWaypointHandle().execute(workflow, "c", 0, { x: 60.4, y: -20 });
		expect(waypointsOf(workflow)).toEqual([{ x: 100, y: 100, handle: { x: 60, y: -20 } }]);
		workflow = new MoveConnectionWaypoint().execute(workflow, "c", 0, { x: 200, y: 150 });
		expect(waypointsOf(workflow)).toEqual([{ x: 200, y: 150, handle: { x: 60, y: -20 } }]);
		workflow = new SetConnectionWaypointHandle().execute(workflow, "c", 0, null);
		expect(waypointsOf(workflow)).toEqual([{ x: 200, y: 150 }]);
	});

	it("draws through a waypoint's own handle, the way in mirroring the way out", () => {
		const waypoint = { x: 300, y: 200, handle: { x: 0, y: 80 } };
		const [handles] = wireHandles({ x: 0, y: 0 }, [waypoint], { x: 0, y: 100 });
		expect(handles).toEqual({ in: { x: 300, y: 120 }, out: { x: 300, y: 280 }, custom: true });
		const { path } = wirePath({ x: 0, y: 0 }, [waypoint], { x: 0, y: 100 });
		expect(path).toContain(" 300,120 300,200 ");                    // comes in on the mirrored control
		expect(path).toContain("C 300,280 ");                           // leaves on its handle
		expect(wireHandles({ x: 0, y: 0 }, [{ x: 300, y: 200 }], { x: 0, y: 100 })[0]!.custom).toBe(false);
	});

	it("never loops or overshoots between close, sharp waypoints (centripetal)", () => {
		// Two points almost on top of each other, a hairpin turn between them.
		const waypoints = [{ x: 300, y: 100 }, { x: 305, y: 102 }];
		const handles = wireHandles({ x: 0, y: 0 }, waypoints, { x: 0, y: 200 });
		// The controls stay close to their point — a uniform spline throws them far out.
		for (const [i, h] of handles.entries()) {
			const p = waypoints[i]!;
			expect(Math.hypot(h.out.x - p.x, h.out.y - p.y)).toBeLessThan(60);
			expect(Math.hypot(h.in.x - p.x, h.in.y - p.y)).toBeLessThan(60);
		}
	});

	it("routes a wire back to a node behind round below both, and leaves a forward one alone", () => {
		const sourceBox = { x: 600, y: 0, width: 240, height: 120 };
		const targetBox = { x: 200, y: 40, width: 240, height: 140 };
		const loop = loopWaypoints({ x: 840, y: 60 }, { x: 200, y: 100 }, sourceBox, targetBox);
		// 48 below the lower box, right under the output and the input, level handles pointing left.
		expect(loop.map(({ x, y }) => ({ x, y }))).toEqual([{ x: 840, y: 228 }, { x: 200, y: 228 }]);
		expect(loop.every(point => point.handle!.y === 0 && point.handle!.x < 0)).toBe(true);
		// The turn out of the output is as round as the one into the bottom: no kink.
		const { path } = wirePath({ x: 840, y: 60 }, loop, { x: 200, y: 100 });
		const [, first] = path.split(" C ");
		const [c1, c2] = first!.split(" ");
		expect(Number(c1!.split(",")[0]) - 840).toBeCloseTo(Number(c2!.split(",")[0]) - 840, 0);
		// Barely behind: one point in the middle.
		expect(loopWaypoints({ x: 400, y: 60 }, { x: 380, y: 60 }, sourceBox, targetBox)).toHaveLength(1);
		expect(loopWaypoints({ x: 200, y: 60 }, { x: 600, y: 60 }, targetBox, sourceBox)).toEqual([]);
	});

	it("sets all of them at once, and shifts them with the nodes", () => {
		let workflow = new SetConnectionWaypoints().execute(withWire(), "c", [{ x: 10.2, y: 20 }, { x: 30, y: 40, handle: { x: 5, y: 0 } }]);
		expect(waypointsOf(workflow)).toEqual([{ x: 10, y: 20 }, { x: 30, y: 40, handle: { x: 5, y: 0 } }]);
		workflow = new ShiftConnectionWaypoints().execute(workflow, ["c"], 100, -10);
		expect(waypointsOf(workflow)).toEqual([{ x: 110, y: 10 }, { x: 130, y: 30, handle: { x: 5, y: 0 } }]);
		expect(new SetConnectionWaypoints().execute(workflow, "c", []).connections[0]).not.toHaveProperty("waypoints");
	});

	it("leaves the workflow as it is for a wire or a waypoint that isn't there", () => {
		const workflow = withWire();
		expect(new MoveConnectionWaypoint().execute(workflow, "c", 3, { x: 0, y: 0 })).toBe(workflow);
		expect(new RemoveConnectionWaypoint().execute(workflow, "nope", 0)).toBe(workflow);
	});

	it("keeps them through the workflow's parse", () => {
		const workflow = new AddConnectionWaypoint().execute(withWire(), "c", 0, { x: 10, y: 20 });
		expect(ConnectionRuntime.parse(workflow.connections[0]).waypoints).toEqual([{ x: 10, y: 20 }]);
	});

	it("puts a new one on the stretch of wire it's closest to", () => {
		const source = { x: 0, y: 0 };
		const target = { x: 0, y: 200 };
		const waypoints = [{ x: 300, y: 0 }, { x: 300, y: 200 }];
		expect(waypointInsertIndex(source, waypoints, target, { x: 150, y: -5 })).toBe(0);
		expect(waypointInsertIndex(source, waypoints, target, { x: 310, y: 100 })).toBe(1);
		expect(waypointInsertIndex(source, waypoints, target, { x: 150, y: 205 })).toBe(2);
	});

	it("draws a curve through every waypoint, leaving and entering horizontally", () => {
		const { path, labelX, labelY } = wirePath({ x: 0, y: 0 }, [{ x: 300, y: 200 }], { x: 0, y: 100 });
		expect(path.startsWith("M 0,0 C ")).toBe(true);
		expect(path.split(" C ")).toHaveLength(3);                     // one segment per stretch
		expect(path).toContain(" 300,200 ");                            // through the waypoint
		expect([labelX, labelY]).not.toEqual([300, 200]);                // never on a waypoint
		expect(labelY).toBeGreaterThan(100);                             // on the stretch back from it
		const [firstControl] = path.split(" C ")[1]!.split(" ");
		expect(firstControl!.split(",")[1]).toBe("0");                  // out of the output horizontally
	});

});
