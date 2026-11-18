import { test as base, expect } from "@playwright/test";
import seed from "../../docs/board.example.json";

// Each serial board/auth workflow starts from the seed and restores its saved data.
export const test = base.extend<{ boardData: void; autoAcceptDialogs: void }>({
  autoAcceptDialogs: [async ({ page }, runTest) => {
    page.on("dialog", dialog => dialog.accept());
    await runTest();
  }, { auto: true }],
  boardData: [async ({ request }, runTest) => {
    expect((await request.post("/api/auth/login", { data: { username: "user", password: "password" } })).status()).toBe(200);
    const original = await (await request.get("/api/board")).json();
    expect((await request.put("/api/board", { data: { revision: original.revision, board: seed } })).status()).toBe(200);
    try { await runTest(); }
    finally {
      await request.post("/api/auth/login", { data: { username: "user", password: "password" } });
      const current = await (await request.get("/api/board")).json();
      expect((await request.put("/api/board", { data: { revision: current.revision, board: original.board } })).status()).toBe(200);
      // Clean up extra boards created during test (for the default user)
      const boards: { id: number }[] = await (await request.get("/api/boards")).json();
      for (const board of boards) {
        if (board.id !== 1) await request.delete(`/api/boards/${board.id}`);
      }
      // Note: extra users created by registration tests are cleaned up per-test
    }
  }, { auto: true }],
});
export { expect };
