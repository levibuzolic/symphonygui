import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const mainBundlePath = resolve(process.cwd(), "dist-electron/index.cjs");
const preloadBundlePath = resolve(process.cwd(), "dist-electron/preload.cjs");
const staleMainBundlePath = resolve(process.cwd(), "dist-electron/index.js");
const stalePreloadBundlePath = resolve(process.cwd(), "dist-electron/preload.mjs");
const packageJsonPath = resolve(process.cwd(), "package.json");

const mainBundle = readFileSync(mainBundlePath, "utf8");
const preloadBundle = readFileSync(preloadBundlePath, "utf8");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

const forbiddenFallback = 'Calling `require` for "process"';

if (mainBundle.includes(forbiddenFallback) || preloadBundle.includes(forbiddenFallback)) {
  throw new Error('Electron bundle still contains the ESM require fallback for "process".');
}

if (!mainBundle.includes("exports") && !mainBundle.includes("module.exports")) {
  throw new Error("Electron main bundle was not emitted as CommonJS.");
}

if (packageJson.type === "module") {
  throw new Error(
    'Root package.json cannot use "type": "module" while Electron main is emitted as CommonJS.',
  );
}

for (const staleArtifactPath of [staleMainBundlePath, stalePreloadBundlePath]) {
  try {
    readFileSync(staleArtifactPath, "utf8");
    throw new Error(`Stale Electron artifact present: ${staleArtifactPath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

const syntaxCheck = spawnSync(process.execPath, ["--check", mainBundlePath], { encoding: "utf8" });

if (syntaxCheck.status !== 0) {
  throw new Error(
    `Electron main bundle failed CommonJS syntax check:\n${syntaxCheck.stderr || syntaxCheck.stdout}`,
  );
}

console.log("Electron bundle verification passed.");
