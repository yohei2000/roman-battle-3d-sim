import { mkdir, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const outDir = ".eval-tmp";
const bundled = `${outDir}/runEvaluation.mjs`;

await mkdir(outDir, { recursive: true });
await esbuild.build({
  entryPoints: ["src/eval/runEvaluation.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: bundled,
  logLevel: "silent",
});

const { runEvaluation } = await import(pathToFileURL(`${process.cwd()}/${bundled}`).href);
const report = await runEvaluation();

await mkdir("reports/eval", { recursive: true });
await writeFile("reports/eval/latest.json", report.json, "utf8");
await writeFile("reports/eval/latest.md", report.markdown, "utf8");
await rm(outDir, { recursive: true, force: true });

console.log(report.markdown);
