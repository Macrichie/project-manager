import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import Home from "../app/page";
import { boardApi } from "./board-api";

const session = { user: { id: 1, username: "user" }, expires_in: 28800 };
const sessionResponse = () => Response.json(session);
const signedOutResponse = () => Response.json({ detail: "Sign in to continue" }, { status: 401 });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("keeps the board hidden while checking and restores a valid session", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", boardApi(vi.fn(() => new Promise<Response>(done => { resolve = done; }))).fetch);
  render(<Home />);
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Opening your workspace");
  await act(async () => resolve(sessionResponse()));
  expect(screen.getAllByRole("article")).toHaveLength(10);
});

it("shows invalid credentials, signs in with the server response, and signs out", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn().mockResolvedValueOnce(signedOutResponse())
    .mockResolvedValueOnce(Response.json({ detail: "Incorrect username or password" }, { status: 401 }))
    .mockResolvedValueOnce(sessionResponse()).mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", boardApi(fetchMock).fetch);
  render(<Home />);
  await user.type(await screen.findByLabelText("Username"), "user");
  await user.type(screen.getByLabelText("Password"), "wrong");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect username or password");
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText("Password")); await user.type(screen.getByLabelText("Password"), "password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await user.click(await screen.findByRole("button", { name: "Sign out" }));
  expect(await screen.findByLabelText("Username")).toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ body: JSON.stringify({ username: "user", password: "password" }) }));
});

it("offers retry when the initial session check fails and handles login network errors", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(signedOutResponse()).mockRejectedValueOnce(new Error("offline"));
  vi.stubGlobal("fetch", boardApi(fetchMock).fetch);
  render(<Home />);
  await user.click(await screen.findByRole("button", { name: "Try again" }));
  await user.type(await screen.findByLabelText("Username"), "user");
  await user.type(screen.getByLabelText("Password"), "password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("couldn't reach the server");
});

it("discards board state when the server reports a lost session on focus", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn().mockResolvedValueOnce(sessionResponse());
  vi.stubGlobal("fetch", boardApi(fetchMock).fetch);
  render(<Home />);
  await user.click(await screen.findByRole("button", { name: "Rename Ideas" }));
  await user.clear(screen.getByLabelText("Column name"));
  await user.type(screen.getByLabelText("Column name"), "Changed{Enter}");
  fetchMock.mockResolvedValueOnce(signedOutResponse());
  fireEvent(window, new Event("focus"));
  expect(await screen.findByLabelText("Username")).toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  fetchMock.mockResolvedValueOnce(sessionResponse());
  await user.type(screen.getByLabelText("Username"), "user"); await user.type(screen.getByLabelText("Password"), "password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("button", { name: "Rename Changed" })).toBeInTheDocument();
});

it("keeps the current board available when logout fails", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", boardApi(vi.fn().mockResolvedValueOnce(sessionResponse()).mockRejectedValueOnce(new Error("offline"))).fetch);
  render(<Home />);
  await user.click(await screen.findByRole("button", { name: "Sign out" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign out");
  expect(screen.getAllByRole("article")).toHaveLength(10);
});

it("removes the board when its session expires", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", boardApi(vi.fn().mockResolvedValueOnce(sessionResponse())).fetch);
  await act(async () => { render(<Home />); });
  expect(screen.getAllByRole("article")).toHaveLength(10);
  await act(async () => { await vi.advanceTimersByTimeAsync(28800001); });
  expect(screen.getByLabelText("Username")).toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
});
