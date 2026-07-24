// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenCodeState } from "../../../src/runtime/contracts";
import { QuestionCenter } from "./QuestionCenter";

const dispatch = vi.fn();
vi.mock("../store", () => ({
  useChatStore: (selector: (store: { dispatch: typeof dispatch }) => unknown) => selector({ dispatch })
}));

afterEach(cleanup);

describe("QuestionCenter", () => {
  it("renders OpenCode question options and sends the selected answer only after confirmation", () => {
    dispatch.mockClear();
    render(<QuestionCenter state={questionState()} />);

    expect(screen.getByText("Can I check the code?")).toBeTruthy();
    expect(screen.getByText("Start review")).toBeTruthy();
    expect(screen.getByText("Not now")).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Confirm choice" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Start review/ }));
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);

    expect(dispatch).toHaveBeenCalledWith({
      type: "respond-question", requestId: "question-1", answers: [["Start review"]]
    });
  });

  it("方向键切换选项后 Enter 可提交", async () => {
    dispatch.mockClear();
    const { container } = render(<QuestionCenter state={questionState()} />);
    const card = container.querySelector(".question-card");
    expect(card).toBeTruthy();
    const firstOption = screen.getAllByRole("button", { name: /Start review/ })[0]!;
    firstOption.focus();
    fireEvent.keyDown(card!, { key: "ArrowDown" });
    const second = screen.getAllByRole("button", { name: /Not now/ })[0]!;
    expect(document.activeElement).toBe(second);
    fireEvent.click(second);
    await act(async () => {});
    fireEvent.keyDown(second, { key: "Enter" });
    expect(dispatch).toHaveBeenCalledWith({
      type: "respond-question",
      requestId: "question-1",
      answers: [["Not now"]]
    });
  });
});

function questionState(): OpenCodeState {
  return {
    locale: "en",
    sessions: [{ id: "session-1", title: "Review", directory: "D:\\demo", updatedAt: 1 }],
    questions: [{
      id: "question-1", sessionId: "session-1",
      questions: [{
        header: "Review", question: "Can I check the code?", multiple: false,
        options: [
          { label: "Start review", description: "Check the code now" },
          { label: "Not now", description: "Skip the review" }
        ]
      }]
    }]
  } as OpenCodeState;
}
