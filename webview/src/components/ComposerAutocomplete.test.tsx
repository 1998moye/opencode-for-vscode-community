// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ComposerAutocomplete } from "./ComposerAutocomplete";

describe("ComposerAutocomplete", () => {
  it("斜杠补全同时展示技能名与描述", () => {
    render(
      <ComposerAutocomplete
        locale="zh-cn"
        listboxId="assist-list"
        activeIndex={0}
        suggestions={{
          requestId: "req-1",
          trigger: "slash",
          query: "",
          status: "ready",
          displayStatus: "ready",
          items: [{
            id: "skill:code-review",
            kind: "slash-command",
            label: "code-review",
            detail: "Review the changes since a fixed point along two axes",
            insertText: "/code-review "
          }]
        }}
        onSelect={() => undefined}
      />
    );

    expect(screen.getByText("/code-review")).toBeTruthy();
    expect(screen.getByText(/Review the changes since/i)).toBeTruthy();
  });
});
