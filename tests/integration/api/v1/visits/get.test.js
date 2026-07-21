import orchestrator from "@/tests/orchestrator.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

describe("GET /api/v1/visits", () => {
  describe("Anonymous user", () => {
    test("Should return 401", async () => {
      const response = await fetch("http:localhost:3000/api/v1/visits");

      expect(response.status).toBe(401);
    });
  });

  describe("Authenticated user", () => {
    test("Without the 'use:agenda' feature", async () => {
      const createdUser = await orchestrator.createUser();
      const activatedUser = await orchestrator.activateUser(createdUser);
      const sessionObject = await orchestrator.createSession(activatedUser);

      const response = await fetch("http:localhost:3000/api/v1/visits", {
        headers: { Cookie: `session_id=${sessionObject.token}` },
      });

      expect(response.status).toBe(403);
    });

    test("Only returns visits created by the requesting user", async () => {
      const owner = await orchestrator.createUser();
      const activatedOwner = await orchestrator.activateUser(owner);
      await orchestrator.addFeaturesToUser(activatedOwner, ["use:agenda"]);
      const sessionObject = await orchestrator.createSession(activatedOwner);

      const other = await orchestrator.createUser();

      await orchestrator.createVisit({
        created_by: owner.id,
        title: "Minha visita",
      });
      await orchestrator.createVisit({
        created_by: other.id,
        title: "Visita de outra pessoa",
      });

      const response = await fetch("http:localhost:3000/api/v1/visits", {
        headers: { Cookie: `session_id=${sessionObject.token}` },
      });

      expect(response.status).toBe(200);

      const responseBody = await response.json();

      expect(responseBody).toHaveLength(1);
      expect(responseBody[0]).toMatchObject({
        title: "Minha visita",
        created_by: owner.id,
      });
    });

    test("Filters by 'from'/'to' date range", async () => {
      const owner = await orchestrator.createUser();
      const activatedOwner = await orchestrator.activateUser(owner);
      await orchestrator.addFeaturesToUser(activatedOwner, ["use:agenda"]);
      const sessionObject = await orchestrator.createSession(activatedOwner);

      await orchestrator.createVisit({
        created_by: owner.id,
        title: "Dentro do período",
        event_date: "2026-06-15",
      });
      await orchestrator.createVisit({
        created_by: owner.id,
        title: "Fora do período",
        event_date: "2026-07-01",
      });

      const response = await fetch(
        "http:localhost:3000/api/v1/visits?from=2026-06-01&to=2026-06-30",
        { headers: { Cookie: `session_id=${sessionObject.token}` } },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();

      expect(responseBody).toHaveLength(1);
      expect(responseBody[0].title).toBe("Dentro do período");
    });
  });
});
