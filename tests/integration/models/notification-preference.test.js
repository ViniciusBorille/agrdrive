import database from "@/infra/database.js";
import orchestrator from "@/tests/orchestrator.js";
import notificationPreference from "@/models/notification-preference.js";
import notificationScheduler from "@/models/notification-scheduler.js";
import { listNotificationTypes } from "@/models/notification-catalog.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

beforeEach(async () => {
  await database.query("DELETE FROM notification_deliveries");
  await database.query("DELETE FROM task_assignees");
  await database.query("DELETE FROM tasks");
});

const PRAZO = "2026-09-29T23:59:59.999-03:00";
const DEPOIS_DO_GATILHO = new Date("2026-09-28T08:30:00-03:00");

describe("models/notification-preference.js", () => {
  describe("preferências de quem acaba de se cadastrar", () => {
    // O agendador faz JOIN com `notification_preferences`. Quem não tem
    // linha nunca é apurado — e a tela mostraria os padrões como se
    // estivessem valendo, o que é pior que não mostrar nada.
    test("todo tipo do catálogo nasce gravado", async () => {
      const user = await orchestrator.createUser();

      const preferences = await notificationPreference.findAllByUserId(user.id);
      const types = preferences.map((preference) => preference.type).sort();

      expect(types).toEqual(
        listNotificationTypes()
          .map((definition) => definition.type)
          .sort(),
      );
      expect(preferences.every((preference) => preference.enabled)).toBe(true);
    });

    test("os lembretes são os padrões do catálogo", async () => {
      const user = await orchestrator.createUser();

      for (const definition of listNotificationTypes()) {
        const preference = await notificationPreference.findOneByUserIdAndType(
          user.id,
          definition.type,
        );

        // O catálogo guarda do mais próximo ao mais distante; a leitura
        // devolve na ordem em que os avisos acontecem.
        expect(preference.reminders).toEqual(
          [...definition.defaultOffsets].sort((a, b) => b - a),
        );
        expect(preference.send_at_time).toBe(
          notificationPreference.DEFAULT_SEND_AT_TIME,
        );
      }
    });

    // A garantia que interessa, e a que faltava: sem abrir a tela, sem
    // clicar em nada, a pessoa é avisada.
    test("é apurado pelo agendador sem nunca ter aberto a tela", async () => {
      const created = await orchestrator.createUser();
      const user = await orchestrator.activateUser(created);

      await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
      });

      const previsto = await notificationScheduler.reserveDue({
        now: DEPOIS_DO_GATILHO,
        dryRun: true,
      });

      const doUsuario = previsto.pending.filter(
        (row) => row.user_id === user.id,
      );

      expect(doUsuario).toHaveLength(1);
      expect(doUsuario[0].offset_minutes).toBe(1440);
    });

    // Semear não pode passar por cima de quem já escolheu.
    test("semear de novo não desfaz o que o usuário configurou", async () => {
      const user = await orchestrator.createUser();

      await notificationPreference.replace(user.id, "TASK_DUE", {
        enabled: false,
        send_at_time: "21:00",
        reminders: [120],
      });

      await notificationPreference.seedDefaultsFor(user.id);

      const preference = await notificationPreference.findOneByUserIdAndType(
        user.id,
        "TASK_DUE",
      );

      expect(preference.enabled).toBe(false);
      expect(preference.send_at_time).toBe("21:00");
      expect(preference.reminders).toEqual([120]);
    });

    // Quem apagou todos os lembretes de propósito e desligou o tipo não
    // pode ver os padrões voltarem sozinhos.
    test("semear não ressuscita lembretes apagados", async () => {
      const user = await orchestrator.createUser();

      await notificationPreference.replace(user.id, "TASK_DUE", {
        enabled: false,
        send_at_time: "08:00",
        reminders: [],
      });

      await notificationPreference.seedDefaultsFor(user.id);

      const preference = await notificationPreference.findOneByUserIdAndType(
        user.id,
        "TASK_DUE",
      );

      expect(preference.reminders).toEqual([]);
    });
  });
});
