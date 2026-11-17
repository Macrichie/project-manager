import { vi } from "vitest";
import { initialBoard } from "../app/board";
import type { BoardDocument } from "../app/use-board";

export function boardApi(fallback = vi.fn()) {
  let document: BoardDocument = { revision: 1, board: { columns: structuredClone(initialBoard) } };
  const boardsList = [{ id: 1, name: "My Board", description: "", card_count: 10, updated_at: Date.now() / 1000 }];
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    // Multi-board endpoints
    if (url === "/api/boards" && (!options?.method || options.method === "GET")) {
      return Response.json(boardsList);
    }
    const boardMatch = url.match(/^\/api\/boards\/(\d+)$/);
    if (boardMatch) {
      if (options?.method === "PUT") {
        const candidate: BoardDocument = JSON.parse(options.body as string);
        if (candidate.revision !== document.revision) return Response.json({}, { status: 409 });
        document = { ...candidate, revision: document.revision + 1 };
      }
      return Response.json(document);
    }
    const chatMatch = url.match(/^\/api\/boards\/(\d+)\/chat$/);
    if (chatMatch) {
      return fallback(url, options);
    }
    // Legacy endpoint
    if (url === "/api/board") {
      if (options?.method === "PUT") {
        const candidate: BoardDocument = JSON.parse(options.body as string);
        if (candidate.revision !== document.revision) return Response.json({}, { status: 409 });
        document = { ...candidate, revision: document.revision + 1 };
      }
      return Response.json(document);
    }
    return fallback(url, options);
  });
  return { fetch, read: () => structuredClone(document), replace: (next: BoardDocument) => { document = next; } };
}
