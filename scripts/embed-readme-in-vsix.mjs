/**
 * 将 VSIX 内 readme.md 的 `media/screenshots/*.png` 转为 data URI。
 * VS Code 扩展详情仅允许 https 外链（见 microsoft/vscode#43173），相对路径无效；
 * data 图片由 markdown 消毒器 allowDataImages 支持（见 vscode-vsce#390、Zenn 私有扩展 README 方案）。
 *
 * @param {string} vsixPath - 已生成的 .vsix 绝对或相对路径
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const vsixArg = process.argv[2];
const vsixPath = vsixArg
  ? path.resolve(vsixArg)
  : (() => {
      const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
      return path.join(root, `opencode-for-vscode-community-${pkg.version}.vsix`);
    })();

const tmp = mkdtempSync(path.join(os.tmpdir(), "vsix-embed-"));
try {
  execFileSync("tar", ["-xf", vsixPath], { cwd: tmp, stdio: "inherit" });

  const readmePath = path.join(tmp, "extension", "readme.md");
  const extRoot = path.join(tmp, "extension");
  let md = readFileSync(readmePath, "utf8");

  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  md = md.replace(imagePattern, (full, alt, url) => {
    if (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")) {
      return full;
    }
    const rel = url.replace(/^\.\//, "");
    if (!rel.startsWith("media/screenshots/") && !rel.startsWith("docs/images/")) {
      return full;
    }
    const abs = path.join(extRoot, rel.replace(/\//g, path.sep));
    const buf = readFileSync(abs);
    const mime = rel.endsWith(".png") ? "image/png" : "image/jpeg";
    const b64 = buf.toString("base64");
    return `![${alt}](data:${mime};base64,${b64})`;
  });

  writeFileSync(readmePath, md);

  const staged = path.join(tmp, "staged.vsix");
  execFileSync("tar", ["-a", "-cf", staged, "-C", tmp, "."], { stdio: "inherit" });
  writeFileSync(vsixPath, readFileSync(staged));
  console.log(`已内嵌 README 截图: ${vsixPath}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
