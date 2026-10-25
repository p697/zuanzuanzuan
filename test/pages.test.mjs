import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { assetURL, resolveAssetPaths } from "../src/paths.js";
const publicRoot = new URL("../public/", import.meta.url);
test("根路径与 GitHub 项目路径都能解析数据、图片、声音和剧情；外部链接保持不变", () => {
  for (const root of [
    "https://example.com/",
    "https://p697.github.io/zuanzuanzuan/",
  ]) {
    assert.equal(
      assetURL("/data/original.json", root),
      root + "data/original.json",
    );
    const raw = {
      frames: ["/assets/a.png"],
      sound: "/assets/sounds/a.mp3",
      movie: { src: "/movies/zh-CN/opening.mp4" },
      external: "https://example.org/a",
      fps: 30,
    };
    const result = resolveAssetPaths(raw, root);
    assert.equal(result.frames[0], root + "assets/a.png");
    assert.equal(result.sound, root + "assets/sounds/a.mp3");
    assert.equal(result.movie.src, root + "movies/zh-CN/opening.mp4");
    assert.equal(result.external, raw.external);
    assert.equal(result.fps, 30);
    assert.equal(raw.frames[0], "/assets/a.png");
  }
});
test("发布页面和样式不依赖域名根目录，完整资源清单的文件均存在", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8"),
    css = await readFile(new URL("style.css", publicRoot), "utf8");
  assert.ok(!/(?:href|src)="\//.test(html));
  assert.ok(!/url\(["']?\//.test(css));
  const paths = new Set();
  function collect(value) {
    if (typeof value === "string" && value.startsWith("/")) paths.add(value);
    else if (value && typeof value === "object")
      Object.values(value).forEach(collect);
  }
  for (const name of ["assets/manifest.json", "data/movies.json"])
    collect(JSON.parse(await readFile(new URL(name, publicRoot))));
  for (const match of css.matchAll(/url\(["']?(\.\/assets\/[^"')]+)["']?\)/g))
    paths.add(match[1].slice(1));
  for (const name of paths)
    assert.ok((await stat(new URL(name.slice(1), publicRoot))).isFile(), name);
  assert.ok(paths.size > 1000);
});
