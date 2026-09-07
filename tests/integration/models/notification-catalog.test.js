import database from "@/infra/database.js";
import orchestrator from "@/tests/orchestrator.js";
import { listNotificationTypes } from "@/models/notification-catalog.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

describe("Catálogo de notificações x enum do banco", () => {
  // O catálogo em JavaScript e o enum `notification_type` no Postgres são
  // duas declarações da mesma lista. Acrescentar um tipo em um e esquecer
  // o outro só apareceria em produção, na hora de gravar a preferência.
  test("declaram exatamente os mesmos valores", async () => {
    const results = await database.query(`
      SELECT
        e.enumlabel AS value
      FROM
        pg_enum e
      JOIN
        pg_type t ON t.oid = e.enumtypid
      WHERE
        t.typname = 'notification_type'
      ORDER BY
        e.enumsortorder
    ;`);

    const noBanco = results.rows.map((row) => row.value).sort();
    const noCatalogo = listNotificationTypes()
      .map((definition) => definition.type)
      .sort();

    expect(noCatalogo).toEqual(noBanco);
  });

  // As features citadas pelo catálogo precisam existir de verdade, senão
  // `authorization.can` estoura ao filtrar os tipos do usuário.
  test("as features exigidas pelos tipos são features válidas", async () => {
    const authorization = (await import("@/models/authorization.js")).default;

    for (const definition of listNotificationTypes()) {
      expect(() =>
        authorization.can({ id: "x", features: [] }, definition.feature),
      ).not.toThrow();
    }
  });
});
