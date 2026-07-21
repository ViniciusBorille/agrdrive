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

describe("POST /api/v1/visits", () => {
  describe("Anonymous user", () => {
    test("Should return 401", async () => {
      const response = await fetch("http:localhost:3000/api/v1/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Visita" }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe("Authenticated user", () => {
    test("Without the 'use:agenda' feature", async () => {
      const createdUser = await orchestrator.createUser();
      const activatedUser = await orchestrator.activateUser(createdUser);
      const sessionObject = await orchestrator.createSession(activatedUser);

      const response = await fetch("http:localhost:3000/api/v1/visits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${sessionObject.token}`,
        },
        body: JSON.stringify({
          title: "Visita",
          event_date: "2026-06-11",
          start_time: "09:00",
          end_time: "10:00",
        }),
      });

      expect(response.status).toBe(403);
    });

    test("With missing required field 'title'", async () => {
      const { sessionObject } = await activatedSession();

      const response = await fetch("http:localhost:3000/api/v1/visits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${sessionObject.token}`,
        },
        body: JSON.stringify({
          event_date: "2026-06-11",
          start_time: "09:00",
          end_time: "10:00",
        }),
      });

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
    });

    test("With invalid 'event_date' format", async () => {
      const { sessionObject } = await activatedSession();

      const response = await fetch("http:localhost:3000/api/v1/visits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${sessionObject.token}`,
        },
        body: JSON.stringify({
          title: "Visita",
          event_date: "11/06/2026",
          start_time: "09:00",
          end_time: "10:00",
        }),
      });

      expect(response.status).toBe(400);
    });

    test("With invalid 'start_time' format", async () => {
      const { sessionObject } = await activatedSession();

      const response = await fetch("http:localhost:3000/api/v1/visits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${sessionObject.token}`,
        },
        body: JSON.stringify({
          title: "Visita",
          event_date: "2026-06-11",
          start_time: "9h",
          end_time: "10:00",
        }),
      });

      expect(response.status).toBe(400);
    });

    test("With invalid 'type' value", async () => {
      const { sessionObject } = await activatedSession();

      const response = await fetch("http:localhost:3000/api/v1/visits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${sessionObject.token}`,
        },
        body: JSON.stringify({
          title: "Visita",
          event_date: "2026-06-11",
          start_time: "09:00",
          end_time: "10:00",
          type: "INVALIDO",
        }),
      });

      expect(response.status).toBe(400);
    });

    test("With valid data creates an unsynced visit", async () => {
      const { user, sessionObject } = await activatedSession();

      const response = await fetch("http:localhost:3000/api/v1/visits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${sessionObject.token}`,
        },
        body: JSON.stringify({
          title: "Monitoramento de soja",
          client: "Fazenda Santa Rita",
          event_date: "2026-06-11",
          start_time: "08:00",
          end_time: "09:30",
          type: "MONITORAMENTO",
        }),
      });

      expect(response.status).toBe(201);

      const responseBody = await response.json();

      expect(responseBody).toMatchObject({
        title: "Monitoramento de soja",
        client: "Fazenda Santa Rita",
        event_date: "2026-06-11",
        type: "MONITORAMENTO",
        created_by: user.id,
        synced: false,
        google_event_id: null,
      });
    });

    test("With sync=true but Google Calendar not connected still saves locally", async () => {
      const { sessionObject } = await activatedSession();

      const response = await fetch("http:localhost:3000/api/v1/visits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${sessionObject.token}`,
        },
        body: JSON.stringify({
          title: "Visita sem Google conectado",
          event_date: "2026-06-11",
          start_time: "09:00",
          end_time: "10:00",
          sync: true,
        }),
      });

      expect(response.status).toBe(201);

      const responseBody = await response.json();

      expect(responseBody.synced).toBe(false);
      expect(responseBody.google_event_id).toBeNull();
    });
  });
});
