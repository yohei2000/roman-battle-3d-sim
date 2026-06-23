import type { Vec2 } from "../math/Vec2";

export type SideId = "rome" | "opposition";
export type FormationArchetype = "heavy_infantry";
export type FormationIntent = "hold" | "advance" | "move" | "reform" | "retreat";
export type FormationState =
  | "idle"
  | "moving"
  | "forming"
  | "holding"
  | "engaged"
  | "recoiling"
  | "rupturing"
  | "routing"
  | "reforming";

export type EngagementPhase =
  | "approach"
  | "standoff"
  | "surge"
  | "recoil"
  | "rupture"
  | "pursuit";

export type VisualSoldierState =
  | "idle"
  | "march"
  | "brace"
  | "standoff"
  | "surge"
  | "recoil"
  | "route"
  | "reform";

export interface TerrainSample {
  height: number;
  slope: number;
  moveCost: number;
  cohesionCost: number;
  visibility: number;
  groundType: "grass" | "scrub" | "ridge";
}

export interface FormationCommand {
  id: number;
  formationIds: string[];
  type: FormationIntent;
  targetCenter?: Vec2;
  targetFacing?: number;
  arrivalIntent?: "hold" | "reform";
  careful?: boolean;
  intentId?: number;
  issuedAt: number;
  delay: number;
}

export interface Formation {
  id: string;
  name: string;
  side: SideId;
  archetype: FormationArchetype;
  center: Vec2;
  facing: number;
  width: number;
  depth: number;
  rankCount: number;
  fileCount: number;
  targetCenter: Vec2;
  targetFacing: number;
  intent: FormationIntent;
  morale: number;
  cohesion: number;
  fatigue: number;
  pressure: number;
  discipline: number;
  panic: number;
  intentPressure: number;
  standardInfluence: number;
  commandDelay: number;
  speed: number;
  turnRate: number;
  formationIntegrity: number;
  state: FormationState;
  currentEngagementIds: string[];
  selected: boolean;
  pendingCommand?: FormationCommand;
  arrivalIntent?: "hold" | "reform";
  carefulAlignment: boolean;
  intendedLineId?: number;
  slotOffsets: Vec2[];
  soldierSeeds: number[];
  visualState: VisualSoldierState;
  routeDirection: Vec2;
  lastThreatDirection: Vec2;
  flankThreat: number;
}

export interface ContactLane {
  index: number;
  worldPos: Vec2;
  normal: Vec2;
  width: number;
  aDensity: number;
  bDensity: number;
  aCohesion: number;
  bCohesion: number;
  flankFactorA: number;
  flankFactorB: number;
  terrainFactor: number;
  intensity: number;
}

export interface Engagement {
  id: string;
  aFormationId: string;
  bFormationId: string;
  contactLanes: ContactLane[];
  phase: EngagementPhase;
  phaseStartedAt: number;
  nextSurgeAt: number;
  pressureA: number;
  pressureB: number;
  localAdvantageA: number;
  localAdvantageB: number;
  lastWinnerId?: string;
  consecutiveLossesA: number;
  consecutiveLossesB: number;
  surgeOutcome?: "recoil" | "rupture";
  loserFormationId?: string;
}

export interface DebugFlags {
  bounds: boolean;
  fronts: boolean;
  contactLanes: boolean;
  labels: boolean;
  pressureLabels: boolean;
}

export interface SimEvent {
  time: number;
  kind: "command" | "engagement" | "morale" | "ai" | "intent";
  message: string;
  formationId?: string;
}

export interface SimSnapshot {
  time: number;
  formations: Formation[];
  engagements: Engagement[];
  events: SimEvent[];
}
