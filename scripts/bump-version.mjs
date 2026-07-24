import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.join(root, "package.json");
const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);

if ([major, minor, patch].some((part) => Number.isNaN(part))) {
  throw new Error(`无法解析版本号：${pkg.version}`);
}

pkg.version = `${major}.${minor}.${patch + 1}`;
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`版本已递增为 ${pkg.version}`);
