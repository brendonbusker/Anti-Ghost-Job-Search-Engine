import { disconnectPrisma } from "@anti-ghost/database";
import { persistAdapterResult } from "../persistence";
import { syncLeverSite } from "../sources/lever";

async function main() {
  const site = readSiteFromArgs();

  if (!site) {
    throw new Error("Pass a Lever site slug with --site=<slug>.");
  }

  const result = await syncLeverSite({
    site,
  });

  const persisted = await persistAdapterResult(result);

  console.log(
    JSON.stringify(
      {
        site,
        sourceId: persisted.sourceId,
        createdCount: persisted.createdCount,
        updatedCount: persisted.updatedCount,
        deactivatedCount: persisted.deactivatedCount,
      },
      null,
      2,
    ),
  );
}

function readSiteFromArgs(): string | undefined {
  const siteArg = process.argv.find((arg) => arg.startsWith("--site="));
  return siteArg?.split("=")[1];
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await disconnectPrisma();
});
