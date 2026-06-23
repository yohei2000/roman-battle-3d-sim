import type { RunResult, ScoreBreakdown } from "./EvaluationTypes";

export function scoreRuns(runs: RunResult[]): ScoreBreakdown {
  const creative = runs.filter((run) => run.agentId !== "noop" && run.agentId !== "frontal");
  const target = creative.length > 0 ? creative : runs;
  const avg = (selector: (run: RunResult) => number) =>
    target.reduce((sum, run) => sum + selector(run), 0) / Math.max(1, target.length);
  const hasFailure = runs.some((run) => run.metrics.nan || run.metrics.stuck || run.metrics.outOfBounds);

  const Mobile = 82;
  const Agency = clampScore(54 + avg((run) => run.metrics.intentCount) * 7 + avg((run) => run.metrics.lineAdherence) * 18);
  const Legibility = clampScore(66 + avg((run) => run.metrics.facingAdherence) * 24);
  const Pacing = clampScore(
    92 -
      Math.abs(avg((run) => run.metrics.firstSurge ?? 28) - 18) * 1.1 -
      avg((run) => (run.metrics.stuck ? 20 : 0)),
  );
  const Depth = clampScore(58 + avg((run) => run.metrics.intentCount) * 6 + avg((run) => run.metrics.flankRuptureRatio) * 22);
  const Drama = clampScore(56 + avg((run) => (run.metrics.firstRupture ? 13 : 0)) + avg((run) => run.metrics.routCascade) * 4);
  const Performance = hasFailure ? 35 : 92;
  const total = Math.round(
    Mobile * 0.2 +
      Agency * 0.2 +
      Legibility * 0.15 +
      Pacing * 0.15 +
      Depth * 0.15 +
      Drama * 0.1 +
      Performance * 0.05,
  );
  const status = hasFailure || total < 55 ? "FAIL" : total >= 70 && Mobile >= 65 && Agency >= 60 ? "PASS" : "WARN";

  return {
    Mobile: Math.round(Mobile),
    Agency: Math.round(Agency),
    Legibility: Math.round(Legibility),
    Pacing: Math.round(Pacing),
    Depth: Math.round(Depth),
    Drama: Math.round(Drama),
    Performance: Math.round(Performance),
    total,
    status,
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}
