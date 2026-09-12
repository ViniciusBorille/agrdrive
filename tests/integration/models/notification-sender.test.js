import email from "@/infra/email.js";

jest.mock("../../../infra/email.js", () => ({
  __esModule: true,
  default: { send: jest.fn() },
}));

import database from "@/infra/database.js";
import orchestrator from "@/tests/orchestrator.js";
import notificationScheduler from "@/models/notification-scheduler.js";
import notificationSender from "@/models/notification-sender.js";
import notificationUnsubscribe from "@/models/notification-unsubscribe.js";
import notificationPreference from "@/models/notification-preference.js";
import { ServiceError } from "@/infra/errors.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

beforeEach(async () => {
  email.send.mockReset();
  email.send.mockResolvedValue(undefined);
  await database.query("DELETE FROM notification_deliveries");
  // Tarefas de um teste continuariam elegíveis no seguinte e sujariam as
  // contagens de e-mails enviados.
  await database.query("DELETE FROM task_assignees");
  await database.query("DELETE FROM tasks");
});

const PRAZO = "2026-09-29T23:59:59.999-03:00";
const DEPOIS_DO_GATILHO = new Date("2026-09-28T07:30:00-03:00");

// `replace` em vez de INSERT cru: desde que o usuário nasce com as
// preferências padrão gravadas, um INSERT aqui esbarraria na chave única
// (user_id, type). O `replace` é a mesma operação que a tela faz ao salvar.
async function criarUsuarioComPreferencia({ reminders = [1440] } = {}) {
  const created = await orchestrator.createUser();
  const activated = await orchestrator.activateUser(created);

  await notificationPreference.replace(activated.id, "TASK_DUE", {
    enabled: true,
    send_at_time: "07:00",
    reminders,
  });

  return activated;
}

async function entregasDoUsuario(userId) {
  const results = await database.query({
    text: "SELECT * FROM notification_deliveries WHERE user_id = $1 ORDER BY subject_id",
    values: [userId],
  });

  return results.rows;
}

