import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogSnapshotSchema } from "@/contracts";
import { getDevelopmentFixtures } from "@/dev/fixtures";
import { GET } from "@/app/api/dev/fixtures/route";

afterEach(() => vi.unstubAllEnvs());

describe("development fixture isolation", () => {
  it.each([
    ["production", "true"], ["production", "false"], ["test", "true"],
    ["development", "false"], ["development", "TRUE"], ["development", ""],
  ])("hides fixtures for NODE_ENV=%s and flag=%s", async (nodeEnv, flag) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("ENABLE_DEV_FIXTURES", flag);
    expect(getDevelopmentFixtures()).toBeNull();
    expect(GET().status).toBe(404);
  });

  it("provides explicit synthetic examples only when both development conditions hold", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_FIXTURES", "true");
    const fixtures = getDevelopmentFixtures();
    expect(fixtures?.kind).toBe("synthetic-development-fixtures");
    expect(catalogSnapshotSchema.safeParse(fixtures?.catalog).success).toBe(true);
    expect(fixtures?.catalog.sources[0].url).toContain("example.invalid");
    expect(fixtures?.catalog.pairings[0].relationship).toBe("suggested");
    expect(GET().status).toBe(200);
  });
});
