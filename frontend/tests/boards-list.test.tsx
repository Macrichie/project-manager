import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BoardsList } from "../app/boards-list";

const boards = [
  { id: 1, name: "Sprint 1", description: "First sprint", card_count: 5, updated_at: Date.now() / 1000 },
  { id: 2, name: "Backlog", description: "", card_count: 12, updated_at: Date.now() / 1000 - 3600 },
];

function setup(overrides?: { fetchMock?: ReturnType<typeof vi.fn> }) {
  const onSignedOut = vi.fn();
  const onSelectBoard = vi.fn();
  const fetchMock = overrides?.fetchMock ?? vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/boards" && (!options?.method || options.method === "GET")) {
      return Response.json(boards);
    }
    if (url.match(/^\/api\/boards\/\d+$/) && options?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    if (url.match(/^\/api\/boards\/\d+$/) && options?.method === "PATCH") {
      const body = JSON.parse(options.body as string);
      return Response.json({ id: 1, name: body.name ?? "Sprint 1", description: body.description ?? "", updated_at: Date.now() / 1000 });
    }
    if (url === "/api/boards" && options?.method === "POST") {
      return Response.json({ id: 3, name: "New Board", description: "" }, { status: 201 });
    }
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", () => true);
  const user = { id: 1, username: "testuser" };
  return { onSignedOut, onSelectBoard, fetchMock, user: userEvent.setup(), props: { user, onSignedOut, onSelectBoard } };
}

afterEach(() => vi.unstubAllGlobals());

it("renders board cards after loading", async () => {
  const { props } = setup();
  render(<BoardsList {...props} />);
  expect(await screen.findByText("Sprint 1")).toBeInTheDocument();
  expect(screen.getByText("Backlog")).toBeInTheDocument();
  expect(screen.getByText("5 cards")).toBeInTheDocument();
  expect(screen.getByText("12 cards")).toBeInTheDocument();
});

it("shows loading state", async () => {
  const { props } = setup();
  render(<BoardsList {...props} />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading your boards");
  await screen.findByText("Sprint 1");
});

it("navigates to board on click", async () => {
  const { props, user } = setup();
  render(<BoardsList {...props} />);
  const boardCard = await screen.findByText("Sprint 1");
  await user.click(boardCard.closest("[role=button]")!);
  expect(props.onSelectBoard).toHaveBeenCalledWith(1);
});

it("creates a new board", async () => {
  const { props, user } = setup();
  render(<BoardsList {...props} />);
  await screen.findByText("Sprint 1");
  await user.click(screen.getByRole("button", { name: "Create new board" }));
  await user.type(screen.getByPlaceholderText("e.g. Sprint 1"), "New Board");
  await user.click(screen.getByRole("button", { name: /Create board/ }));
  // Should reload boards
  await waitFor(() => expect(screen.getByText("Sprint 1")).toBeInTheDocument());
});

it("shows error when board list fails to load", async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline"));
  const { props } = setup({ fetchMock });
  render(<BoardsList {...props} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your boards");
});

it("handles 401 by calling onSignedOut", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 401 }));
  const { props } = setup({ fetchMock });
  render(<BoardsList {...props} />);
  await waitFor(() => expect(props.onSignedOut).toHaveBeenCalled());
});

it("deletes a board after confirmation", async () => {
  const { props, user, fetchMock } = setup();
  render(<BoardsList {...props} />);
  await screen.findByText("Sprint 1");
  await user.click(screen.getByRole("button", { name: "Delete Sprint 1" }));
  await waitFor(() => {
    const deleteCalls = fetchMock.mock.calls.filter((call: unknown[]) => {
      const [url, opts] = call as [string, RequestInit | undefined];
      return url.match(/\/api\/boards\/1$/) && opts?.method === "DELETE";
    });
    expect(deleteCalls).toHaveLength(1);
  });
});

it("shows board description when available", async () => {
  const { props } = setup();
  render(<BoardsList {...props} />);
  expect(await screen.findByText("First sprint")).toBeInTheDocument();
});
