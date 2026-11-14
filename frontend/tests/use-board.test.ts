import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useBoard } from "../app/use-board";
import { boardApi } from "./board-api";

let server: ReturnType<typeof boardApi>;
const signedOut = vi.fn();
beforeEach(() => { server = boardApi(); vi.stubGlobal("fetch", server.fetch); });
afterEach(() => { vi.unstubAllGlobals(); signedOut.mockReset(); });

function renderBoard() {
  return renderHook(() => useBoard(signedOut));
}

it("loads board on mount and exposes columns", async () => {
  const { result } = renderBoard();
  await waitFor(() => expect(result.current.board).toBeDefined());
  expect(result.current.board).toHaveLength(5);
  expect(result.current.pending).toBe(false);
  expect(result.current.blocked).toBe(false);
});

it("saves changes and updates revision", async () => {
  const { result } = renderBoard();
  await waitFor(() => expect(result.current.board).toBeDefined());
  const updated = result.current.board!.map(c => c.id === "ideas" ? { ...c, name: "Backlog" } : c);
  let success: boolean;
  await act(async () => { success = await result.current.save(updated); });
  expect(success!).toBe(true);
  expect(result.current.board![0].name).toBe("Backlog");
  expect(server.read().revision).toBe(2);
});

it("skips save when columns are structurally unchanged", async () => {
  const { result } = renderBoard();
  await waitFor(() => expect(result.current.board).toBeDefined());
  const callsBefore = server.fetch.mock.calls.filter(([, o]) => o?.method === "PUT").length;
  let success: boolean;
  await act(async () => { success = await result.current.save([...result.current.board!]); });
  expect(success!).toBe(true);
  const callsAfter = server.fetch.mock.calls.filter(([, o]) => o?.method === "PUT").length;
  expect(callsAfter).toBe(callsBefore);
});

it("blocks concurrent saves via writing mutex", async () => {
  const { result } = renderBoard();
  await waitFor(() => expect(result.current.board).toBeDefined());
  let resolveFirst!: (response: Response) => void;
  server.fetch.mockImplementationOnce(() => new Promise<Response>(r => { resolveFirst = r; }));
  const columns1 = result.current.board!.map(c => c.id === "ideas" ? { ...c, name: "First" } : c);
  const columns2 = result.current.board!.map(c => c.id === "ideas" ? { ...c, name: "Second" } : c);
  let first: Promise<boolean>;
  await act(async () => { first = result.current.save(columns1); });
  let second: boolean;
  await act(async () => { second = await result.current.save(columns2); });
  expect(second!).toBe(false);
  const saved = server.read(); saved.revision = 2; saved.board.columns[0].name = "First";
  await act(async () => resolveFirst(Response.json(saved)));
  expect(await first!).toBe(true);
});

it("recovers after a 409 conflict", async () => {
  const { result } = renderBoard();
  await waitFor(() => expect(result.current.board).toBeDefined());
  const newer = server.read();
  newer.revision = 2;
  newer.board.columns[0].name = "Remote change";
  server.replace(newer);
  const stale = result.current.board!.map(c => c.id === "ideas" ? { ...c, name: "My change" } : c);
  let success: boolean;
  await act(async () => { success = await result.current.save(stale); });
  expect(success!).toBe(false);
  expect(result.current.error).toContain("changed elsewhere");
  expect(result.current.board![0].name).toBe("Remote change");
});

it("calls onSignedOut when load returns 401", async () => {
  server.fetch.mockResolvedValueOnce(Response.json({}, { status: 401 }));
  renderBoard();
  await waitFor(() => expect(signedOut).toHaveBeenCalledOnce());
});
