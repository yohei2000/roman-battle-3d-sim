import type { RunResult, ScoreBreakdown } from "./EvaluationTypes";

export function scoreRuns(runs: RunResult[]): ScoreBreakdown {
  const creative = runs.filter((run) => run.agentId !== "noop" && run.agentId !== "frontal");
  const target = creative.length > 0 ? creative : runs;
  const avg = (selector: (run: RunResult) => number) =>
    target.reduce((sum, run) => sum + selector(run), 0) / Math.max(1, target.length);
  const hasFailure = runs.some((run) => run.metrics.nan || run.metrics.stuck || run.metrics.outOfBounds);
  const doctrines = new Set(target.map((run) => run.metrics.doctrine)).size;
  const winningAgents = new Set(runs.filter((run) => run.metrics.winner === "rome").map((run) => run.agentId)).size;

  const TacticalAgency = clampScore(
    40 +
      avg((run) => run.metrics.intentCount) * 4.2 +
      avg((run) => run.metrics.reserveCommitted) * 8 +
      avg((run) => run.metrics.objectiveControlTime) * 0.18 +
      avg((run) => run.metrics.roleUsageDiversity) * 18,
  );
  const MeaningfulTradeoff = clampScore(
    44 +
      Math.min(22, avg((run) => run.metrics.commandFocusSpent) * 0.22) +
      Math.min(16, avg((run) => run.metrics.commandFocusEfficiency) * 18) +
      avg((run) => (run.metrics.commandFocusSpent > 120 ? -8 : 4)),
  );
  const StrategicDiversity = clampScore(
    42 +
      doctrines * 6 +
      winningAgents * 4 +
      avg((run) => run.metrics.reserveValue) * 14 +
      avg((run) => run.metrics.objectiveControlTime > 20 ? 8 : 0),
  );
  const Legibility = clampScore(66 + avg((run) => run.metrics.facingAdherence) * 24);
  const LegibilityWithReasons = clampScore(
    Legibility + Math.min(10, avg((run) => run.metrics.collapseReasonCount) * 2.2) + avg((run) => run.metrics.standardEffectCount > 0 ? 4 : 0),
  );
  const MobileOperability = 84;
  const Pacing = clampScore(
    92 -
      Math.abs(avg((run) => run.metrics.firstSurge ?? 28) - 18) * 1.1 -
      avg((run) => (run.metrics.stuck ? 20 : 0)),
  );
  const Performance = hasFailure ? 35 : 92;
  const total = Math.round(
    TacticalAgency * 0.2 +
      MeaningfulTradeoff * 0.15 +
      StrategicDiversity * 0.15 +
      LegibilityWithReasons * 0.15 +
      MobileOperability * 0.15 +
      Pacing * 0.1 +
      Performance * 0.1,
  );
  const status =
    hasFailure || total < 55
      ? "FAIL"
      : total >= 70 && TacticalAgency >= 60 && MeaningfulTradeoff >= 60
        ? "PASS"
        : "WARN";

  return {
    "Tactical Agency": Math.round(TacticalAgency),
    "Meaningful Tradeoff": Math.round(MeaningfulTradeoff),
    "Strategic Diversity": Math.round(StrategicDiversity),
    Legibility: Math.round(LegibilityWithReasons),
    "Mobile Operability": Math.round(MobileOperability),
    Pacing: Math.round(Pacing),
    Performance: Math.round(Performance),
    total,
    status,
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}
