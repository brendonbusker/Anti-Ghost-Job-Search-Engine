import { disconnectPrisma } from "@anti-ghost/database";
import { enrichCompaniesAndBackfillOfficialSources } from "../company-enrichment";

async function main() {
  const summary = await enrichCompaniesAndBackfillOfficialSources();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`Company enrichment failed.\n${detail}`);
  process.exitCode = 1;
}).finally(async () => {
  await disconnectPrisma();
});
