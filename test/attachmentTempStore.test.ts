import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAttachmentTempStore } from "../src/extension/attachmentTempStore.js";

describe("attachmentTempStore", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
    roots.length = 0;
  });

  it("保存、解析并删除临时附件", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "oc-attach-"));
    roots.push(root);
    const store = createAttachmentTempStore(root);
    const saved = await store.save(new TextEncoder().encode("hello"), "image/png", "shot.png");
    expect(store.resolveUri(saved.tempId)).toBeTruthy();
    await store.delete(saved.tempId);
    expect(store.resolveUri(saved.tempId)).toBeUndefined();
  });
});
