import { disconnectPrisma } from "@anti-ghost/database";
import path from "node:path";
import { access } from "node:fs/promises";

import { parseSourceSyncBatchPlan, runSourceSyncBatchPlan } from "../batch-orchestration";

async function main() {
  const configPaths = readConfigPathsFromArgs();

  if (configPaths.length === 0) {
    throw new Error("Pass one or more sync config paths with --configs=<path1,path2,...> or repeated --config=<path>.");
  }

  const plan = parseSourceSyncBatchPlan(
    await Promise.all(configPaths.map((configPath) => resolveConfigPath(configPath))),
  );
  const summary = await runSourceSyncBatchPlan(plan);

  console.log(JSON.stringify(summary, null, 2));
}

function readConfigPathsFromArgs(): string[] {
  const repeatedConfigs = process.argv
    .filter((arg) => arg.startsWith("--config="))
    .map((arg) => arg.split("=")[1] ?? "")
    .filter(Boolean);
  const combinedArg = process.argv.find((arg) => arg.startsWith("--configs="));
  const combinedConfigs = combinedArg
    ? (combinedArg.split("=")[1] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  return [...repeatedConfigs, ...combinedConfigs];
}

async function resolveConfigPath(configPath: string): Promise<string> {
  const cwdResolved = path.resolve(configPath);

  if (await fileExists(cwdResolved)) {
    return cwdResolved;
  }

  if (path.isAbsolute(configPath)) {
    return cwdResolved;
  }

  const initCwd = process.env.INIT_CWD;

  if (initCwd) {
    const initResolved = path.resolve(initCwd, configPath);

    if (await fileExists(initResolved)) {
      return initResolved;
    }
  }

  return cwdResolved;
}

async function fileExists(value: string): Promise<boolean> {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await disconnectPrisma();
});
