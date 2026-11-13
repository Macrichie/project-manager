import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "jsdom", testTimeout: 20000, include: ["tests/**/*.test.{ts,tsx}"], setupFiles: ["./tests/setup.ts"] } });
