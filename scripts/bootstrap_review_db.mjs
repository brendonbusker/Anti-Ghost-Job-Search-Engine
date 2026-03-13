import fs from "node:fs/promises";
import { closeSync, openSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const bootstrapSqlPath = path.join(repoRoot, "packages", "database", "prisma", "bootstrap.sql");
const pgliteServerPath = path.join(
  repoRoot,
  "node_modules",
  "@electric-sql",
  "pglite-socket",
  "dist",
  "scripts",
  "server.js",
);
const packagesDatabaseDir = path.join(repoRoot, "packages", "database");

async function main() {
  const options = readModeOptions(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL ?? options.defaultDatabaseUrl;
  const stateDir = path.join(repoRoot, ".codex", options.stateDirectoryName);
  const dataDir = path.join(stateDir, "pglite-data");
  const pidPath = path.join(stateDir, "pglite.pid");
  const logPath = path.join(stateDir, "pglite.log");

  await fs.mkdir(stateDir, { recursive: true });

  const connectionInfo = parseConnectionString(databaseUrl);
  const connectionCheck = await tryConnect(databaseUrl);

  if (connectionCheck.ok) {
    console.log(`Using existing ${options.logLabel} database at ${connectionInfo.host}:${connectionInfo.port}.`);
  } else if (isConnectionRefused(connectionCheck.error)) {
    await startPgliteServer(connectionInfo, dataDir, pidPath, logPath, options.pgliteDebugLevel);
    await waitForDatabase(databaseUrl, 20_000);
    console.log(`Started local ${options.logLabel} pglite database at ${connectionInfo.host}:${connectionInfo.port}.`);
  } else {
    throw new Error(
      `Could not connect to ${connectionInfo.host}:${connectionInfo.port}: ${formatError(connectionCheck.error)}`,
    );
  }

  await generateBootstrapSql();
  const hasSchema = await checkSchemaPresent(databaseUrl);

  if (!hasSchema) {
    await applyBootstrapSql(databaseUrl);
    console.log("Applied schema bootstrap SQL.");
  } else {
    console.log("Schema already present; skipping bootstrap SQL.");
  }

  await applySchemaUpgrades(databaseUrl);
  console.log("Applied additive schema upgrades for the current phase.");

  if (options.seedReviewData) {
    await runRepoCommand("npm", ["run", "seed:review-data", "--workspace", "@anti-ghost/scoring"], {
      DATABASE_URL: databaseUrl,
    });
  }

  if (options.printScoreReport) {
    console.log("");
    console.log("Current score report:");
    await runRepoCommand("npm", ["run", "score:report", "--workspace", "@anti-ghost/scoring", "--", "--limit=5"], {
      DATABASE_URL: databaseUrl,
    });
  }

  console.log("");
  console.log(`${options.readyLabel} ready.`);
  console.log(`DATABASE_URL=${databaseUrl}`);
  console.log(`PGLITE_LOG=${logPath}`);
}

async function tryConnect(connectionString) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 1_500,
  });

  try {
    await client.connect();
    await client.query("select 1");
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error };
  } finally {
    try {
      await client.end();
    } catch {}
  }
}

async function waitForDatabase(connectionString, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await tryConnect(connectionString);
    if (result.ok) {
      return;
    }

    await sleep(500);
  }

  throw new Error("Timed out waiting for the local review database to accept connections.");
}

async function startPgliteServer(connectionInfo, dataDir, pidPath, logPath, debugLevel) {
  await fs.appendFile(
    logPath,
    `[${new Date().toISOString()}] Starting pglite server on ${connectionInfo.host}:${connectionInfo.port}\n`,
    "utf8",
  );
  const logFile = openSync(logPath, "a");
  const child = spawn(
    process.execPath,
    [
      pgliteServerPath,
      `--db=${toPortablePath(dataDir)}`,
      `--host=${connectionInfo.host}`,
      `--port=${String(connectionInfo.port)}`,
      `--debug=${String(debugLevel)}`,
    ],
    {
      cwd: repoRoot,
      detached: true,
      stdio: ["ignore", logFile, logFile],
    },
  );

  closeSync(logFile);
  child.unref();
  await fs.writeFile(pidPath, String(child.pid), "utf8");
}

