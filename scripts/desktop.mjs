import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

// Support both the rustup installer and Homebrew's keg-only rustup without changing shell profiles.
const environment = { ...process.env };
const rustPaths = [join(homedir(), ".cargo", "bin")];
if (process.platform === "darwin") {
  rustPaths.push("/opt/homebrew/opt/rustup/bin", "/usr/local/opt/rustup/bin");
  const xcode = "/Applications/Xcode.app/Contents/Developer";
  if (!environment.DEVELOPER_DIR && existsSync(xcode)) environment.DEVELOPER_DIR = xcode;
}
environment.PATH = [...rustPaths.filter(existsSync), environment.PATH || ""].join(delimiter);
const argumentsToRun = process.argv.slice(2);
if (!argumentsToRun.length) argumentsToRun.push("--help");
const cli = fileURLToPath(new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url));
const result = spawnSync(process.execPath, [cli, ...argumentsToRun], { stdio: "inherit", env: environment });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
