import { execSync } from "node:child_process"

export default async function globalSetup() {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl || !dbUrl.includes("art_app_test")) {
    throw new Error(
      `DATABASE_URL must point to art_app_test (got: ${dbUrl ?? "undefined"}). ` +
        `Check that .env.test is loaded and docker-compose -f docker-compose.test.yml up -d is running.`
    )
  }

  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: "inherit",
    })
  } catch {
    throw new Error(
      "Failed to sync schema to test DB. Is the test Postgres running? " +
        "Run: npm run test:db:up"
    )
  }
}
