import database from "@/infra/database.js";
import orchestrator from "@/tests/orchestrator.js";

const ENDPOINT = "http:localhost:3000/api/v1/notifications/dispatch";
const SECRET = process.env.NOTIFICATIONS_DISPATCH_SECRET;
const HOUR_IN_MILISECONDS = 60 * 60 * 1000;

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

function dispatch({ secret = SECRET, query = "", method = "POST" } = {}) {
  return fetch(`${ENDPOINT}${query}`, {
    method,
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });
}

// Cria uma tarefa cujo aviso já venceu segundo o relógio real, que é o que
// o endpoint usa — ele não aceita "agora" por parâmetro, de propósito.
async function tarefaComAvisoVencido() {
  const created = await orchestrator.createUser();
  const user = await orchestrator.activateUser(created);

  const preference = await database.query({
    text: `INSERT INTO notification_preferences (user_id, type, enabled, send_at_time)
           VALUES ($1, 'TASK_DUE', true, '00:00') RETURNING id`,
    values: [user.id],
  });
  await database.query({
    text: "INSERT INTO notification_reminders (preference_id, offset_minutes) VALUES ($1, 1440)",
    values: [preference.rows[0].id],
  });

  await orchestrator.createTask({
    created_by: user.id,
    assigned_to: user.id,
    due_date: new Date(Date.now() + 25 * HOUR_IN_MILISECONDS).toISOString(),
  });

  return user;
}

async function contarEntregas() {
  const results = await database.query(
    "SELECT count(*)::int AS total FROM notification_deliveries",
  );

  return results.rows[0].total;
}

describe("POST /api/v1/notifications/dispatch", () => {
  describe("Autenticação", () => {
    test("Sem segredo devolve 401", async () => {
      const response = await dispatch({ secret: null });

      expect(response.status).toBe(401);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("UnauthorizedError");
    });

    test("Com segredo errado devolve 401", async () => {
      const response = await dispatch({ secret: "nao-e-o-segredo" });

      expect(response.status).toBe(401);
    });

    // A mensagem não pode dizer se o segredo veio errado ou se não veio.
    test("A recusa não revela o motivo", async () => {
      const semSegredo = await (await dispatch({ secret: null })).json();
      const errado = await (await dispatch({ secret: "outro" })).json();

      expect(semSegredo.message).toBe(errado.message);
    });

    // Nada de útil para quem só abre a URL no navegador.
    test("GET devolve 405", async () => {
      const response = await dispatch({ method: "GET" });

      expect(response.status).toBe(405);
    });

    test("Requisição recusada não processa nada", async () => {
      await tarefaComAvisoVencido();

      await dispatch({ secret: "nao-e-o-segredo" });

      expect(await contarEntregas()).toBe(0);
    });
  });

  describe("Disparo", () => {
    test("Apura, envia e devolve o resumo", async () => {
      await tarefaComAvisoVencido();

      const response = await dispatch();
      expect(response.status).toBe(200);

      const summary = await response.json();

      expect(summary.reserved).toBe(1);
      expect(summary.sent).toBe(1);
      expect(summary.recipients).toBe(1);
      expect(summary.failed).toBe(0);
      expect(typeof summary.duration_ms).toBe("number");
    });

    // A garantia que sustenta rodar de hora em hora: o job recalcula tudo
    // a cada execução e não pode reenviar o que já saiu.
    test("Uma segunda execução não reenvia", async () => {
      await tarefaComAvisoVencido();

      await dispatch();
      const segunda = await dispatch();
      const summary = await segunda.json();

      expect(summary.reserved).toBe(0);
      expect(summary.sent).toBe(0);
      expect(await contarEntregas()).toBe(1);
    });

    test("Sem nada a fazer devolve zeros, não erro", async () => {
      const response = await dispatch();

      expect(response.status).toBe(200);

      const summary = await response.json();
      expect(summary.reserved).toBe(0);
      expect(summary.sent).toBe(0);
    });
  });

  describe("Modo seco", () => {
    // Existe para depurar em produção sem transformar a investigação em
    // e-mail na caixa do cliente.
    test("Diz o que faria sem gravar nem enviar", async () => {
      await tarefaComAvisoVencido();

      const response = await dispatch({ query: "?dry_run=true" });
      expect(response.status).toBe(200);

      const preview = await response.json();
      expect(preview.dry_run).toBe(true);
      expect(preview.would_reserve).toBe(1);

      expect(await contarEntregas()).toBe(0);
    });

    // A contagem do modo seco só vale se bater com a execução real.
    test("O que ele previu é o que a execução real produz", async () => {
      await tarefaComAvisoVencido();

      const preview = await (await dispatch({ query: "?dry_run=true" })).json();
      const real = await (await dispatch()).json();

      expect(real.reserved).toBe(preview.would_reserve);
    });

    test("Depois de reservado, não prevê de novo", async () => {
      await tarefaComAvisoVencido();

      await dispatch();
      const preview = await (await dispatch({ query: "?dry_run=true" })).json();

      expect(preview.would_reserve).toBe(0);
      expect(preview.already_queued).toBe(0);
    });
  });
});
