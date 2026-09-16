import { describe, expect, it } from "vitest";
import { availableStageActions, checkStageChange } from "./stages";
import type { TripStage } from "./types";

const trip = (stage: TripStage) => ({ stage });

describe("checkStageChange", () => {
  it("walks an idea through to a finished trip", () => {
    expect(checkStageChange(trip("idea"), "start_planning", "owner").nextStage).toBe("planning");
    expect(checkStageChange(trip("planning"), "mark_booked", "owner").nextStage).toBe("booked");
    expect(checkStageChange(trip("booked"), "start_trip", "owner").nextStage).toBe("travelling");
    expect(checkStageChange(trip("travelling"), "complete", "owner").nextStage).toBe("completed");
  });

  it("refuses a step that skips the current stage", () => {
    const result = checkStageChange(trip("idea"), "start_trip", "owner");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/does not apply/i);
  });

  it("lets a companion mark things booked but not cancel the trip", () => {
    expect(checkStageChange(trip("planning"), "mark_booked", "companion").allowed).toBe(true);
    const cancel = checkStageChange(trip("planning"), "cancel", "companion");
    expect(cancel.allowed).toBe(false);
    expect(cancel.reason).toMatch(/person who created the trip/i);
  });

  it("refuses anyone who is not on the trip", () => {
    const result = checkStageChange(trip("planning"), "mark_booked", null);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not on this trip/i);
  });

  it("can revive a cancelled or completed trip as planning", () => {
    expect(checkStageChange(trip("cancelled"), "reopen", "owner").nextStage).toBe("planning");
    expect(checkStageChange(trip("completed"), "reopen", "owner").nextStage).toBe("planning");
  });

  it("does not cancel a trip that already happened", () => {
    expect(checkStageChange(trip("completed"), "cancel", "owner").allowed).toBe(false);
    expect(checkStageChange(trip("travelling"), "cancel", "owner").allowed).toBe(false);
  });
});

describe("availableStageActions", () => {
  it("offers the owner the next step and a cancellation", () => {
    expect(availableStageActions(trip("planning"), "owner").sort()).toEqual(
      ["cancel", "mark_booked"].sort(),
    );
  });

  it("offers a companion only what they may do", () => {
    expect(availableStageActions(trip("booked"), "companion")).toEqual(["start_trip"]);
  });

  it("offers nothing to someone who is not on the trip", () => {
    expect(availableStageActions(trip("planning"), null)).toEqual([]);
  });
});
