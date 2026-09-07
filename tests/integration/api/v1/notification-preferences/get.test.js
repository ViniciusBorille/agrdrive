import orchestrator from "@/tests/orchestrator.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

async function authenticate(features) {
  const created = await orchestrator.createUser();
  const activated = await orchestrator.activateUser(created);
  if (features) {
    await orchestrator.addFeaturesToUser(activated, features);
  }
  const sessionObject = await orchestrator.createSession(activated);
  return { user: activated, sessionObject };
}

async function getPreferences(sessionObject) {
  return await fetch("http:localhost:3000/api/v1/notification-preferences", {
    headers: { Cookie: `session_id=${sessionObject.token}` },
  });
}

describe("GET /api/v1/notification-preferences", () => {
  describe("Anonymous user", () => {
    test("Should return 401", async () => {
      const response = await fetch(
        "http:localhost:3000/api/v1/notification-preferences",
      );

      expect(response.status).toBe(401);
    });
  });

  describe("Authenticated user", () => {
    // Quem não tem o módulo não deve nem ver o tipo: oferecer aviso de
    // compromisso a quem não abre a agenda é ruído.
    test("Only sees types whose module feature it has", async () => {
      const { sessionObject } = await authenticate();

      const response = await getPreferences(sessionObject);
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      const types = responseBody.map((preference) => preference.type);

      expect(types).toContain("TASK_DUE");
      expect(types).toContain("TASK_ASSIGNED");
      expect(types).not.toContain("VISIT_UPCOMING");
    });

    test("Sees the agenda type after gaining the feature", async () => {
      const { sessionObject } = await authenticate(["use:agenda"]);

      const responseBody = await (await getPreferences(sessionObject)).json();
      const types = responseBody.map((preference) => preference.type);

      expect(types).toContain("VISIT_UPCOMING");
    });

    // Sem isto, a tela precisaria de uma escrita antes de conseguir
    // mostrar qualquer coisa.
    test("Falls back to the catalog defaults without a previous write", async () => {
      const { sessionObject } = await authenticate();

      const responseBody = await (await getPreferences(sessionObject)).json();
      const taskDue = responseBody.find(
        (preference) => preference.type === "TASK_DUE",
      );

      expect(taskDue.enabled).toBe(true);
      expect(taskDue.send_at_time).toBe("08:00");
      expect(taskDue.reminders).toEqual([4320, 1440]);
    });

    test("Carries label, description and limits for the screen", async () => {
      const { sessionObject } = await authenticate();

      const responseBody = await (await getPreferences(sessionObject)).json();
      const taskDue = responseBody.find(
        (preference) => preference.type === "TASK_DUE",
      );

      expect(typeof taskDue.label).toBe("string");
      expect(typeof taskDue.description).toBe("string");
      expect(taskDue.limits).toEqual({
        max_reminders: 5,
        min_offset_minutes: 60,
        max_offset_minutes: 43200,
      });
    });

    test("Reflects what was saved", async () => {
      const { sessionObject } = await authenticate();

      await fetch(
        "http:localhost:3000/api/v1/notification-preferences/TASK_DUE",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObject.token}`,
          },
          body: JSON.stringify({
            enabled: false,
            send_at_time: "19:45",
            reminders: [2880],
          }),
        },
      );

      const responseBody = await (await getPreferences(sessionObject)).json();
      const taskDue = responseBody.find(
        (preference) => preference.type === "TASK_DUE",
      );

      expect(taskDue.enabled).toBe(false);
      expect(taskDue.send_at_time).toBe("19:45");
      expect(taskDue.reminders).toEqual([2880]);
    });
  });
});
