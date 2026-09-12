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
  return await orchestrator.createSession(activated);
}

async function put(sessionObject, type, body) {
  return await fetch(
    `http:localhost:3000/api/v1/notification-preferences/${type}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_id=${sessionObject.token}`,
      },
      body: JSON.stringify(body),
    },
  );
}

const VALIDO = { enabled: true, send_at_time: "08:00", reminders: [1440] };

describe("PUT /api/v1/notification-preferences/:type", () => {
  describe("Anonymous user", () => {
    test("Should return 401", async () => {
      const response = await fetch(
        "http:localhost:3000/api/v1/notification-preferences/TASK_DUE",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(VALIDO),
        },
      );

      expect(response.status).toBe(401);
    });
  });

  describe("Authenticated user", () => {
    test("Replaces the whole configuration of the type", async () => {
      const sessionObject = await authenticate();

      const response = await put(sessionObject, "TASK_DUE", {
        enabled: true,
        send_at_time: "07:30",
        reminders: [10080, 1440, 60],
      });

      expect(response.status).toBe(200);

      const responseBody = await response.json();

      expect(responseBody.enabled).toBe(true);
      expect(responseBody.send_at_time).toBe("07:30");
      // Do mais distante para o mais próximo, que é a ordem em que os
      // avisos acontecem.
      expect(responseBody.reminders).toEqual([10080, 1440, 60]);
    });

    // Substituição, não mesclagem: o que não veio no corpo desaparece.
    test("Dropped reminders really disappear", async () => {
      const sessionObject = await authenticate();

      await put(sessionObject, "TASK_DUE", {
        enabled: true,
        send_at_time: "08:00",
        reminders: [4320, 1440, 60],
      });

      const response = await put(sessionObject, "TASK_DUE", {
        enabled: true,
        send_at_time: "08:00",
        reminders: [1440],
      });

      const responseBody = await response.json();
      expect(responseBody.reminders).toEqual([1440]);
    });

    describe("Rejects invalid input", () => {
      const casos = [
        [
          "repeated reminders",
          { enabled: true, send_at_time: "08:00", reminders: [1440, 1440] },
        ],
        [
          "below the minimum offset",
          { enabled: true, send_at_time: "08:00", reminders: [30] },
        ],
        [
          "above the maximum offset",
          { enabled: true, send_at_time: "08:00", reminders: [100000] },
        ],
        [
          "more reminders than allowed",
          {
            enabled: true,
            send_at_time: "08:00",
            reminders: [60, 120, 180, 240, 300, 360],
          },
        ],
        [
          "invalid time format",
          { enabled: true, send_at_time: "25:00", reminders: [1440] },
        ],
      ];

      for (const [descricao, body] of casos) {
        test(`With ${descricao}`, async () => {
          const sessionObject = await authenticate();
          const response = await put(sessionObject, "TASK_DUE", body);

          expect(response.status).toBe(400);

          const responseBody = await response.json();
          expect(responseBody.name).toBe("ValidationError");
        });
      }

      // Ligado e sem antecedência nenhuma seria um aviso que nunca
      // dispara: o usuário acharia que configurou e não receberia nada.
      test("With enabled but no reminder at all", async () => {
        const sessionObject = await authenticate();

        const response = await put(sessionObject, "TASK_DUE", {
          enabled: true,
          send_at_time: "08:00",
          reminders: [],
        });

        expect(response.status).toBe(400);
      });

      test("With an unknown field, answering in Portuguese", async () => {
        const sessionObject = await authenticate();

        const response = await put(sessionObject, "TASK_DUE", {
          ...VALIDO,
          cor: "azul",
        });

        expect(response.status).toBe(400);

        const responseBody = await response.json();
        expect(responseBody.message).toBe(
          "Campos não permitidos foram enviados na requisição: cor.",
        );
      });
    });

    describe("Immediate types", () => {
      test("Do not accept reminders", async () => {
        const sessionObject = await authenticate();

        const response = await put(sessionObject, "TASK_ASSIGNED", {
          enabled: true,
          reminders: [1440],
        });

        expect(response.status).toBe(400);
      });

      test("Accept being switched on and off", async () => {
        const sessionObject = await authenticate();

        const response = await put(sessionObject, "TASK_ASSIGNED", {
          enabled: false,
        });

        expect(response.status).toBe(200);

        const responseBody = await response.json();
        expect(responseBody.enabled).toBe(false);
      });
    });

    describe("Authorization", () => {
      test("Unknown type returns 404", async () => {
        const sessionObject = await authenticate();

        const response = await put(sessionObject, "NAO_EXISTE", VALIDO);

        expect(response.status).toBe(404);

        const responseBody = await response.json();
        expect(responseBody.name).toBe("NotFoundError");
      });

      // Sem a feature do módulo não adianta nem validar o corpo.
      test("Type from a module the user lacks returns 403", async () => {
        const sessionObject = await authenticate();

        const response = await put(sessionObject, "VISIT_UPCOMING", VALIDO);

        expect(response.status).toBe(403);

        const responseBody = await response.json();
        expect(responseBody.name).toBe("ForbiddenError");
      });
    });
  });
});
