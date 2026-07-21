import orchestrator from "@/tests/orchestrator.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

async function activatedSession() {
  const createdUser = await orchestrator.createUser();
  const activatedUser = await orchestrator.activateUser(createdUser);
  const withAgenda = await orchestrator.addFeaturesToUser(activatedUser, [
    "use:agenda",
  ]);
  const sessionObject = await orchestrator.createSession(withAgenda);
  return { user: withAgenda, sessionObject };
}

describe("DELETE /api/v1/visits/:visit_id", () => {
  describe("Anonymous user", () => {
    test("Should return 401", async () => {
      const response = await fetch(
        "http:localhost:3000/api/v1/visits/00000000-0000-0000-0000-000000000000",
        { method: "DELETE" },
      );

      expect(response.status).toBe(401);
    });
  });

  describe("Authenticated user", () => {
    test("Owner can delete their own visit", async () => {
      const { user, sessionObject } = await activatedSession();

      const createdVisit = await orchestrator.createVisit({
        created_by: user.id,
      });

      const response = await fetch(
        `http:localhost:3000/api/v1/visits/${createdVisit.id}`,
        {
          method: "DELETE",
          headers: { Cookie: `session_id=${sessionObject.token}` },
        },
      );

      expect(response.status).toBe(200);

      const getResponse = await fetch(
        `http:localhost:3000/api/v1/visits/${createdVisit.id}`,
        { headers: { Cookie: `session_id=${sessionObject.token}` } },
      );
      expect(getResponse.status).toBe(404);
    });

    test("Unrelated user cannot delete another user's visit", async () => {
      const owner = await orchestrator.createUser();

      const { sessionObject } = await activatedSession();

      const createdVisit = await orchestrator.createVisit({
        created_by: owner.id,
      });

      const response = await fetch(
        `http:localhost:3000/api/v1/visits/${createdVisit.id}`,
        {
          method: "DELETE",
          headers: { Cookie: `session_id=${sessionObject.token}` },
        },
      );

      expect(response.status).toBe(403);
    });

    test("Returns 404 for nonexistent visit", async () => {
      const { sessionObject } = await activatedSession();

      const response = await fetch(
        "http:localhost:3000/api/v1/visits/00000000-0000-0000-0000-000000000000",
        {
          method: "DELETE",
          headers: { Cookie: `session_id=${sessionObject.token}` },
        },
      );

      expect(response.status).toBe(404);
    });
  });
});
