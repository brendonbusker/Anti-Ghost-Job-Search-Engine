import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

async function main() {
  const options = readModeOptions(process.argv.slice(2));
  const pidPath = path.join(repoRoot, ".codex", options.stateDirectoryName, "pglite.pid");

  try {
    const pidText = await fs.readFile(pidPath, "utf8");
    const pid = Number(pidText.trim());

    if (!Number.isFinite(pid)) {
      throw new Error("Stored PID is invalid.");
    }

    await stopProcess(pid);
    await waitForProcessExit(pid, 5_000);
    await fs.rm(pidPath, { force: true });
    console.log(`Stopped ${options.logLabel} DB process ${pid}.`);
  } catch (error) {
    if (isMissingFile(error)) {
      console.log(`No stored ${options.logLabel} DB PID was found.`);
      return;
    }

    if (isMissingProcess(error)) {
      await fs.rm(pidPath, { force: true });
      console.log(`Stored ${options.logLabel} DB process was not running. Cleared stale PID file.`);
      return;
    }

    const detail = error instanceof Error ? error.message : String(error);
    console.error(`${options.errorLabel} stop failed.\n${detail}`);
    process.exitCode = 1;
  }
}

function readModeOptions(argv) {
  const modeArg = argv.find((arg) => arg.startsWith("--mode="));
  const mode = modeArg?.split("=")[1]?.trim() ?? "review";

  if (mode === "eval") {
    return {
      stateDirectoryName: "eval-db",
      logLabel: "evaluation",
      errorLabel: "Evaluation DB",
    };
  }

  if (mode !== "review") {
    throw new Error(`Unsupported mode: ${mode}. Use --mode=review or --mode=eval.`);
  }

  return {
    stateDirectoryName: "review-db",
    logLabel: "review",
    errorLabel: "Review DB",
  };
}

function isMissingFile(error) {
  return Boolean(error) && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

function isMissingProcess(error) {
  return Boolean(error) && typeof error === "object" && "code" in error && error.code === "ESRCH";
}

async function stopProcess(pid) {
  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      const child = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });

      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0 || code === 128) {
          resolve();
          return;
        }

        reject(new Error(`taskkill exited with code ${code ?? "unknown"}.`));
      });
    });

    return;
  }

  process.kill(pid);
}

async function waitForProcessExit(pid, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessRunning(pid)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !isMissingProcess(error);
  }
}

main();