describe("models/notification-sender.js", () => {
  describe("agrupamento", () => {
    // Três tarefas vencendo no mesmo lembrete são três itens numa
    // mensagem, não três mensagens. É a diferença entre uma funcionalidade
    // útil e um motivo para marcar o remetente como spam.
    test("manda um e-mail só por usuário, com todos os itens", async () => {
      const user = await criarUsuarioComPreferencia();

      for (const title of [
        "Colher soja",
        "Aplicar defensivo",
        "Fechar romaneio",
      ]) {
        await orchestrator.createTask({
          created_by: user.id,
          assigned_to: user.id,
          due_date: PRAZO,
          title,
        });
      }

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });
      const resumo = await notificationSender.sendPending();

      expect(email.send).toHaveBeenCalledTimes(1);

      const enviado = email.send.mock.calls[0][0];
      expect(enviado.to).toBe(user.email);
      expect(enviado.subject).toBe("3 tarefas vencem em 1 dia");
      expect(enviado.text).toContain("Colher soja");
      expect(enviado.text).toContain("Aplicar defensivo");
      expect(enviado.text).toContain("Fechar romaneio");
      expect(enviado.html).toBeTruthy();

      expect(resumo.sent).toBe(3);
      expect(resumo.recipients).toBe(1);
    });

    test("usuários diferentes recebem e-mails separados", async () => {
      const primeiro = await criarUsuarioComPreferencia();
      const segundo = await criarUsuarioComPreferencia();

      for (const user of [primeiro, segundo]) {
        await orchestrator.createTask({
          created_by: user.id,
          assigned_to: user.id,
          due_date: PRAZO,
        });
      }

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });
      await notificationSender.sendPending();

      expect(email.send).toHaveBeenCalledTimes(2);

      const destinatarios = email.send.mock.calls.map((call) => call[0].to);
      expect(destinatarios).toContain(primeiro.email);
      expect(destinatarios).toContain(segundo.email);
    });

    // O remetente foi centralizado no `infra/email.js`; quem chama não
    // precisa mais repetir o literal.
    test("não passa remetente, deixa o padrão do infra/email.js", async () => {
      const user = await criarUsuarioComPreferencia();
      await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
      });

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });
      await notificationSender.sendPending();

      expect(email.send.mock.calls[0][0].from).toBeUndefined();
    });
  });

  describe("marcação do resultado", () => {
    test("envio bem-sucedido vira SENT com sent_at", async () => {
      const user = await criarUsuarioComPreferencia();
      await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
      });

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });
      await notificationSender.sendPending();

      const entregas = await entregasDoUsuario(user.id);
      expect(entregas[0].status).toBe("SENT");
      expect(entregas[0].sent_at).not.toBeNull();
      expect(entregas[0].attempts).toBe(1);
    });

    // Já enviado não pode voltar para a fila.
    test("uma segunda execução não reenvia o que já saiu", async () => {
      const user = await criarUsuarioComPreferencia();
      await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
      });

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });
      await notificationSender.sendPending();
      email.send.mockClear();

      const resumo = await notificationSender.sendPending();

      expect(email.send).not.toHaveBeenCalled();
      expect(resumo.sent).toBe(0);
    });
  });

  describe("falha de envio", () => {
    function falharEnvio() {
      email.send.mockRejectedValue(
        new ServiceError({
          message: "Não foi possível enviar o email.",
          context: { to: "vazaria@exemplo.test", text: "corpo secreto" },
        }),
      );
    }

    // Falha de SMTP costuma ser momentânea: desistir na primeira perderia
    // o aviso por nada.
    test("primeira falha mantém PENDING e conta a tentativa", async () => {
      const user = await criarUsuarioComPreferencia();
      await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
      });

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });
      falharEnvio();
      const resumo = await notificationSender.sendPending();

      const entregas = await entregasDoUsuario(user.id);
      expect(entregas[0].status).toBe("PENDING");
      expect(entregas[0].attempts).toBe(1);
      expect(entregas[0].error).toContain("Não foi possível enviar");
      expect(resumo.retrying).toBe(1);
      expect(resumo.failed).toBe(0);
    });

    test("na terceira falha vira FAILED e sai de circulação", async () => {
      const user = await criarUsuarioComPreferencia();
      await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
      });

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });
      falharEnvio();

      await notificationSender.sendPending();
      await notificationSender.sendPending();
      const terceira = await notificationSender.sendPending();

      const entregas = await entregasDoUsuario(user.id);
      expect(entregas[0].status).toBe("FAILED");
      expect(entregas[0].attempts).toBe(3);
      expect(terceira.failed).toBe(1);

      // Esgotado, não é mais tentado.
      email.send.mockClear();
      await notificationSender.sendPending();
      expect(email.send).not.toHaveBeenCalled();
    });

    // Sem log, uma entrega esgotada ficaria invisível na tabela e ninguém
    // saberia que o aviso nunca chegou.
    test("registra log de erro ao esgotar as tentativas", async () => {
      const user = await criarUsuarioComPreferencia();
      await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
      });

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });
      falharEnvio();

      const spy = jest.spyOn(console, "error").mockImplementation(() => {});

      await notificationSender.sendPending();
      await notificationSender.sendPending();
      await notificationSender.sendPending();

      const logs = spy.mock.calls
        .map((call) => call[0])
        .filter((line) =>
          String(line).includes("notification_delivery_failed"),
        );

      expect(logs).toHaveLength(1);

      const registro = JSON.parse(logs[0]);
      expect(registro.level).toBe("error");
      expect(registro.attempts).toBe(3);
      // O ServiceError carrega `context` com corpo e destinatário; nada
      // disso pode ir para o log.
      expect(logs[0]).not.toContain("corpo secreto");
      expect(logs[0]).not.toContain("vazaria@exemplo.test");

      spy.mockRestore();
    });

    // Um endereço ruim não pode derrubar o lote inteiro.
    test("falha de um usuário não impede o envio do outro", async () => {
      const quebrado = await criarUsuarioComPreferencia();
      const saudavel = await criarUsuarioComPreferencia();

      for (const user of [quebrado, saudavel]) {
        await orchestrator.createTask({
          created_by: user.id,
          assigned_to: user.id,
          due_date: PRAZO,
        });
      }

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });

      email.send.mockImplementation(async ({ to }) => {
        if (to === quebrado.email) {
          throw new ServiceError({ message: "SMTP recusou o destinatário." });
        }
      });

      const resumo = await notificationSender.sendPending();

      expect(email.send).toHaveBeenCalledTimes(2);
      expect(resumo.sent).toBe(1);
      expect(resumo.retrying).toBe(1);

      const entregasSaudavel = await entregasDoUsuario(saudavel.id);
      expect(entregasSaudavel[0].status).toBe("SENT");
    });
  });

  describe("descadastro", () => {
    // O token nasce no envio, não na configuração: cada e-mail carrega o
    // seu, com os tipos que estão dentro dele.
    test("cada e-mail sai com um token de descadastro utilizável", async () => {
      const user = await criarUsuarioComPreferencia();
      await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
      });

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });
      await notificationSender.sendPending();

      const enviado = email.send.mock.calls[0][0];
      const token = enviado.text.match(/\/descadastro\/([a-f0-9]{64})/)?.[1];

      expect(token).toBeTruthy();
      expect(enviado.headers["List-Unsubscribe"]).toContain(token);
      expect(enviado.headers["List-Unsubscribe-Post"]).toBe(
        "List-Unsubscribe=One-Click",
      );

      const found = await notificationUnsubscribe.findOneValidByToken(token);
      expect(found.user_id).toBe(user.id);
      expect(found.types).toEqual(["TASK_DUE"]);
    });

    test("dois e-mails não compartilham o mesmo token", async () => {
      const primeiro = await criarUsuarioComPreferencia();
      const segundo = await criarUsuarioComPreferencia();

      for (const user of [primeiro, segundo]) {
        await orchestrator.createTask({
          created_by: user.id,
          assigned_to: user.id,
          due_date: PRAZO,
        });
      }

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });
      await notificationSender.sendPending();

      const tokens = email.send.mock.calls.map(
        (call) => call[0].text.match(/\/descadastro\/([a-f0-9]{64})/)[1],
      );

      expect(tokens).toHaveLength(2);
      expect(new Set(tokens).size).toBe(2);
    });
  });

  describe("assunto que sumiu", () => {
    // A tarefa pode ser apagada entre a reserva e o envio; mandar e-mail
    // sobre coisa nenhuma seria pior que não mandar.
    test("não envia quando a tarefa foi apagada depois de reservada", async () => {
      const user = await criarUsuarioComPreferencia();
      const task = await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: PRAZO,
      });

      await notificationScheduler.reserveDue({ now: DEPOIS_DO_GATILHO });

      await database.query({
        text: "UPDATE tasks SET deleted_at = now() WHERE id = $1",
        values: [task.id],
      });

      const resumo = await notificationSender.sendPending();

      expect(email.send).not.toHaveBeenCalled();
      expect(resumo.sent).toBe(0);
    });
  });
});
