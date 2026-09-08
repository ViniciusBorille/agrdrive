import database from "@/infra/database.js";
import orchestrator from "@/tests/orchestrator.js";
import notificationScheduler from "@/models/notification-scheduler.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

// Datas com offset explícito: sem isso o teste passaria ou falharia
// conforme o fuso da máquina que o roda.
const PRAZO = "2026-09-20T14:00:00-03:00";
const ANTES_DO_GATILHO = new Date("2026-09-19T07:59:00-03:00");
const DEPOIS_DO_GATILHO = new Date("2026-09-19T08:01:00-03:00");

async function limparEntregas() {
  await database.query("DELETE FROM notification_deliveries");
}

async function criarUsuario({ features = ["use:tasks"] } = {}) {
  const created = await orchestrator.createUser();
  const activated = await orchestrator.activateUser(created);
  await orchestrator.addFeaturesToUser(activated, features);
  return activated;
}

async function definirPreferencia(
  userId,
  type,
  { enabled = true, sendAtTime = "08:00", reminders = [1440] } = {},
) {
  const preference = await database.query({
    text: `
      INSERT INTO notification_preferences (user_id, type, enabled, send_at_time)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, type) DO UPDATE
        SET enabled = EXCLUDED.enabled, send_at_time = EXCLUDED.send_at_time
      RETURNING id
    ;`,
    values: [userId, type, enabled, sendAtTime],
  });

  const preferenceId = preference.rows[0].id;

  await database.query({
    text: "DELETE FROM notification_reminders WHERE preference_id = $1",
    values: [preferenceId],
  });

  for (const offset of reminders) {
    await database.query({
      text: "INSERT INTO notification_reminders (preference_id, offset_minutes) VALUES ($1, $2)",
      values: [preferenceId, offset],
    });
  }
}

async function entregasDe(subjectId) {
  const results = await database.query({
    text: "SELECT * FROM notification_deliveries WHERE subject_id = $1 ORDER BY offset_minutes DESC",
    values: [subjectId],
  });

  return results.rows;
}

async function removerFeatures(userId) {
  await database.query({
    text: "UPDATE users SET features = ARRAY['create:session']::varchar[] WHERE id = $1",
    values: [userId],
  });
}

