import { defineConfig } from "vitest/config"
import { config as loadEnv } from "dotenv"
import path from "node:path"

loadEnv({ path: path.resolve(__dirname, ".env.test"), quiet: true })

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    globalSetup: ["./src/test/global-setup.ts"],
    setupFiles: ["./src/test/setup.ts"],
    pool: "forks",
    singleFork: true,
    fileParallelism: false,
    include: ["src/**/*.test.ts", "app/**/*.test.ts"],
  },
})
