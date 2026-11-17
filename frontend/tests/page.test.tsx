import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectBoard } from "../app/board-view";
import { boardApi } from "./board-api";
let server: ReturnType<typeof boardApi>;
beforeEach(() => { server = boardApi(); vi.stubGlobal("fetch", server.fetch); vi.stubGlobal("confirm", () => true); });
afterEach(() => vi.unstubAllGlobals());
const Home = () => <ProjectBoard user={{ id: 1, username: "user" }} boardId={1} boardName="My Board" onSignedOut={() => {}} onBack={() => {}} />;
it("loads ten saved cards across exactly five columns", async () => {
  render(<Home />);
  await screen.findByRole("button", { name: "Rename Ideas" });
  expect(screen.getAllByRole("region")).toHaveLength(5);
  expect(screen.getAllByRole("article")).toHaveLength(10);
});
it("adds a trimmed title with multiline details to the selected column, then deletes it", async () => {
  const user = userEvent.setup({ delay: null }); render(<Home />);
  await user.click(await screen.findByRole("button", { name: "New card in To do" }));
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
  await user.click(await screen.findByRole("button", { name: "New card in Ideas" }));
  await user.type(screen.getByLabelText("Title"), "   ");
  fireEvent.submit(screen.getByLabelText("Title").closest("form")!);
  expect(screen.getAllByRole("article")).toHaveLength(10);
  await user.keyboard("{Escape}");
  expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
});
it("renames by keyboard, rejects blank names, and cancels edits", async () => {
  const user = userEvent.setup({ delay: null }); render(<Home />);
  await user.click(await screen.findByRole("button", { name: "Rename Ideas" }));
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

it("shows loading without dummy cards, then renders the API board", async () => {
  let resolve!: (response: Response) => void;
  server.fetch.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  render(<Home />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading your board");
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  const saved = server.read();
  saved.board.columns[0].name = "From the server";
  saved.board.columns[0].cards = [];
  await act(async () => resolve(Response.json(saved)));
  expect(screen.getByRole("region", { name: "From the server" })).toBeInTheDocument();
  expect(screen.getAllByRole("article")).toHaveLength(7);
});

it("retries a failed initial board load", async () => {
  const user = userEvent.setup();
  server.fetch.mockRejectedValueOnce(new Error("offline"));
  render(<Home />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load");
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Reload board" }));
  expect(await screen.findAllByRole("article")).toHaveLength(10);
});

it("edits title/details, preserves ID and text, validates blanks, and cancels", async () => {
  const user = userEvent.setup({ delay: null });
  render(<Home />);
  await user.click(await screen.findByRole("button", { name: "Edit A warmer welcome" }));
  await user.clear(screen.getByLabelText("Title"));
  await user.type(screen.getByLabelText("Title"), "   ");
  fireEvent.submit(screen.getByRole("form", { name: "Edit card" }));
  expect(server.fetch.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(0);
  await user.clear(screen.getByLabelText("Title"));
  await user.type(screen.getByLabelText("Title"), "  Revised title  ");
  await user.clear(screen.getByLabelText(/Details/));
  await user.type(screen.getByLabelText(/Details/), "  Café{Enter}Second line  ");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("heading", { name: "Revised title" })).toBeInTheDocument();
  expect(server.read().board.columns[0].cards[0]).toEqual(expect.objectContaining({ id: "c1", title: "Revised title", details: "  Café\nSecond line  " }));
  expect(server.read().revision).toBe(2);
  await user.click(screen.getByRole("button", { name: "Edit Revised title" }));
  await user.type(screen.getByLabelText("Title"), " discarded{Escape}");
  expect(screen.getByRole("heading", { name: "Revised title" })).toBeInTheDocument();
  expect(server.read().revision).toBe(2);
});

it("waits for a save and prevents overlapping writes", async () => {
  const user = userEvent.setup({ delay: null });
  render(<Home />);
  await user.click(await screen.findByRole("button", { name: "Rename Ideas" }));
  await user.clear(screen.getByLabelText("Column name"));
  await user.type(screen.getByLabelText("Column name"), "Waiting");
  let resolve!: (response: Response) => void;
  server.fetch.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  fireEvent.submit(screen.getByLabelText("Column name").closest("form")!);
  expect(screen.getByText("Saving changes...")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Ideas" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "New card in To do" })).toBeDisabled();
  fireEvent.submit(screen.getByLabelText("Column name").closest("form")!);
  expect(server.fetch.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(1);
  const saved = server.read(); saved.revision = 2; saved.board.columns[0].name = "Waiting";
  await act(async () => resolve(Response.json(saved)));
  expect(screen.getByRole("region", { name: "Waiting" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "New card in To do" })).toBeEnabled();
});

it("reloads after a conflict, keeps draft text, and saves only after another submit", async () => {
  const user = userEvent.setup({ delay: null });
  render(<Home />);
  await user.click(await screen.findByRole("button", { name: "Edit A warmer welcome" }));
  await user.clear(screen.getByLabelText("Title"));
  await user.type(screen.getByLabelText("Title"), "My draft");
  const newer = server.read(); newer.revision = 2; newer.board.columns[1].name = "Other tab";
  server.replace(newer);
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("changed elsewhere");
  expect(screen.getByRole("region", { name: "Other tab" })).toBeInTheDocument();
  expect(screen.getByLabelText("Title")).toHaveValue("My draft");
  expect(server.read().revision).toBe(2);
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("heading", { name: "My draft" })).toBeInTheDocument();
  expect(server.read().revision).toBe(3);
  expect(server.read().board.columns[1].name).toBe("Other tab");
});

it("blocks writes when recovery fails and retains the draft until a reload succeeds", async () => {
  const user = userEvent.setup({ delay: null });
  render(<Home />);
  await user.click(await screen.findByRole("button", { name: "New card in Ideas" }));
  await user.type(screen.getByLabelText("Title"), "Keep this draft");
  server.fetch.mockRejectedValueOnce(new Error("lost save response")).mockRejectedValueOnce(new Error("offline"));
  await user.click(screen.getByRole("button", { name: "Add card" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't check whether");
  expect(screen.getByLabelText("Title")).toHaveValue("Keep this draft");
  expect(screen.getByRole("button", { name: "Add card" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Reload board" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Add card" })).toBeEnabled());
  expect(screen.getByLabelText("Title")).toHaveValue("Keep this draft");
  expect(server.read().revision).toBe(1);
  await user.click(screen.getByRole("button", { name: "Add card" }));
  expect(await screen.findByRole("heading", { name: "Keep this draft" })).toBeInTheDocument();
});

it("reconciles a committed save whose response was lost without retrying it", async () => {
  const user = userEvent.setup(); render(<Home />);
  await user.click(await screen.findByRole("button", { name: "Delete A warmer welcome" }));
  // The successful first deletion establishes a saved revision.
  await waitFor(() => expect(server.read().revision).toBe(2));
  server.fetch.mockImplementationOnce(async (_url, options) => {
    const candidate = JSON.parse(options!.body as string);
    server.replace({ ...candidate, revision: candidate.revision + 1 });
    throw new Error("response lost after commit");
  });
  await user.click(screen.getByRole("button", { name: "Delete Small details, big difference" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't confirm");
  expect(screen.getAllByRole("article")).toHaveLength(8);
  expect(server.read().revision).toBe(3);
  expect(server.fetch.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(2);
});

it.each(["load", "save"])("reports authentication loss during board %s", async phase => {
  const signedOut = vi.fn();
  if (phase === "load") server.fetch.mockResolvedValueOnce(Response.json({}, { status: 401 }));
  render(<ProjectBoard user={{ id: 1, username: "user" }} boardId={1} boardName="My Board" onSignedOut={signedOut} onBack={() => {}} />);
  if (phase === "save") {
    await screen.findByRole("button", { name: "Delete A warmer welcome" });
    server.fetch.mockResolvedValueOnce(Response.json({}, { status: 401 }));
    fireEvent.click(screen.getByRole("button", { name: "Delete A warmer welcome" }));
  }
  await waitFor(() => expect(signedOut).toHaveBeenCalledOnce());
});

it("keeps chat paused during a manual save and restores toggle focus on close", async () => {
  const user = userEvent.setup({ delay: null }); render(<Home />);
  await screen.findByRole("button", { name: "Rename Ideas" });
  await user.click(screen.getByRole("button", { name: "AI assistant" }));
  await user.type(screen.getByLabelText("Message your assistant"), "My next request");
  await user.click(screen.getByRole("button", { name: "Rename Ideas" }));
  await user.clear(screen.getByLabelText("Column name"));
  await user.type(screen.getByLabelText("Column name"), "Backlog");
  let finish!: (response: Response) => void;
  server.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  fireEvent.submit(screen.getByLabelText("Column name").closest("form")!);
  expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  await act(async () => finish(Response.json({ ...server.read(), revision: 2 })));
  await user.click(screen.getByRole("button", { name: "Close assistant" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "AI assistant" })).toHaveFocus());
  await user.click(screen.getByRole("button", { name: "AI assistant" }));
  expect(screen.getByLabelText("Message your assistant")).toHaveValue("My next request");
});

it("appends messages on a successful chat response and updates the board", async () => {
  const user = userEvent.setup({ delay: null }); render(<Home />);
  await screen.findByRole("button", { name: "Rename Ideas" });
  await user.click(screen.getByRole("button", { name: "AI assistant" }));
  await user.type(screen.getByLabelText("Message your assistant"), "Move c1 to Done");
  const chatReply = { ...server.read(), revision: 2, reply: "Moved c1 to Done.", updated: true };
  chatReply.board.columns[4].cards.push(chatReply.board.columns[0].cards.shift()!);
  server.fetch.mockImplementationOnce(async () => {
    server.replace({ revision: chatReply.revision, board: chatReply.board });
    return Response.json(chatReply);
  });
  await user.click(screen.getByRole("button", { name: "Send message" }));
  expect(await screen.findByText("Moved c1 to Done.")).toBeInTheDocument();
  expect(screen.getByRole("log")).toHaveTextContent("Move c1 to Done");
  expect(screen.getByRole("log")).toHaveTextContent("Moved c1 to Done.");
  expect(screen.getByLabelText("Message your assistant")).toHaveValue("");
});

it("serializes pending chat with manual writes and recovers a failed transport without a model reply", async () => {
  const user = userEvent.setup({ delay: null }); render(<Home />);
  await screen.findByRole("button", { name: "Rename Ideas" });
  await user.click(screen.getByRole("button", { name: "AI assistant" }));
  await user.type(screen.getByLabelText("Message your assistant"), "Keep this request");
  let fail!: (error: Error) => void;
  server.fetch.mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => { fail = reject; }));
  fireEvent.submit(screen.getByLabelText("Message your assistant").closest("form")!);
  expect(screen.getByRole("button", { name: "Delete A warmer welcome" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  fireEvent.submit(screen.getByLabelText("Message your assistant").closest("form")!);
  expect(server.fetch.mock.calls.filter(([url]) => url === "/api/boards/1/chat")).toHaveLength(1);
  await act(async () => fail(new TypeError("Failed to fetch")));
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't confirm");
  expect(screen.getByLabelText("Message your assistant")).toHaveValue("Keep this request");
  expect(screen.getByRole("button", { name: "Delete A warmer welcome" })).toBeEnabled();
  expect(screen.getByRole("log")).not.toHaveTextContent("Keep this request");
  expect(screen.getAllByRole("article")).toHaveLength(10);
});