describe("models/notification-scheduler.js", () => {
  describe(".reserveDue() com tarefas", () => {
    test("não reserva antes da hora configurada", async () => {
      await limparEntregas();
      const user = await criarUsuario();
      await definirPreferencia(user.id, "TASK_DUE", { reminders: [1440] });
      const task = await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
      });

      await notificationScheduler.reserveDue({ now: ANTES_DO_GATILHO });

      expect(await entregasDe(task.id)).toHaveLength(0);
    });

    // "1 dia antes, às 08:00" precisa cair às 08:00 do dia anterior no fuso
    // do usuário — não 24 horas cravadas antes do prazo.
    test("reserva a partir da hora configurada, no fuso do usuário", async () => {
      await limparEntregas();
      const user = await criarUsuario();
      await definirPreferencia(user.id, "TASK_DUE", { reminders: [1440] });
      const task = await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
      });

      const resultado = await notificationScheduler.reserveDue({
        now: DEPOIS_DO_GATILHO,
      });

      const entregas = await entregasDe(task.id);
      expect(entregas).toHaveLength(1);
      expect(entregas[0].status).toBe("PENDING");

      // Filtrado pelo assunto: o banco carrega tarefas elegíveis deixadas
      // por outros testes, e o total geral não diz nada sobre este caso.
      expect(
        resultado.pending.filter((row) => row.subject_id === task.id),
      ).toHaveLength(1);

      // 08:00 no fuso do usuário, e não 24 horas cravadas antes do prazo.
      expect(entregas[0].scheduled_for.toISOString()).toBe(
        "2026-09-19T11:00:00.000Z",
      );
    });

    // A garantia central do módulo: o job recalcula tudo a cada execução e
    // não pode reenviar o que já saiu.
    test("executar duas vezes não duplica a reserva", async () => {
      await limparEntregas();
      const user = await criarUsuario();
      await definirPreferencia(user.id, "TASK_DUE", { reminders: [1440] });
      const task = await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
      });

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });
      const segunda = await notificationScheduler.reserveDue({
        now: DEPOIS_DO_GATILHO,
      });

      expect(await entregasDe(task.id)).toHaveLength(1);
      expect(segunda.pending).toHaveLength(0);
    });

    test("tarefa sem prazo não gera nada", async () => {
      await limparEntregas();
      const user = await criarUsuario();
      await definirPreferencia(user.id, "TASK_DUE");
      const task = await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: null,
      });

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });

      expect(await entregasDe(task.id)).toHaveLength(0);
    });

    test("tarefa concluída ou cancelada não gera nada", async () => {
      await limparEntregas();
      const user = await criarUsuario();
      await definirPreferencia(user.id, "TASK_DUE");

      const concluida = await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
        status: "COMPLETED",
      });
      const cancelada = await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
        status: "CANCELLED",
      });

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });

      expect(await entregasDe(concluida.id)).toHaveLength(0);
      expect(await entregasDe(cancelada.id)).toHaveLength(0);
    });

    test("preferência desligada não gera nada", async () => {
      await limparEntregas();
      const user = await criarUsuario();
      await definirPreferencia(user.id, "TASK_DUE", { enabled: false });
      const task = await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
      });

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });

      expect(await entregasDe(task.id)).toHaveLength(0);
    });

    // Preferência gravada antes de o acesso ser revogado não pode
    // continuar rendendo e-mail.
    test("usuário sem a feature do módulo não recebe", async () => {
      await limparEntregas();
      const user = await criarUsuario();
      await definirPreferencia(user.id, "TASK_DUE");
      const task = await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
      });

      await removerFeatures(user.id);

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });

      expect(await entregasDe(task.id)).toHaveLength(0);
    });

    // Cada responsável tem a própria configuração; a tarefa é a mesma.
    test("dois responsáveis com preferências diferentes recebem cada um a sua", async () => {
      await limparEntregas();
      const cedo = await criarUsuario();
      const tarde = await criarUsuario();
      await definirPreferencia(cedo.id, "TASK_DUE", { reminders: [4320] });
      await definirPreferencia(tarde.id, "TASK_DUE", { reminders: [1440] });

      const task = await orchestrator.createTask({
        created_by: cedo.id,
        assigned_to: [cedo.id, tarde.id],
        due_date: PRAZO,
      });

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });

      const entregas = await entregasDe(task.id);
      expect(entregas).toHaveLength(2);
      expect(
        entregas.map((entrega) => entrega.offset_minutes).sort((a, b) => a - b),
      ).toEqual([1440, 4320]);
      expect(new Set(entregas.map((entrega) => entrega.user_id)).size).toBe(2);
    });

    // Aviso muito atrasado não deve sair: "vence em 3 dias" chegando dois
    // dias depois é pior que silêncio. Mas fica o registro da decisão.
    test("aviso fora da janela de tolerância nasce SKIPPED", async () => {
      await limparEntregas();
      const user = await criarUsuario();
      await definirPreferencia(user.id, "TASK_DUE", { reminders: [1440] });
      const task = await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
      });

      await notificationScheduler.reserveDue({
        now: new Date("2026-09-22T08:00:00-03:00"),
      });

      const entregas = await entregasDe(task.id);
      expect(entregas).toHaveLength(1);
      expect(entregas[0].status).toBe("SKIPPED");
    });
  });

  describe(".reserveDue() com visitas", () => {
    // Antecedência menor que um dia é conceito de relógio: "2 horas antes"
    // tem que ser duas horas antes, não às 08:00.
    test("antecedência abaixo de um dia usa o instante exato", async () => {
      await limparEntregas();
      const user = await criarUsuario({ features: ["use:agenda"] });
      await definirPreferencia(user.id, "VISIT_UPCOMING", { reminders: [120] });

      const visit = await orchestrator.createVisit({
        created_by: user.id,
        event_date: "2026-09-20",
        start_time: "09:00",
        end_time: "10:00",
      });

      await notificationScheduler.reserveDue({
        now: new Date("2026-09-20T06:59:00-03:00"),
      });
      expect(await entregasDe(visit.id)).toHaveLength(0);

      await notificationScheduler.reserveDue({
        now: new Date("2026-09-20T07:01:00-03:00"),
      });
      expect(await entregasDe(visit.id)).toHaveLength(1);
    });

    test("visita apagada não gera nada", async () => {
      await limparEntregas();
      const user = await criarUsuario({ features: ["use:agenda"] });
      await definirPreferencia(user.id, "VISIT_UPCOMING", { reminders: [120] });

      const visit = await orchestrator.createVisit({
        created_by: user.id,
        event_date: "2026-09-20",
        start_time: "09:00",
        end_time: "10:00",
      });

      await database.query({
        text: "UPDATE visits SET deleted_at = now() WHERE id = $1",
        values: [visit.id],
      });

      await notificationScheduler.reserveDue({
        now: new Date("2026-09-20T07:01:00-03:00"),
      });

      expect(await entregasDe(visit.id)).toHaveLength(0);
    });
  });

  describe(".skipObsolete()", () => {
    // A reserva pode envelhecer entre a apuração e o envio.
    test("marca SKIPPED quando a tarefa foi concluída depois de reservada", async () => {
      await limparEntregas();
      const user = await criarUsuario();
      await definirPreferencia(user.id, "TASK_DUE", { reminders: [1440] });
      const task = await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
      });

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });
      expect((await entregasDe(task.id))[0].status).toBe("PENDING");

      await database.query({
        text: "UPDATE tasks SET status = 'COMPLETED' WHERE id = $1",
        values: [task.id],
      });

      await notificationScheduler.skipObsolete();

      expect((await entregasDe(task.id))[0].status).toBe("SKIPPED");
    });

    test("não mexe em reserva cuja tarefa continua aberta", async () => {
      await limparEntregas();
      const user = await criarUsuario();
      await definirPreferencia(user.id, "TASK_DUE", { reminders: [1440] });
      const task = await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
      });

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });
      await notificationScheduler.skipObsolete();

      expect((await entregasDe(task.id))[0].status).toBe("PENDING");
    });
  });
});
