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
      .sort((a, b) => b.metrics.lineAdherence + b.metrics.intentCount - (a.metrics.lineAdherence + a.metrics.intentCount))[0]
      ?.agentName ?? "none";
  const report: EvaluationReport = {
    generatedAt: new Date().toISOString(),
    runs,
    score,
    summary: {
      runCount: runs.length,
      scenarioCount: SCENARIOS.length,
      agentCount,
      bestCreativeAgent,
    },
  };
  return { report, json: writeJson(report), markdown: writeMarkdown(report) };
}
