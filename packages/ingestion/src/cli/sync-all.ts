import { disconnectPrisma } from "@anti-ghost/database";
import path from "node:path";
import { access } from "node:fs/promises";

import { loadSourceSyncPlan, runSourceSyncPlan } from "../orchestration";

async function main() {
  const configPath = readConfigPathFromArgs();

  if (!configPath) {
    throw new Error("Pass a sync config path with --config=<path>.");
  }

  const plan = await loadSourceSyncPlan(await resolveConfigPath(configPath));
  const summary = await runSourceSyncPlan(plan);

  console.log(JSON.stringify(summary, null, 2));
}

function readConfigPathFromArgs(): string | undefined {
  const configArg = process.argv.find((arg) => arg.startsWith("--config="));
  return configArg?.split("=")[1];
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
