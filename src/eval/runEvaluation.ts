import { createAgents } from "./agents";
import { runAgentScenario } from "./Runner";
import { SCENARIOS } from "./ScenarioSuite";
import { scoreRuns } from "./ScoreModel";
import type { EvaluationReport } from "./EvaluationTypes";
import { writeJson, writeMarkdown } from "./ReportWriter";

export async function runEvaluation(): Promise<{ report: EvaluationReport; json: string; markdown: string }> {
  const agentCount = createAgents().length;
  const runs = [];
  for (const scenario of SCENARIOS) {
    for (const seed of scenario.seeds) {
      for (const agent of createAgents()) {
        runs.push(runAgentScenario(agent, scenario, seed));
      }
    }
  }
  const score = scoreRuns(runs);
  const creativeRuns = runs.filter((run) => run.agentId !== "noop" && run.agentId !== "frontal");
  const bestCreativeAgent =
    creativeRuns
      .slice()
      .sort(
        (a, b) =>
          b.metrics.lineAdherence +
          b.metrics.intentCount +
          b.metrics.reserveValue +
          b.metrics.objectiveControlTime / 60 -
          (a.metrics.lineAdherence + a.metrics.intentCount + a.metrics.reserveValue + a.metrics.objectiveControlTime / 60),
      )[0]
      ?.agentName ?? "none";
  const findings = complexityFindings(runs);
  const report: EvaluationReport = {
    generatedAt: new Date().toISOString(),
    runs,
    score,
    summary: {
      runCount: runs.length,
      scenarioCount: SCENARIOS.length,
      agentCount,
      bestCreativeAgent,
      effectiveComplexity: findings.effective,
      weakComplexity: findings.weak,
      overstrongComplexity: findings.overstrong,
    },
  };
  return { report, json: writeJson(report), markdown: writeMarkdown(report) };
}

function complexityFindings(runs: Awaited<ReturnType<typeof runAgentScenario>>[]): {
  effective: string[];
  weak: string[];
  overstrong: string[];
} {
  const avg = (selector: (run: Awaited<ReturnType<typeof runAgentScenario>>) => number) =>
    runs.reduce((sum, run) => sum + selector(run), 0) / Math.max(1, runs.length);
  const byAgent = new Map<string, Awaited<ReturnType<typeof runAgentScenario>>[]>();
  for (const run of runs) {
    byAgent.set(run.agentId, [...(byAgent.get(run.agentId) ?? []), run]);
  }
  const agentAvg = (id: string, selector: (run: Awaited<ReturnType<typeof runAgentScenario>>) => number) => {
    const values = byAgent.get(id) ?? [];
    return values.reduce((sum, run) => sum + selector(run), 0) / Math.max(1, values.length);
  };

  const effective: string[] = [];
  const weak: string[] = [];
  const overstrong: string[] = [];

  if (avg((run) => run.metrics.commandFocusSpent) > 30 && avg((run) => run.metrics.commandFocusEfficiency) > 0.18) {
    effective.push("commandFocus tradeoff");
  } else {
    weak.push("commandFocus pressure");
  }
  if (agentAvg("reserve", (run) => run.metrics.reserveValue) > agentAvg("frontal", (run) => run.metrics.reserveValue) + 0.12) {
    effective.push("reserve timing");
  } else {
    weak.push("reserve value");
  }
  if (agentAvg("objective", (run) => run.metrics.objectiveControlTime) > agentAvg("noop", (run) => run.metrics.objectiveControlTime) + 20) {
    effective.push("objective control");
  } else {
    weak.push("objective incentives");
  }
  if (new Set(runs.map((run) => run.metrics.doctrine)).size >= 3) {
    effective.push("doctrine diversity");
  }
  const bestWinRate = Math.max(
    ...[...byAgent.values()].map((agentRuns) => agentRuns.filter((run) => run.metrics.winner === "rome").length / Math.max(1, agentRuns.length)),
  );
  if (bestWinRate > 0.88) {
    overstrong.push("single-agent win rate");
  }
  if (avg((run) => run.metrics.reserveCommitted) > 1.4) {
    overstrong.push("reserve auto-release frequency");
  }

  return { effective, weak, overstrong };
}
