import type { Vec2 } from "../math/Vec2";
import type { BattleDoctrine, FormationRole, ObjectiveType, ObjectiveZone } from "./SimTypes";

export interface RoleTraits {
  speed: number;
  turnRate: number;
  cohesionRecovery: number;
  pressureResistance: number;
  surge: number;
  commandCost: number;
  contagion: number;
  objectiveCapture: number;
}

export interface DoctrineTraits {
  label: string;
  focusRecovery: number;
  frontlineCost: number;
  pressureCost: number;
  reserveCost: number;
  roleCost: number;
  defensivePanic: number;
  surge: number;
  objectiveCapture: number;
  reserveTrigger: number;
}

export const COMMAND_FOCUS_MAX = 100;
export const COMMAND_FOCUS_INITIAL = 78;

export const COMMAND_COST = {
  basic: 5,
  frontline: 13,
  pressure: 17,
  fallback: 10,
  standard: 15,
  reserve: 18,
  objective: 11,
  roleCalm: 8,
  roleCombat: 20,
  doctrine: 12,
} as const;

export const ROLE_TRAITS: Record<FormationRole, RoleTraits> = {
  center: {
    speed: 1,
    turnRate: 0.96,
    cohesionRecovery: 1.12,
    pressureResistance: 0.1,
    surge: 1,
    commandCost: 0.95,
    contagion: 0.9,
    objectiveCapture: 1,
  },
  wing: {
    speed: 1.08,
    turnRate: 1.22,
    cohesionRecovery: 0.96,
    pressureResistance: 0,
    surge: 1.06,
    commandCost: 1.03,
    contagion: 1,
    objectiveCapture: 1.08,
  },
  reserve: {
    speed: 0.94,
    turnRate: 1.05,
    cohesionRecovery: 1.04,
    pressureResistance: 0.06,
    surge: 0.94,
    commandCost: 0.86,
    contagion: 0.78,
    objectiveCapture: 0.82,
  },
  guard: {
    speed: 0.92,
    turnRate: 0.9,
    cohesionRecovery: 1.18,
    pressureResistance: 0.2,
    surge: 0.98,
    commandCost: 1.12,
    contagion: 0.72,
    objectiveCapture: 1.02,
  },
};

export const DOCTRINE_TRAITS: Record<BattleDoctrine, DoctrineTraits> = {
  hold_absorb: {
    label: "Hold & Absorb",
    focusRecovery: 1.14,
    frontlineCost: 0.95,
    pressureCost: 1.14,
    reserveCost: 1.02,
    roleCost: 0.95,
    defensivePanic: 0.15,
    surge: 0.94,
    objectiveCapture: 0.95,
    reserveTrigger: 0.72,
  },
  refuse_flank: {
    label: "Refuse Flank",
    focusRecovery: 1.04,
    frontlineCost: 1,
    pressureCost: 1.04,
    reserveCost: 0.98,
    roleCost: 0.9,
    defensivePanic: 0.08,
    surge: 1.02,
    objectiveCapture: 1.02,
    reserveTrigger: 0.62,
  },
  center_push: {
    label: "Center Push",
    focusRecovery: 0.92,
    frontlineCost: 1.04,
    pressureCost: 0.88,
    reserveCost: 1.12,
    roleCost: 1.08,
    defensivePanic: -0.03,
    surge: 1.11,
    objectiveCapture: 0.96,
    reserveTrigger: 0.78,
  },
  flexible_reserve: {
    label: "Flexible Reserve",
    focusRecovery: 1.02,
    frontlineCost: 1.02,
    pressureCost: 1.02,
    reserveCost: 0.78,
    roleCost: 0.96,
    defensivePanic: 0.05,
    surge: 0.98,
    objectiveCapture: 1.04,
    reserveTrigger: 0.54,
  },
};

export function roleTraits(role: FormationRole): RoleTraits {
  return ROLE_TRAITS[role];
}

export function doctrineTraits(doctrine: BattleDoctrine): DoctrineTraits {
  return DOCTRINE_TRAITS[doctrine];
}

export function doctrineLabel(doctrine: BattleDoctrine): string {
  return DOCTRINE_TRAITS[doctrine].label;
}

export function createDefaultObjectives(): ObjectiveZone[] {
  return [
    makeObjective("ridge-west", "West Ridge", "ridge", { x: -34, y: 0 }, 13, {
      commandFocusRecovery: 0.35,
      cohesionRecovery: 0.08,
      visibility: 0.08,
    }),
    makeObjective("rally-center", "Rally Stone", "rally", { x: 0, y: -6 }, 12, {
      commandFocusRecovery: 0.45,
      cohesionRecovery: 0.14,
      visibility: 0.03,
    }),
    makeObjective("road-east", "East Road", "road", { x: 34, y: -1 }, 12, {
      commandFocusRecovery: 0.25,
      moveEfficiency: 0.12,
      cohesionRecovery: 0.05,
    }),
    makeObjective("flank-gate", "Flank Gate", "flank_gate", { x: 48, y: 17 }, 11, {
      commandFocusRecovery: 0.2,
      visibility: 0.14,
      moveEfficiency: 0.08,
    }),
  ];
}

function makeObjective(
  id: string,
  name: string,
  type: ObjectiveType,
  center: Vec2,
  radius: number,
  bonuses: ObjectiveZone["bonuses"],
): ObjectiveZone {
  return {
    id,
    name,
    type,
    center,
    radius,
    owner: undefined,
    contested: false,
    focus: false,
    control: { rome: 0, opposition: 0 },
    controlTime: { rome: 0, opposition: 0 },
    bonuses,
  };
}
