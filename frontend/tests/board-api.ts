import { vi } from "vitest";
import { initialBoard } from "../app/board";
import type { BoardDocument } from "../app/use-board";

export function boardApi(fallback = vi.fn()) {
  let document: BoardDocument = { revision: 1, board: { columns: structuredClone(initialBoard) } };
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (url !== "/api/board") return fallback(url, options);
    if (options?.method === "PUT") {
      const candidate: BoardDocument = JSON.parse(options.body as string);
      if (candidate.revision !== document.revision) return Response.json({}, { status: 409 });
      document = { ...candidate, revision: document.revision + 1 };
    }
    return Response.json(document);
  });
  return { fetch, read: () => structuredClone(document), replace: (next: BoardDocument) => { document = next; } };
}
