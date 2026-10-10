import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") throw new Error("macOS is required to package this release.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const config = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
const cargoVersion = readFileSync(join(root, "src-tauri/Cargo.toml"), "utf8").match(/^version = "([^"]+)"/m)?.[1];
const version = manifest.version;
if (config.version !== version || cargoVersion !== version) throw new Error("Source version numbers differ.");
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${version}`) throw new Error("Tag differs from the source version.");
for (const [lock, notice] of [["src-tauri/Cargo.lock", "RUST_DEPENDENCIES.txt"], ["package-lock.json", "NPM_DEPENDENCIES.txt"]]) {
  const hash = createHash("sha256").update(readFileSync(join(root, lock))).digest("hex");
  if (!readFileSync(join(root, "licenses", notice), "utf8").includes(`SHA-256: ${hash}`)) {
    throw new Error(`License notices are stale for ${lock}. Run scripts/generate-license-notices.mjs.`);
  }
}
const bundle = resolve(root, process.argv[2] ?? "src-tauri/target/release/bundle");
const app = join(bundle, "macos", `${config.productName}.app`);
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", cwd: root });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
};
const plist = join(app, "Contents/Info.plist");
if (run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", plist]) !== version) {
  throw new Error("Built application has a different version.");
}
const executable = run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleExecutable", plist]);
const architecture = run("lipo", ["-archs", join(app, "Contents/MacOS", executable)]);
if (architecture !== "arm64") throw new Error(`The first release supports arm64 only, got: ${architecture}`);
if (process.env.RELEASE_ARCH && process.env.RELEASE_ARCH !== architecture) throw new Error("Built architecture differs from the release target.");
run("codesign", ["--verify", "--deep", "--strict", app]);
const diskImages = readdirSync(join(bundle, "dmg")).filter(name => name.endsWith("_aarch64.dmg"));
if (diskImages.length !== 1) throw new Error("Expected exactly one DMG for this architecture; remove old bundle output first.");
const output = join(root, "output/releases", `v${version}`);
mkdirSync(output, { recursive: true });
const base = `Daylight_${version}_macos_${architecture}`;
const dmg = `${base}.dmg`;
const zip = `${base}.zip`;
copyFileSync(join(bundle, "dmg", diskImages[0]), join(output, dmg));
run("hdiutil", ["verify", join(output, dmg)]);
const hashFile = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const verifyPackagedApp = packagedApp => {
  run("codesign", ["--verify", "--deep", "--strict", packagedApp]);
  for (const relative of [
    `Contents/MacOS/${executable}`, "Contents/Info.plist",
    "Contents/Resources/_up_/LICENSE", "Contents/Resources/_up_/THIRD_PARTY_NOTICES.md",
    "Contents/Resources/_up_/licenses/RUST_DEPENDENCIES.txt", "Contents/Resources/_up_/licenses/NPM_DEPENDENCIES.txt",
  ]) {
    if (hashFile(join(packagedApp, relative)) !== hashFile(join(app, relative))) {
      throw new Error(`Packaged content differs from the built application: ${relative}`);
    }
  }
};
const temporary = mkdtempSync(join(tmpdir(), "daylight-release-"));
const mount = join(temporary, "disk");
mkdirSync(mount);
let mounted = false;
try {
  run("hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mount, join(output, dmg)]);
  mounted = true;
  verifyPackagedApp(join(mount, `${config.productName}.app`));
} finally {
  if (mounted) run("hdiutil", ["detach", mount]);
  rmSync(temporary, { recursive: true, force: true });
}
rmSync(join(output, zip), { force: true });
run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, join(output, zip)]);
const extracted = mkdtempSync(join(tmpdir(), "daylight-release-"));
try {
  run("ditto", ["-x", "-k", join(output, zip), extracted]);
  verifyPackagedApp(join(extracted, `${config.productName}.app`));
} finally {
  rmSync(extracted, { recursive: true, force: true });
}
copyFileSync(join(root, "INSTALL.md"), join(output, "INSTALL.md"));
const files = [dmg, zip, "INSTALL.md"];
const checksum = files.map(name => `${createHash("sha256").update(readFileSync(join(output, name))).digest("hex")}  ${name}`).join("\n");
writeFileSync(join(output, "SHA256SUMS.txt"), `${checksum}\n`);
for (const name of [...files, "SHA256SUMS.txt"]) {
  console.log(`${name}: ${(statSync(join(output, name)).size / 1024 / 1024).toFixed(2)} MiB`);
}
console.log(`Release files: ${output}`);
