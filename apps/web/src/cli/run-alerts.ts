import { disconnectPrisma } from "@anti-ghost/database";

import { executeDueAlerts } from "../lib/alert-execution";

async function main() {
  const userId = readArgValue("--user=");
  const summary = await executeDueAlerts(
    userId
      ? {
          userId,
        }
      : {},
  );

  console.log(JSON.stringify(summary, null, 2));
}

function readArgValue(prefix: string): string | undefined {
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

main()
  .catch((error) => {
    const detail = error instanceof Error ? error.message : "Unknown alert-run error.";
    console.error(`Alert run failed. Confirm DATABASE_URL and local Postgres availability.\n${detail}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
