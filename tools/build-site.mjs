import { cp, mkdir, writeFile, readdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "_site");
await mkdir(out, { recursive: true });
// Explicit publish allowlist: no research, QA saves, screenshots, or local tooling.
await cp(path.join(root, "public"), out, { recursive: true });
await cp(path.join(root, "src"), path.join(out, "src"), { recursive: true });
await writeFile(path.join(out, ".nojekyll"), "");
const commit =
  process.env.GITHUB_SHA ||
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
await writeFile(
  path.join(out, "build-info.json"),
  JSON.stringify({ commit }, null, 2) + "\n",
);
let count = 0,
  bytes = 0;
async function inspect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${file}`);
    if (entry.isDirectory()) await inspect(file);
    else {
      count++;
      bytes += (await stat(file)).size;
    }
  }
}
await inspect(out);
console.log(
  `Static site: ${count} files, ${(bytes / 1024 / 1024).toFixed(1)} MiB → _site/`,
);
