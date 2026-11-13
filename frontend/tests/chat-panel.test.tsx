import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ChatPanel } from "../app/chat-panel";

const base = { open: true, onClose: vi.fn(), busy: false, messages: [], pendingMessage: null, error: "", onSend: async () => false };

it("focuses the composer, validates blank messages, and supports multiline input and Escape", async () => {
  const user = userEvent.setup(); const send = vi.fn(async () => false); const close = vi.fn();
  render(<ChatPanel {...base} onSend={send} onClose={close} />);
  const input = screen.getByLabelText("Message your assistant");
  expect(input).toHaveFocus();
  expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  await user.type(input, "   "); await user.keyboard("{Enter}"); expect(send).not.toHaveBeenCalled();
  await user.clear(input); await user.type(input, "First line{Shift>}{Enter}{/Shift}Second line");
  expect(input).toHaveValue("First line\nSecond line");
  await user.keyboard("{Enter}"); expect(send).toHaveBeenCalledWith("First line\nSecond line");
  await user.keyboard("{Escape}"); expect(close).toHaveBeenCalledOnce();
});

it("shows pending/error states and retains a failed draft", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<ChatPanel {...base} />);
  await user.type(screen.getByLabelText("Message your assistant"), "Keep my draft");
  await user.click(screen.getByRole("button", { name: "Send message" }));
  expect(screen.getByLabelText("Message your assistant")).toHaveValue("Keep my draft");
  rerender(<ChatPanel {...base} busy pendingMessage="Keep my draft" />);
  expect(screen.getByRole("status")).toHaveTextContent("Thinking through");
  expect(screen.getByLabelText("Message your assistant")).toBeDisabled();
  rerender(<ChatPanel {...base} error="AI returned invalid board data. No changes were saved" />);
  expect(screen.getByRole("alert")).toHaveTextContent("No changes were saved");
  expect(screen.getByLabelText("Message your assistant")).toHaveValue("Keep my draft");
});

it("clears only an accepted draft and preserves conversation while the panel is hidden", async () => {
  let finish!: (accepted: boolean) => void;
  const onSend = () => new Promise<boolean>(resolve => { finish = resolve; });
  const { rerender, unmount } = render(<ChatPanel {...base} onSend={onSend} />);
  fireEvent.change(screen.getByLabelText("Message your assistant"), { target: { value: "Accepted request" } });
  fireEvent.submit(screen.getByLabelText("Message your assistant").closest("form")!);
  expect(screen.getByLabelText("Message your assistant")).toHaveValue("Accepted request");
  await act(async () => finish(true));
  await waitFor(() => expect(screen.getByLabelText("Message your assistant")).toHaveValue(""));
  const messages = [{ role: "user" as const, content: "Earlier question" }];
  rerender(<ChatPanel {...base} messages={messages} open={false} />);
  expect(screen.queryByRole("log")).not.toBeInTheDocument();
  rerender(<ChatPanel {...base} messages={messages} />);
  expect(screen.getByRole("log")).toHaveTextContent("Earlier question");
  unmount(); render(<ChatPanel {...base} />);
  expect(screen.getByRole("log")).not.toHaveTextContent("Earlier question");
});