async function generateBootstrapSql() {
  await runRepoCommand(
    "npx",
    ["prisma", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script", "-o", "prisma/bootstrap.sql"],
    {},
    packagesDatabaseDir,
  );
}

async function checkSchemaPresent(connectionString) {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    const result = await client.query("select to_regclass('public.canonical_jobs') as table_name");
    return Boolean(result.rows[0]?.table_name);
  } finally {
    await client.end();
  }
}

async function applyBootstrapSql(connectionString) {
  const sql = await fs.readFile(bootstrapSqlPath, "utf8");
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function applySchemaUpgrades(connectionString) {
  const sql = `
    ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "primary_domain_confidence" DOUBLE PRECISION;
    ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "careers_url_confidence" DOUBLE PRECISION;
    ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "enrichment_evidence_json" JSONB;
    ALTER TABLE "canonical_jobs" ADD COLUMN IF NOT EXISTS "official_source_method" TEXT;
    ALTER TABLE "canonical_jobs" ADD COLUMN IF NOT EXISTS "official_source_evidence_json" JSONB;
    DO $$
    BEGIN
      CREATE TYPE "CanonicalReviewType" AS ENUM ('MERGE_QUALITY', 'OFFICIAL_SOURCE', 'SCORE_CALIBRATION', 'GENERAL_NOTE');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END
    $$;
    DO $$
    BEGIN
      CREATE TYPE "CanonicalReviewDisposition" AS ENUM ('CONFIRMED', 'INCORRECT', 'NEEDS_FOLLOW_UP');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END
    $$;
    DO $$
    BEGIN
      CREATE TYPE "AlertRunStatus" AS ENUM ('SUCCESS', 'ERROR');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END
    $$;
    DO $$
    BEGIN
      CREATE TYPE "AlertRunTrigger" AS ENUM ('MANUAL', 'DUE_BATCH');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END
    $$;
    CREATE TABLE IF NOT EXISTS "canonical_job_reviews" (
      "id" TEXT NOT NULL,
      "canonical_job_id" TEXT NOT NULL,
      "review_type" "CanonicalReviewType" NOT NULL,
      "disposition" "CanonicalReviewDisposition" NOT NULL,
      "summary" TEXT NOT NULL,
      "details" TEXT,
      "reviewer_name" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "canonical_job_reviews_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "canonical_job_reviews_canonical_job_id_fkey" FOREIGN KEY ("canonical_job_id") REFERENCES "canonical_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE INDEX IF NOT EXISTS "canonical_job_reviews_canonical_job_id_created_at_idx"
      ON "canonical_job_reviews"("canonical_job_id", "created_at" DESC);
    CREATE INDEX IF NOT EXISTS "canonical_job_reviews_review_type_disposition_created_at_idx"
      ON "canonical_job_reviews"("review_type", "disposition", "created_at" DESC);
    CREATE TABLE IF NOT EXISTS "saved_search_snapshots" (
      "id" TEXT NOT NULL,
      "saved_search_id" TEXT NOT NULL,
      "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "matched_job_count" INTEGER NOT NULL,
      "apply_now_count" INTEGER NOT NULL,
      "apply_soon_count" INTEGER NOT NULL,
      "official_source_count" INTEGER NOT NULL,
      "matched_job_ids_json" JSONB NOT NULL,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "saved_search_snapshots_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "saved_search_snapshots_saved_search_id_fkey" FOREIGN KEY ("saved_search_id") REFERENCES "saved_searches"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE INDEX IF NOT EXISTS "saved_search_snapshots_saved_search_id_checked_at_idx"
      ON "saved_search_snapshots"("saved_search_id", "checked_at" DESC);
    CREATE TABLE IF NOT EXISTS "alert_runs" (
      "id" TEXT NOT NULL,
      "alert_id" TEXT NOT NULL,
      "saved_search_snapshot_id" TEXT,
      "trigger" "AlertRunTrigger" NOT NULL,
      "status" "AlertRunStatus" NOT NULL,
      "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completed_at" TIMESTAMP(3),
      "matched_job_count" INTEGER NOT NULL DEFAULT 0,
      "new_matches_count" INTEGER NOT NULL DEFAULT 0,
      "dropped_matches_count" INTEGER NOT NULL DEFAULT 0,
      "apply_now_count" INTEGER NOT NULL DEFAULT 0,
      "apply_soon_count" INTEGER NOT NULL DEFAULT 0,
      "official_source_count" INTEGER NOT NULL DEFAULT 0,
      "error_message" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "alert_runs_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "alert_runs_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "alert_runs_saved_search_snapshot_id_fkey" FOREIGN KEY ("saved_search_snapshot_id") REFERENCES "saved_search_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
    CREATE INDEX IF NOT EXISTS "alert_runs_alert_id_started_at_idx"
      ON "alert_runs"("alert_id", "started_at" DESC);
    CREATE INDEX IF NOT EXISTS "alert_runs_status_started_at_idx"
      ON "alert_runs"("status", "started_at" DESC);
    CREATE TABLE IF NOT EXISTS "user_sessions" (
      "id" TEXT NOT NULL,
      "user_id" TEXT NOT NULL,
      "session_token" TEXT NOT NULL,
      "expires_at" TIMESTAMP(3) NOT NULL,
      "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "user_sessions_session_token_key"
      ON "user_sessions"("session_token");
    CREATE INDEX IF NOT EXISTS "user_sessions_user_id_expires_at_idx"
      ON "user_sessions"("user_id", "expires_at");
    CREATE INDEX IF NOT EXISTS "user_sessions_expires_at_idx"
      ON "user_sessions"("expires_at");
  `;

  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function runRepoCommand(command, args, extraEnv, cwd = repoRoot) {
  const useShell = process.platform === "win32" && (command === "npm" || command === "npx");
  const executable = useShell ? "cmd.exe" : command;
  const commandArgs = useShell ? ["/d", "/s", "/c", command, ...args] : args;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(executable, commandArgs, {
      cwd,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}.`));
    });
  });

  return result;
}

function readModeOptions(argv) {
  const mode = readModeArg(argv);

  if (mode === "eval") {
    return {
      defaultDatabaseUrl:
        "postgresql://postgres:postgres@127.0.0.1:5433/anti_ghost_jobs_eval?schema=public&connection_limit=1",
      stateDirectoryName: "eval-db",
      seedReviewData: false,
      printScoreReport: false,
      logLabel: "evaluation",
      readyLabel: "Evaluation DB",
      pgliteDebugLevel: Number(process.env.ANTI_GHOST_PGLITE_DEBUG ?? "0"),
    };
  }

  return {
    defaultDatabaseUrl:
      "postgresql://postgres:postgres@127.0.0.1:5432/anti_ghost_jobs?schema=public&connection_limit=1",
    stateDirectoryName: "review-db",
    seedReviewData: true,
    printScoreReport: true,
    logLabel: "review",
    readyLabel: "Review DB",
    pgliteDebugLevel: Number(process.env.ANTI_GHOST_PGLITE_DEBUG ?? "0"),
  };
}

function readModeArg(argv) {
  const modeArg = argv.find((arg) => arg.startsWith("--mode="));
  const mode = modeArg?.split("=")[1]?.trim();

  if (!mode || mode === "review" || mode === "eval") {
    return mode ?? "review";
  }

  throw new Error(`Unsupported mode: ${mode}. Use --mode=review or --mode=eval.`);
}

function parseConnectionString(connectionString) {
  const url = new URL(connectionString);

  return {
    host: url.hostname || "127.0.0.1",
    port: Number(url.port || "5432"),
  };
}

function isConnectionRefused(error) {
  return Boolean(error) && typeof error === "object" && "code" in error && error.code === "ECONNREFUSED";
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function toPortablePath(value) {
  return value.replaceAll(path.sep, "/");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`Local DB bootstrap failed.\n${detail}`);
  process.exitCode = 1;
});
