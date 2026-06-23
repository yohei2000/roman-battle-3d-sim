import { Rng, hashStringSeed } from "../engine/math/Rng";
import type { Formation } from "../engine/sim/SimTypes";

export function createDefaultScenario(): Formation[] {
  const formations: Formation[] = [
    makeFormation("rome-left", "I Cohort Left", "rome", -24, -32, 0, 18, 11, 12, 9, 0.72),
    makeFormation("rome-center", "I Cohort Center", "rome", 0, -34, 0, 19, 11, 13, 9, 0.78),
    makeFormation("rome-right", "I Cohort Right", "rome", 24, -32, 0, 18, 11, 12, 9, 0.72),
    makeFormation("opp-left", "Opposition Left", "opposition", -27, 34, Math.PI, 18, 11, 12, 9, 0.66),
    makeFormation("opp-center", "Opposition Center", "opposition", 0, 36, Math.PI, 20, 11, 13, 9, 0.7),
    makeFormation("opp-right", "Opposition Right", "opposition", 27, 34, Math.PI, 18, 11, 12, 9, 0.66),
  ];

  return formations;
}

function makeFormation(
  id: string,
  name: string,
  side: Formation["side"],
  x: number,
  z: number,
  facing: number,
  width: number,
  depth: number,
  fileCount: number,
  rankCount: number,
  discipline: number,
): Formation {
  const rng = new Rng(hashStringSeed(id));
  const soldierCount = fileCount * rankCount;
  const soldierSeeds = Array.from({ length: soldierCount }, () => rng.next());

  return {
    id,
    name,
    side,
    archetype: "heavy_infantry",
    center: { x, y: z },
    facing,
    width,
    depth,
    rankCount,
    fileCount,
    targetCenter: { x, y: z },
    targetFacing: facing,
    intent: "hold",
    morale: side === "rome" ? 0.84 : 0.78,
    cohesion: side === "rome" ? 0.9 : 0.82,
    fatigue: 0.08 + rng.next() * 0.04,
    pressure: 0.05,
    discipline,
    panic: 0.03,
    commandDelay: 0,
    speed: side === "rome" ? 5.6 : 5.9,
    turnRate: side === "rome" ? 1.35 : 1.25,
    formationIntegrity: 0.9,
    state: "holding",
    currentEngagementIds: [],
    selected: false,
    carefulAlignment: false,
    slotOffsets: [],
    soldierSeeds,
    visualState: "brace",
    routeDirection: { x: side === "rome" ? -0.1 : 0.1, y: side === "rome" ? -1 : 1 },
    lastThreatDirection: { x: 0, y: side === "rome" ? 1 : -1 },
    flankThreat: 0,
  };
}
