import { CalendarDays } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const directory = new URL("../src-tauri/icons/", import.meta.url);
mkdirSync(directory, { recursive: true });
for (const [file, size, color] of [["icon.png", 1024, "#2c6755"], ["tray.png", 64, "#000000"]]) {
  const svg = renderToStaticMarkup(createElement(CalendarDays, { size, color, strokeWidth: 1.5 }));
  const png = new Resvg(svg).render().asPng();
  writeFileSync(new URL(file, directory), png);
}
execFileSync(process.execPath, [fileURLToPath(new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url)), "icon", fileURLToPath(new URL("icon.png", directory))], { stdio: "inherit" });
for (const folder of ["android", "ios"]) rmSync(new URL(folder, directory), { recursive: true, force: true });
