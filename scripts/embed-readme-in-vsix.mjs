/**
 * 将 VSIX 内 readme.md 的 `media/screenshots/*.png` 转为 data URI。
 * VSIX 为 ZIP 格式，必须用 ZIP API 原地更新，不可用 tar 重打包。
 *
 * @param {string} [vsixPath] - 已生成的 .vsix 路径，默认当前 package 版本
 */
import AdmZip from "adm-zip";
import { readFileSync } from "node:fs";
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

const zip = new AdmZip(vsixPath);
const readmeEntry = zip.getEntry("extension/readme.md");
if (!readmeEntry) {
  throw new Error("VSIX 中缺少 extension/readme.md");
}

let md = readmeEntry.getData().toString("utf8");
const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;

md = md.replace(imagePattern, (full, alt, url) => {
  if (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")) {
    return full;
  }
  const rel = url.replace(/^\.\//, "");
  if (!rel.startsWith("media/screenshots/") && !rel.startsWith("docs/images/")) {
    return full;
  }
  const entryName = `extension/${rel.replace(/\\/g, "/")}`;
  const imgEntry = zip.getEntry(entryName);
  if (!imgEntry) {
    throw new Error(`VSIX 中缺少图片: ${entryName}`);
  }
  const buf = imgEntry.getData();
  const mime = rel.endsWith(".png") ? "image/png" : "image/jpeg";
  const b64 = buf.toString("base64");
  return `![${alt}](data:${mime};base64,${b64})`;
});

zip.updateFile("extension/readme.md", Buffer.from(md, "utf8"));
zip.writeZip(vsixPath);
console.log(`已内嵌 README 截图: ${vsixPath}`);
