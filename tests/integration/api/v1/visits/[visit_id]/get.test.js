import orchestrator from "@/tests/orchestrator.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

describe("GET /api/v1/visits/:visit_id", () => {
  describe("Anonymous user", () => {
    test("Should return 401", async () => {
      const response = await fetch(
        "http:localhost:3000/api/v1/visits/00000000-0000-0000-0000-000000000000",
      );

      expect(response.status).toBe(401);
    });
  });

  describe("Authenticated user", () => {
    test("Owner can view their own visit", async () => {
      const owner = await orchestrator.createUser();
      const activatedOwner = await orchestrator.activateUser(owner);
      await orchestrator.addFeaturesToUser(activatedOwner, ["use:agenda"]);
      const sessionObject = await orchestrator.createSession(activatedOwner);

      const createdVisit = await orchestrator.createVisit({
        created_by: owner.id,
      });

      const response = await fetch(
        `http:localhost:3000/api/v1/visits/${createdVisit.id}`,
        { headers: { Cookie: `session_id=${sessionObject.token}` } },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.id).toBe(createdVisit.id);
    });

    test("Unrelated user cannot view another user's visit", async () => {
      const owner = await orchestrator.createUser();

      const unrelated = await orchestrator.createUser();
      const activatedUnrelated = await orchestrator.activateUser(unrelated);
      await orchestrator.addFeaturesToUser(activatedUnrelated, ["use:agenda"]);
      const sessionObject =
        await orchestrator.createSession(activatedUnrelated);

      const createdVisit = await orchestrator.createVisit({
        created_by: owner.id,
      });

      const response = await fetch(
        `http:localhost:3000/api/v1/visits/${createdVisit.id}`,
        { headers: { Cookie: `session_id=${sessionObject.token}` } },
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "Você não tem acesso a esta visita.",
        action: "Somente o criador pode visualizar a visita.",
        status_code: 403,
      });
    });

    test("Returns 404 for nonexistent visit", async () => {
      const createdUser = await orchestrator.createUser();
      const activatedUser = await orchestrator.activateUser(createdUser);
      await orchestrator.addFeaturesToUser(activatedUser, ["use:agenda"]);
      const sessionObject = await orchestrator.createSession(activatedUser);

      const response = await fetch(
        "http:localhost:3000/api/v1/visits/00000000-0000-0000-0000-000000000000",
        { headers: { Cookie: `session_id=${sessionObject.token}` } },
      );

      expect(response.status).toBe(404);
    });
  });
});
