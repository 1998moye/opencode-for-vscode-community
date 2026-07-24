/**
 * 在 git push 不可用（443 阻断）时，通过 GitHub REST Git API 推送当前索引中的文件。
 * 依赖：`gh auth token` 已登录且具备 repo 写权限。
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const owner = "1998moye";
const repo = "opencode-for-vscode-community";
const branch = "main";

const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
if (!token) {
  throw new Error("gh auth token 为空，请先 gh auth login");
}

const api = async (method, endpoint, body) => {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${endpoint} ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
};

const listFiles = () => {
  const out = execFileSync(
    "git",
    ["-c", `safe.directory=${root.replace(/\\/g, "/")}`, "ls-files", "-z"],
    { cwd: root },
  );
  return out
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((p) => p.replace(/^"|"$/g, ""));
};

const createBlob = async (filePath) => {
  const abs = path.join(root, filePath);
  const buf = readFileSync(abs);
  const encoding = "base64";
  const content = buf.toString("base64");
  const blob = await api("POST", `/repos/${owner}/${repo}/git/blobs`, { content, encoding });
  return { path: filePath.replace(/\\/g, "/"), mode: "100644", type: "blob", sha: blob.sha };
};

const run = async () => {
  let parentSha = null;
  try {
    const ref = await api("GET", `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    const commit = await api("GET", `/repos/${owner}/${repo}/git/commits/${ref.object.sha}`);
    parentSha = commit.sha;
    console.log(`已有分支 ${branch}，基于 ${parentSha.slice(0, 7)} 追加提交`);
  } catch (e) {
    const msg = String(e.message);
    if (!msg.includes("404") && !msg.includes("409") && !msg.includes("empty")) {
      throw e;
    }
    const readmePath = path.join(root, "README.md");
    const readmeB64 = readFileSync(readmePath).toString("base64");
    const init = await api("PUT", `/repos/${owner}/${repo}/contents/README.md`, {
      message: "chore: bootstrap repository",
      content: readmeB64,
    });
    parentSha = init.commit.sha;
    console.log(`空仓库已初始化，commit ${parentSha.slice(0, 7)}`);
  }

  const files = listFiles();
  console.log(`上传 ${files.length} 个文件…`);

  const concurrency = 8;
  const treeItems = [];
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const items = await Promise.all(batch.map((f) => createBlob(f)));
    treeItems.push(...items);
    console.log(`  blob ${Math.min(i + concurrency, files.length)}/${files.length}`);
  }

  const tree = await api("POST", `/repos/${owner}/${repo}/git/trees`, { tree: treeItems });
  const commit = await api("POST", `/repos/${owner}/${repo}/git/commits`, {
    message: "chore: sync source via GitHub API (agent push fallback)",
    tree: tree.sha,
    parents: [parentSha],
  });

  await api("PATCH", `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    sha: commit.sha,
    force: true,
  });
  console.log(`已更新分支 ${branch} -> ${commit.sha.slice(0, 7)}`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
