import email from "@/infra/email.js";

jest.mock("../../../infra/email.js", () => ({
  __esModule: true,
  default: { send: jest.fn() },
}));

import database from "@/infra/database.js";
import orchestrator from "@/tests/orchestrator.js";
import task from "@/models/task.js";
import notificationSender from "@/models/notification-sender.js";
import notificationScheduler from "@/models/notification-scheduler.js";
import notificationPreference from "@/models/notification-preference.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

beforeEach(async () => {
  email.send.mockReset();
  email.send.mockResolvedValue(undefined);
  await database.query("DELETE FROM notification_deliveries");
  await database.query("DELETE FROM task_assignees");
  await database.query("DELETE FROM tasks");
});

async function criarUsuario() {
  const created = await orchestrator.createUser();
  return await orchestrator.activateUser(created);
}

async function atribuicoesDe(taskId) {
  const results = await database.query({
    text: `SELECT * FROM notification_deliveries
             WHERE subject_id = $1 AND type = 'TASK_ASSIGNED'`,
    values: [taskId],
  });

  return results.rows;
}

describe("aviso de tarefa atribuída", () => {
  describe("reserva no momento da atribuição", () => {
    // `TASK_ASSIGNED` não tem data futura para apurar: o fato já
    // aconteceu. Quem atribui reserva; quem envia continua sendo o job.
    test("atribuir a outra pessoa reserva o aviso", async () => {
      const dono = await criarUsuario();
      const responsavel = await criarUsuario();

      const created = await task.create({
        title: "Coletar amostra de solo",
        description: null,
        status: "PENDING",
        priority: "MEDIUM",
        created_by: dono.id,
        assigned_to: responsavel.id,
        due_date: null,
      });

      const reservas = await atribuicoesDe(created.id);

      expect(reservas).toHaveLength(1);
      expect(reservas[0].user_id).toBe(responsavel.id);
      expect(reservas[0].status).toBe("PENDING");
      // Sem antecedência: o aviso é do agora, não de um evento futuro.
      expect(reservas[0].offset_minutes).toBe(0);
    });

    // Ser avisado do que você mesmo acabou de fazer é ruído, e ruído é o
    // que faz o usuário desligar tudo.
    test("quem se atribui não recebe aviso", async () => {
      const dono = await criarUsuario();

      const created = await task.create({
        title: "Revisar romaneio",
        description: null,
        status: "PENDING",
        priority: "MEDIUM",
        created_by: dono.id,
        assigned_to: dono.id,
        due_date: null,
      });

      expect(await atribuicoesDe(created.id)).toHaveLength(0);
    });

    test("cada responsável novo ganha a sua reserva", async () => {
      const dono = await criarUsuario();
      const primeiro = await criarUsuario();
      const segundo = await criarUsuario();

      const created = await task.create({
        title: "Conferir talhão",
        description: null,
        status: "PENDING",
        priority: "MEDIUM",
        created_by: dono.id,
        assigned_to: [primeiro.id, segundo.id],
        due_date: null,
      });

      const reservas = await atribuicoesDe(created.id);

      expect(reservas).toHaveLength(2);
      expect(new Set(reservas.map((row) => row.user_id))).toEqual(
        new Set([primeiro.id, segundo.id]),
      );
    });

    test("reatribuir avisa só quem entrou agora", async () => {
      const dono = await criarUsuario();
      const antigo = await criarUsuario();
      const novo = await criarUsuario();

      const created = await task.create({
        title: "Fechar ordem de serviço",
        description: null,
        status: "PENDING",
        priority: "MEDIUM",
        created_by: dono.id,
        assigned_to: antigo.id,
        due_date: null,
      });

      await database.query("DELETE FROM notification_deliveries");

      await task.update(
        created.id,
        { assigned_to: [antigo.id, novo.id] },
        { actorId: dono.id },
      );

      const reservas = await atribuicoesDe(created.id);

      expect(reservas).toHaveLength(1);
      expect(reservas[0].user_id).toBe(novo.id);
    });

    // A chave única (user_id, type, subject_id, offset_minutes) é o que
    // impede o segundo e-mail. Salvar a tarefa de novo não pode avisar de
    // novo.
    test("salvar a tarefa de novo não gera segundo aviso", async () => {
      const dono = await criarUsuario();
      const responsavel = await criarUsuario();

      const created = await task.create({
        title: "Medir umidade",
        description: null,
        status: "PENDING",
        priority: "MEDIUM",
        created_by: dono.id,
        assigned_to: responsavel.id,
        due_date: null,
      });

      await task.update(
        created.id,
        { assigned_to: responsavel.id },
        { actorId: dono.id },
      );

      expect(await atribuicoesDe(created.id)).toHaveLength(1);
    });

    test("quem desligou o tipo não é reservado", async () => {
      const dono = await criarUsuario();
      const responsavel = await criarUsuario();

      await notificationPreference.replace(responsavel.id, "TASK_ASSIGNED", {
        enabled: false,
        send_at_time: "08:00",
        reminders: [],
      });

      const created = await task.create({
        title: "Aplicar defensivo",
        description: null,
        status: "PENDING",
        priority: "MEDIUM",
        created_by: dono.id,
        assigned_to: responsavel.id,
        due_date: null,
      });

      expect(await atribuicoesDe(created.id)).toHaveLength(0);
    });

    // A tarefa é o que importa; o aviso é consequência. Uma falha na
    // reserva não pode derrubar o cadastro de quem estava só salvando.
    test("falha na reserva não impede a criação da tarefa", async () => {
      const dono = await criarUsuario();
      const responsavel = await criarUsuario();

      const spy = jest
        .spyOn(notificationScheduler, "reserveTaskAssigned")
        .mockRejectedValue(new Error("banco fora do ar"));
      const logSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const created = await task.create({
        title: "Tarefa que precisa existir",
        description: null,
        status: "PENDING",
        priority: "MEDIUM",
        created_by: dono.id,
        assigned_to: responsavel.id,
        due_date: null,
      });

      expect(created.id).toBeTruthy();
      expect(
        logSpy.mock.calls.some((call) =>
          String(call[0]).includes("task_assigned_notification_failed"),
        ),
      ).toBe(true);

      spy.mockRestore();
      logSpy.mockRestore();
    });
  });

  describe("envio pelo job", () => {
    test("o e-mail sai na execução seguinte, com assunto próprio", async () => {
      const dono = await criarUsuario();
      const responsavel = await criarUsuario();

      await task.create({
        title: "Coletar amostra de solo",
        description: null,
        status: "PENDING",
        priority: "MEDIUM",
        created_by: dono.id,
        assigned_to: responsavel.id,
        due_date: null,
      });

      const resumo = await notificationSender.sendPending();

      expect(resumo.sent).toBe(1);
      expect(email.send).toHaveBeenCalledTimes(1);

      const enviado = email.send.mock.calls[0][0];
      expect(enviado.to).toBe(responsavel.email);
      expect(enviado.subject).toBe("Você recebeu uma nova tarefa");
      expect(enviado.text).toContain("Coletar amostra de solo");
      expect(enviado.text).toContain("TAREFAS ATRIBUÍDAS A VOCÊ");
      // Aviso sem antecedência não pode falar em "em 0 minutos".
      expect(enviado.text).not.toContain("em 0");
      expect(enviado.text).toContain("sem prazo definido");
    });

    test("com prazo, o e-mail mostra o prazo", async () => {
      const dono = await criarUsuario();
      const responsavel = await criarUsuario();

      await task.create({
        title: "Entregar laudo",
        description: null,
        status: "PENDING",
        priority: "MEDIUM",
        created_by: dono.id,
        assigned_to: responsavel.id,
        due_date: "2026-09-29T23:59:59.999-03:00",
      });

      await notificationSender.sendPending();

      expect(email.send.mock.calls[0][0].text).toContain("prazo 29/09/2026");
    });

    test("duas tarefas viram um e-mail só", async () => {
      const dono = await criarUsuario();
      const responsavel = await criarUsuario();

      for (const title of ["Primeira tarefa", "Segunda tarefa"]) {
        await task.create({
          title,
          description: null,
          status: "PENDING",
          priority: "MEDIUM",
          created_by: dono.id,
          assigned_to: responsavel.id,
          due_date: null,
        });
      }

      await notificationSender.sendPending();

      expect(email.send).toHaveBeenCalledTimes(1);
      expect(email.send.mock.calls[0][0].subject).toBe(
        "Você recebeu 2 novas tarefas",
      );
    });

    // A tarefa pode ser concluída ou apagada antes de o job rodar; mandar
    // "você recebeu uma tarefa" sobre algo que não existe mais é pior que
    // não mandar.
    test("tarefa concluída antes do envio não vira e-mail", async () => {
      const dono = await criarUsuario();
      const responsavel = await criarUsuario();

      const created = await task.create({
        title: "Tarefa que será concluída",
        description: null,
        status: "PENDING",
        priority: "MEDIUM",
        created_by: dono.id,
        assigned_to: responsavel.id,
        due_date: null,
      });

      await database.query({
        text: "UPDATE tasks SET status = 'COMPLETED' WHERE id = $1",
        values: [created.id],
      });

      const descartadas = await notificationScheduler.skipObsolete();
      const resumo = await notificationSender.sendPending();

      expect(descartadas.some((row) => row.subject_id === created.id)).toBe(
        true,
      );
      expect(email.send).not.toHaveBeenCalled();
      expect(resumo.sent).toBe(0);
    });
  });
});
