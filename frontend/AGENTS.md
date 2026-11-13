<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Existing frontend

- This directory contains the client-rendered Next.js App Router demo. Read `../AGENTS.md` and `../docs/PLAN.md` before changes. The plan is approved; follow the recorded phase progress and database approval gate.
- `app/page.tsx` renders `AuthGate` from `app/auth.tsx` and mounts `ProjectBoard` only after server authentication. `auth.tsx` handles sign-in, session restoration/expiry, focus revalidation, and sign-out; tokens stay in an HttpOnly cookie, with no browser storage.
- `app/board-view.tsx` defines `ProjectBoard`, `BoardColumn`, `SortableTaskCard`, and presentational `TaskCard`, holding board, forms, and drag state in React memory. Pointer targeting follows the pointer location; keyboard arrows follow card/column order so the rotated overlay does not misdirect navigation. Unmounting the board on logout or authentication loss discards its state.
- `app/board.ts` defines `Card` and `Column`, seeds ten cards in five columns, and exports `moveCard`. Its optional destination index supports immutable reordering within a column and insertion between columns.
- Existing features: column renaming, adding/deleting cards, and moving/reordering cards through dnd-kit pointer and keyboard sensors. Cards use `useSortable` inside one `SortableContext` per column; the drag overlay is presentational. Editing cards is planned, not implemented.
- Authentication uses the FastAPI `/api/auth/login`, `/api/auth/me`, and `/api/auth/logout` endpoints. The board still resets on refresh or logout; board persistence and AI chat are not implemented.
- `app/globals.css` supplies the existing visual design and responsive board layout. `app/layout.tsx` supplies the root layout; `public/` contains static assets.
- Dependencies include React, TypeScript, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, and `lucide-react`. Preserve the existing design and reuse these tools where suitable.

## Existing verification

- `tests/board.test.ts`: unit coverage for ordering within columns, insertion at specific positions between columns, empty targets, unchanged/invalid moves, and preservation of unrelated data.
- `tests/page.test.tsx`: component coverage for initial data, adding/deleting, validation, cancellation, and renaming. Setup is in `tests/setup.ts`; configuration is in `vitest.config.mts`.
- `tests/auth.test.tsx` covers session gating/restoration, sign-in errors, connectivity recovery, logout failure, authentication loss, and expiry. `e2e/auth.spec.ts` verifies the actual browser/server login/logout flow and session revocation. Board browser tests sign in through the server before exercising the board.
- `e2e/board.spec.ts`: Playwright workflows, pointer dragging/cancel, keyboard movement, mobile touch dragging, and layout captures.
- `playwright.config.ts` runs desktop and mobile Chromium projects against an isolated development server on port 3100, with one worker and a 60-second per-test budget for cold development-server runs. It refuses to reuse an occupied port; override with `PLAYWRIGHT_PORT`, or set `PLAYWRIGHT_BASE_URL` to test an already running deployment. The launch command supports Windows and Unix.
- `playwright.scaffold.config.ts` and `e2e-scaffold/` test the deployed board, asset loading, API boundaries, API documentation, and health/hello aliases in the running container on port 8000. Run `npx playwright test --config playwright.scaffold.config.ts`.
- Run from `frontend/`: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test:e2e` (requires Playwright Chromium).
- `npm run dev` launches the development server and proxies `/api/*` to the running FastAPI backend on port 8000. Production `npm run build` uses `output: "export"`, producing `out/` without server-only cache/prefetch or proxy settings. The Docker Node build stage copies this export into the Python image; production runs FastAPI without a Next.js runtime server.
- Test files describe intended checks; consult recorded run results before claiming they pass. Update demo reset expectations when persistence is implemented.
