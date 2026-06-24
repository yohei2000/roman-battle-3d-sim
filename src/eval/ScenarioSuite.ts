import { createDefaultScenario } from "../scenarios/defaultScenario";
import type { Formation } from "../engine/sim/SimTypes";
import type { ScenarioDefinition } from "./EvaluationTypes";

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: "balanced-frontal",
    name: "Balanced Frontal",
    description: "Symmetric heavy infantry lines with room to draw an orderly front.",
    seeds: [1101, 1102, 1103],
    createFormations: () => createDefaultScenario(),
  },
  {
    id: "objective-race",
    name: "Objective Race",
    description: "Both lines can reach rally and road objectives before decisive contact.",
    seeds: [4101, 4102, 4103],
    createFormations: () => {
      const formations = createDefaultScenario();
      for (const formation of formations) {
        if (formation.side === "rome" && formation.role !== "reserve") {
          formation.center.y -= 7;
        }
        if (formation.side === "opposition") {
          formation.center.y += 3;
        }
        formation.targetCenter = { ...formation.center };
      }
      return formations;
    },
  },
  {
    id: "reserve-rescue",
    name: "Reserve Rescue",
    description: "Friendly left begins under flank stress, rewarding reserve timing.",
    seeds: [5101, 5102, 5103],
    createFormations: () => {
      const formations = createDefaultScenario();
      const romeLeft = formations.find((formation) => formation.id === "rome-left");
      const oppRight = formations.find((formation) => formation.id === "opp-right");
      const reserve = formations.find((formation) => formation.id === "rome-reserve");
      if (romeLeft) {
        romeLeft.center.x -= 8;
        romeLeft.center.y += 8;
        romeLeft.cohesion *= 0.68;
        romeLeft.fatigue += 0.18;
        romeLeft.targetCenter = { ...romeLeft.center };
      }
      if (oppRight) {
        oppRight.center.x -= 14;
        oppRight.center.y -= 10;
        oppRight.facing = Math.PI * 1.08;
        oppRight.targetCenter = { ...oppRight.center };
        oppRight.targetFacing = oppRight.facing;
      }
      if (reserve) {
        reserve.center.x = -12;
        reserve.targetCenter = { ...reserve.center };
      }
      return formations;
    },
  },
  {
    id: "angled-flank-opportunity",
    name: "Angled Flank Opportunity",
    description: "Enemy right starts overextended, rewarding angled frontlines and pressure.",
    seeds: [2101, 2102, 2103],
    createFormations: () => {
      const formations = createDefaultScenario();
      const enemyRight = formations.find((formation) => formation.id === "opp-right");
      const enemyCenter = formations.find((formation) => formation.id === "opp-center");
      const romeRight = formations.find((formation) => formation.id === "rome-right");
      if (enemyRight) {
        enemyRight.center.x += 12;
        enemyRight.center.y -= 7;
        enemyRight.facing = Math.PI * 0.82;
        enemyRight.targetCenter = { ...enemyRight.center };
        enemyRight.targetFacing = enemyRight.facing;
      }
      if (enemyCenter) {
        enemyCenter.center.y += 2;
        enemyCenter.targetCenter = { ...enemyCenter.center };
      }
      if (romeRight) {
        romeRight.center.x += 4;
        romeRight.targetCenter = { ...romeRight.center };
      }
      return formations;
    },
  },
  {
    id: "disordered-initial-formation",
    name: "Disordered Initial Formation",
    description: "Friendly line starts staggered and tired, testing reform and fallback value.",
    seeds: [3101, 3102, 3103],
    createFormations: () => {
      const formations = createDefaultScenario();
      for (const formation of formations.filter((candidate) => candidate.side === "rome")) {
        const index = formations.indexOf(formation);
        formation.center.x += index % 2 === 0 ? -5 : 6;
        formation.center.y += index % 2 === 0 ? 5 : -4;
        formation.facing += index % 2 === 0 ? 0.22 : -0.18;
        formation.targetCenter = { ...formation.center };
        formation.targetFacing = formation.facing;
        formation.cohesion *= 0.72;
        formation.fatigue += 0.14;
      }
      return formations;
    },
  },
];

export function cloneFormations(formations: Formation[]): Formation[] {
  return formations.map((formation) => ({
    ...formation,
    center: { ...formation.center },
    targetCenter: { ...formation.targetCenter },
    routeDirection: { ...formation.routeDirection },
    lastThreatDirection: { ...formation.lastThreatDirection },
    currentEngagementIds: [...formation.currentEngagementIds],
    slotOffsets: formation.slotOffsets.map((slot) => ({ ...slot })),
    soldierSeeds: [...formation.soldierSeeds],
  }));
}
