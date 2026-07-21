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

describe("PATCH /api/v1/visits/:visit_id", () => {
  describe("Anonymous user", () => {
    test("Should return 401", async () => {
      const response = await fetch(
        "http:localhost:3000/api/v1/visits/00000000-0000-0000-0000-000000000000",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Novo título" }),
        },
      );

      expect(response.status).toBe(401);
    });
  });

  describe("Authenticated user", () => {
    test("With invalid body (empty object)", async () => {
      const { user, sessionObject } = await activatedSession();

      const createdVisit = await orchestrator.createVisit({
        created_by: user.id,
      });

      const response = await fetch(
        `http:localhost:3000/api/v1/visits/${createdVisit.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObject.token}`,
          },
          body: JSON.stringify({}),
        },
      );

      expect(response.status).toBe(400);
    });

    test("Owner can update title and time", async () => {
      const { user, sessionObject } = await activatedSession();

      const createdVisit = await orchestrator.createVisit({
        created_by: user.id,
        title: "Título original",
      });

      const response = await fetch(
        `http:localhost:3000/api/v1/visits/${createdVisit.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObject.token}`,
          },
          body: JSON.stringify({
            title: "Título atualizado",
            start_time: "11:00",
          }),
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toMatchObject({
        id: createdVisit.id,
        title: "Título atualizado",
        start_time: "11:00:00",
      });
    });

    test("Unrelated user cannot update another user's visit", async () => {
      const owner = await orchestrator.createUser();

      const { sessionObject } = await activatedSession();

      const createdVisit = await orchestrator.createVisit({
        created_by: owner.id,
      });

      const response = await fetch(
        `http:localhost:3000/api/v1/visits/${createdVisit.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObject.token}`,
          },
          body: JSON.stringify({ title: "Tentativa de alteração" }),
        },
      );

      expect(response.status).toBe(403);
    });

    test("Returns 404 for nonexistent visit", async () => {
      const { sessionObject } = await activatedSession();

      const response = await fetch(
        "http:localhost:3000/api/v1/visits/00000000-0000-0000-0000-000000000000",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObject.token}`,
          },
          body: JSON.stringify({ title: "Título" }),
        },
      );

      expect(response.status).toBe(404);
    });
  });
});
