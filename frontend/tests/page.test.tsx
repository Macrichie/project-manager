import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { ProjectBoard } from "../app/board-view";
const Home = () => <ProjectBoard user={{ id: 1, username: "user" }} onSignedOut={() => {}} />;
it("starts with ten cards across exactly five columns", () => {
  render(<Home />);
  expect(screen.getAllByRole("region")).toHaveLength(5);
  expect(screen.getAllByRole("article")).toHaveLength(10);
});
it("adds a trimmed title with multiline details to the selected column, then deletes it", async () => {
  const user = userEvent.setup({ delay: null }); render(<Home />);
  await user.click(screen.getByRole("button", { name: "New card in To do" }));
  await user.type(screen.getByLabelText("Title"), "  A new task  ");
  await user.type(screen.getByLabelText(/Details/), "Line one{Enter}Line two");
  await user.click(screen.getByRole("button", { name: "Add card" }));
  const column = screen.getByRole("region", { name: "To do" });
  expect(within(column).getByRole("heading", { name: "A new task" })).toBeInTheDocument();
  expect(within(column).getByText(/Line one/).textContent).toBe("Line one\nLine two");
  expect(screen.getAllByRole("article")).toHaveLength(11);
  await user.click(screen.getByRole("button", { name: "Delete A new task" }));
  expect(screen.getAllByRole("article")).toHaveLength(10);
});
it("rejects whitespace and cancels a card form without changing cards", async () => {
  const user = userEvent.setup({ delay: null }); render(<Home />);
  await user.click(screen.getByRole("button", { name: "New card in Ideas" }));
  await user.type(screen.getByLabelText("Title"), "   ");
  fireEvent.submit(screen.getByLabelText("Title").closest("form")!);
  expect(screen.getAllByRole("article")).toHaveLength(10);
  await user.keyboard("{Escape}");
  expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
});
it("renames by keyboard, rejects blank names, and cancels edits", async () => {
  const user = userEvent.setup({ delay: null }); render(<Home />);
  await user.click(screen.getByRole("button", { name: "Rename Ideas" }));
  await user.clear(screen.getByLabelText("Column name"));
  await user.type(screen.getByLabelText("Column name"), "   ");
  fireEvent.submit(screen.getByLabelText("Column name").closest("form")!);
  expect(screen.getByRole("region", { name: "Ideas" })).toBeInTheDocument();
  await user.clear(screen.getByLabelText("Column name"));
  await user.type(screen.getByLabelText("Column name"), "  Backlog  {Enter}");
  expect(screen.getByRole("region", { name: "Backlog" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Rename Backlog" }));
  await user.type(screen.getByLabelText("Column name"), " changed{Escape}");
  expect(screen.getByRole("button", { name: "Rename Backlog" })).toBeInTheDocument();
  expect(screen.getAllByRole("region")).toHaveLength(5);
});
