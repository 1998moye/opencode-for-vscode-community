import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ContextItem } from "../runtime/contracts.js";

const TEMP_TTL_MS = 24 * 60 * 60 * 1000;

interface TempRecord {
  tempId: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  createdAt: number;
}

export interface AttachmentTempStore {
  save(bytes: Uint8Array, mime: string, filename: string): Promise<TempRecord & { uri: string }>;
  resolveUri(tempId: string): string | undefined;
  delete(tempId: string): Promise<void>;
  deleteForItem(item: ContextItem): Promise<void>;
  cleanupExpired(): Promise<{ removed: number; failed: number }>;
}

/**
 * 在扩展私有目录管理剪贴板/拖放附件的临时文件。
 */
export function createAttachmentTempStore(rootDirectory: string): AttachmentTempStore {
  const root = path.join(rootDirectory, "opencode-attachments");
  const manifestPath = path.join(root, "manifest.json");
  let manifest = new Map<string, TempRecord>();

  const load = async (): Promise<void> => {
    await fs.mkdir(root, { recursive: true });
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      const parsed = JSON.parse(raw) as TempRecord[];
      manifest = new Map(parsed.map((entry) => [entry.tempId, entry]));
    } catch {
      manifest = new Map();
    }
  };

  const persist = async (): Promise<void> => {
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(manifestPath, JSON.stringify([...manifest.values()], null, 2), "utf8");
  };

  const filePathFor = (tempId: string, filename: string): string => path.join(root, `${tempId}-${filename}`);

  return {
    async save(bytes, mime, filename) {
      await load();
      if (bytes.byteLength > 0) {
        // size checked by caller
      }
      const tempId = randomUUID();
      const record: TempRecord = {
        tempId,
        filename,
        mime,
        sizeBytes: bytes.byteLength,
        createdAt: Date.now()
      };
      const absolute = filePathFor(tempId, filename);
      await fs.writeFile(absolute, bytes);
      manifest.set(tempId, record);
      await persist();
      return { ...record, uri: absolute };
    },
    resolveUri(tempId) {
      const record = manifest.get(tempId);
      if (!record) {
        return undefined;
      }
      return filePathFor(tempId, record.filename);
    },
    async delete(tempId) {
      await load();
      const record = manifest.get(tempId);
      if (!record) {
        return;
      }
      manifest.delete(tempId);
      await persist();
      try {
        await fs.unlink(filePathFor(tempId, record.filename));
      } catch {
        // 清理失败可诊断，但不泄露路径
      }
    },
    async deleteForItem(item) {
      if (item.source.type === "attachment-temp") {
        await this.delete(item.source.tempId);
      }
    },
    async cleanupExpired() {
      await load();
      const now = Date.now();
      let removed = 0;
      let failed = 0;
      for (const [tempId, record] of [...manifest.entries()]) {
        if (now - record.createdAt < TEMP_TTL_MS) {
          continue;
        }
        try {
          await this.delete(tempId);
          removed += 1;
        } catch {
          failed += 1;
        }
      }
      return { removed, failed };
    }
  };
}
