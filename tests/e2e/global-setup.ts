import { beforeAll, afterAll } from "vitest";

beforeAll(async () => {
  const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3001";
  try {
    const res = await fetch(`${baseUrl}/api/health`);
    if (!res.ok) throw new Error(`Health check returned ${res.status}`);
  } catch (err) {
    throw new Error(
      `Test server not reachable at ${baseUrl}. Start it with: npm run test:e2e:server\n${err}`
    );
  }

  const { seedTestData } = await import("./helpers/seed");
  await seedTestData();
}, 30_000);

afterAll(async () => {
  const { cleanupTestData } = await import("./helpers/cleanup");
  await cleanupTestData();
}, 30_000);
