import { describe, expect, it } from "vitest";
import type { PermissionRequest } from "../../../src/runtime/contracts";
import { selectQueuedPermission } from "./interactionQueue";

describe("selectQueuedPermission", () => {
  const permissions: PermissionRequest[] = [
    { id: "a", sessionId: "session-a", action: "bash", resources: ["cmd-a"], canRemember: false },
    { id: "b", sessionId: "session-a", action: "bash", resources: ["cmd-b"], canRemember: false },
    { id: "c", sessionId: "session-b", action: "edit", resources: ["file.ts"], canRemember: false }
  ];

  it("returns the first pending request when no active session is set", () => {
    expect(selectQueuedPermission(permissions)?.request.id).toBe("a");
    expect(selectQueuedPermission(permissions)).toEqual({ request: permissions[0], index: 1, total: 3 });
  });

  it("prioritizes the active session while preserving arrival order inside it", () => {
    expect(selectQueuedPermission(permissions, "session-b")?.request.id).toBe("c");
    expect(selectQueuedPermission(permissions, "session-a")?.request.id).toBe("a");
  });
});
