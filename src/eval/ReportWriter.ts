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
    "## Complexity Findings",
    "",
    `Effective: ${report.summary.effectiveComplexity.join(", ") || "none"}`,
    `Weak: ${report.summary.weakComplexity.join(", ") || "none"}`,
    `Overstrong: ${report.summary.overstrongComplexity.join(", ") || "none"}`,
    "",
    "## Runs",
    "",
    "| Scenario | Agent | Seed | Winner | Doctrine | Focus | Reserve | ObjTime | Roles | Contact | Surge | Rupture | Routing | Intents | Line | Facing | Flags |",
    "| --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
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
      `| ${run.scenarioName} | ${run.agentName} | ${run.seed} | ${run.metrics.winner} | ${doctrineShort(
        run.metrics.doctrine,
      )} | ${run.metrics.commandFocusSpent.toFixed(0)} | ${run.metrics.reserveCommitted} | ${run.metrics.objectiveControlTime.toFixed(
        1,
      )} | ${run.metrics.roleUsageDiversity.toFixed(2)} | ${fmt(
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

function doctrineShort(value: string): string {
  if (value === "hold_absorb") return "Hold";
  if (value === "refuse_flank") return "Refuse";
  if (value === "center_push") return "Push";
  return "Reserve";
}
