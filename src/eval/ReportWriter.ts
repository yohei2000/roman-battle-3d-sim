import type { EvaluationReport } from "./EvaluationTypes";

export function writeJson(report: EvaluationReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function writeMarkdown(report: EvaluationReport): string {
  const lines = [
    "# Roman Battle 3D Sim Evaluation",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.score.status}`,
    `Total Score: ${report.score.total}`,
    "",
    "## Score",
    "",
    "| Category | Score |",
    "| --- | ---: |",
    ...Object.entries(report.score)
      .filter(([key]) => key !== "status" && key !== "total")
      .map(([key, value]) => `| ${key} | ${value} |`),
    "",
    "## Runs",
    "",
    "| Scenario | Agent | Seed | Winner | Contact | Surge | Rupture | Routing | Intents | Line | Facing | Flags |",
    "| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];

  for (const run of report.runs) {
    const flags = [
      run.metrics.nan ? "nan" : "",
      run.metrics.stuck ? "stuck" : "",
      run.metrics.outOfBounds ? "oob" : "",
    ]
      .filter(Boolean)
      .join(",");
    lines.push(
      `| ${run.scenarioName} | ${run.agentName} | ${run.seed} | ${run.metrics.winner} | ${fmt(
        run.metrics.firstContact,
      )} | ${fmt(run.metrics.firstSurge)} | ${fmt(run.metrics.firstRupture)} | ${fmt(
        run.metrics.firstRouting,
      )} | ${run.metrics.intentCount} | ${run.metrics.lineAdherence.toFixed(2)} | ${run.metrics.facingAdherence.toFixed(
        2,
      )} | ${flags || "ok"} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function fmt(value?: number): string {
  return value === undefined ? "-" : value.toFixed(1);
}
