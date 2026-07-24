import { describe, expect, it, vi } from "vitest";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import { fetchSkills, normalizeOpenCodeDirectory } from "../src/backend/gateway/fetchSkills.js";

describe("fetchSkills", () => {
  it("优先使用 app.skills，与 CLI 一样向上扫描父目录技能", async () => {
    const appSkills = vi.fn().mockResolvedValue({
      data: [
        { name: "grilling", description: "Grill the user", location: "x", content: "" },
        { name: "to-prd", description: "Turn conversation into PRD", location: "y", content: "" }
      ]
    });
    const v2List = vi.fn().mockResolvedValue({ data: { data: [] } });
    const client = {
      app: { skills: appSkills },
      v2: { skill: { list: v2List } }
    } as unknown as OpencodeClient;

    const skills = await fetchSkills(client, "D:\\repo\\pkg");

    expect(skills.map((skill) => skill.name)).toEqual(["grilling", "to-prd"]);
    expect(appSkills).toHaveBeenCalledWith({ directory: "D:/repo/pkg" });
    expect(v2List).not.toHaveBeenCalled();
  });

  it("app.skills 为空时回退到 v2.skill.list", async () => {
    const appSkills = vi.fn().mockResolvedValue({ data: [] });
    const v2List = vi.fn().mockResolvedValue({
      data: {
        data: [{ name: "init", description: "Init project", location: "z", content: "" }]
      }
    });
    const client = {
      app: { skills: appSkills },
      v2: { skill: { list: v2List } }
    } as unknown as OpencodeClient;

    const skills = await fetchSkills(client, "/repo");

    expect(skills).toEqual([{ name: "init", description: "Init project" }]);
    expect(v2List).toHaveBeenCalledWith({ location: { directory: "/repo" } });
  });

  it("app.skills 失败时回退到 v2.skill.list", async () => {
    const appSkills = vi.fn().mockRejectedValue(new Error("unsupported"));
    const v2List = vi.fn().mockResolvedValue({
      data: {
        data: [{ name: "view", description: "View", location: "z", content: "" }]
      }
    });
    const client = {
      app: { skills: appSkills },
      v2: { skill: { list: v2List } }
    } as unknown as OpencodeClient;

    const skills = await fetchSkills(client, "/repo");

    expect(skills).toEqual([{ name: "view", description: "View" }]);
  });
});

describe("normalizeOpenCodeDirectory", () => {
  it("将 Windows 路径转为正斜杠", () => {
    expect(normalizeOpenCodeDirectory("D:\\repo\\pkg")).toBe("D:/repo/pkg");
  });
});
