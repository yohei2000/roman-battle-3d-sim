import type { BattleDoctrine, Formation } from "../engine/sim/SimTypes";

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  seeds: number[];
  createFormations: (seed: number) => Formation[];
}

export interface EvaluationMetrics {
  firstContact?: number;
  firstSurge?: number;
  firstRupture?: number;
  firstRouting?: number;
  duration: number;
  winner: "rome" | "opposition" | "draw";
  commandCount: number;
  intentCount: number;
  lineAdherence: number;
  facingAdherence: number;
  flankRuptureRatio: number;
  comeback: boolean;
  routCascade: number;
  casualtyProxy: number;
  moraleDelta: number;
  commandFocusSpent: number;
  commandFocusRecovered: number;
  commandFocusEfficiency: number;
  reserveCommitted: number;
  reserveValue: number;
  objectiveControlTime: number;
  roleUsageDiversity: number;
  doctrine: BattleDoctrine;
  collapseReasonCount: number;
  standardEffectCount: number;
  stuck: boolean;
  nan: boolean;
  outOfBounds: boolean;
}

export interface RunResult {
  scenarioId: string;
  scenarioName: string;
  agentId: string;
  agentName: string;
  seed: number;
  metrics: EvaluationMetrics;
}

export interface ScoreBreakdown {
  "Tactical Agency": number;
  "Meaningful Tradeoff": number;
  "Strategic Diversity": number;
  Legibility: number;
  "Mobile Operability": number;
  Pacing: number;
  Performance: number;
  total: number;
  status: "PASS" | "WARN" | "FAIL";
}

export interface EvaluationReport {
  generatedAt: string;
  runs: RunResult[];
  score: ScoreBreakdown;
  summary: {
    runCount: number;
    scenarioCount: number;
    agentCount: number;
    bestCreativeAgent: string;
    effectiveComplexity: string[];
    weakComplexity: string[];
    overstrongComplexity: string[];
  };
}
