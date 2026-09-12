import database from "@/infra/database.js";
import orchestrator from "@/tests/orchestrator.js";
import notificationUnsubscribe from "@/models/notification-unsubscribe.js";
import notificationPreference from "@/models/notification-preference.js";

const ENDPOINT = "http://localhost:3000/api/v1/notifications/unsubscribe";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

beforeEach(async () => {
  await database.query("DELETE FROM notification_unsubscribe_tokens");
});

async function tokenDe({ types = ["TASK_DUE"] } = {}) {
  const created = await orchestrator.createUser();
  const user = await orchestrator.activateUser(created);
  const token = await notificationUnsubscribe.create(user.id, types);

  return { user, token: token.token, id: token.id };
}

function unsubscribe(token, body) {
  return fetch(`${ENDPOINT}/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

async function estaLigada(userId, type) {
  const preference = await notificationPreference.findOneByUserIdAndType(
    userId,
    type,
  );

  // Sem linha, vale o padrão do catálogo, que é ligado.
  return preference === null ? true : preference.enabled;
}

describe("POST /api/v1/notifications/unsubscribe/[token]", () => {
  describe("Descadastro por tipo", () => {
    test("Desliga só o tipo pedido", async () => {
      const { user, token } = await tokenDe();

      const response = await unsubscribe(token, { type: "TASK_DUE" });
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.disabled).toHaveLength(1);
      expect(responseBody.disabled[0].label).toBe(
        "Tarefa com prazo se aproximando",
      );

      expect(await estaLigada(user.id, "TASK_DUE")).toBe(false);
      expect(await estaLigada(user.id, "VISIT_UPCOMING")).toBe(true);
    });

    test("Tipo desconhecido devolve 400", async () => {
      const { token } = await tokenDe();

      const response = await unsubscribe(token, { type: "NAO_EXISTE" });

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
    });

    // Recusar o tipo não pode consumir o token: o usuário ainda não
    // conseguiu se descadastrar.
    test("Tipo desconhecido não gasta o token", async () => {
      const { token } = await tokenDe();

      await unsubscribe(token, { type: "NAO_EXISTE" });
      const response = await unsubscribe(token, { type: "TASK_DUE" });

      expect(response.status).toBe(200);
    });
  });

  describe("Descadastro total", () => {
    test("Sem tipo, desliga tudo", async () => {
      const { user, token } = await tokenDe();

      const response = await unsubscribe(token);
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.disabled).toHaveLength(3);

      for (const type of notificationUnsubscribe.allTypes()) {
        expect(await estaLigada(user.id, type)).toBe(false);
      }
    });

    // RFC 8058: o provedor manda `List-Unsubscribe=One-Click` como
    // formulário. Recusar esse corpo transformaria o botão nativo do Gmail
    // em erro — e o usuário iria direto para o botão de spam.
    test("O One-Click do provedor desliga tudo", async () => {
      const { user, token } = await tokenDe();

      const response = await fetch(`${ENDPOINT}/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      });

      expect(response.status).toBe(200);

      for (const type of notificationUnsubscribe.allTypes()) {
        expect(await estaLigada(user.id, type)).toBe(false);
      }
    });
  });

  describe("Uso único", () => {
    test("O mesmo token não serve duas vezes", async () => {
      const { token } = await tokenDe();

      await unsubscribe(token);
      const segunda = await unsubscribe(token);

      expect(segunda.status).toBe(404);
    });

    test("Token inexistente devolve 404", async () => {
      const response = await unsubscribe("token-que-nao-existe");

      expect(response.status).toBe(404);
    });

    test("Token expirado devolve 404", async () => {
      const { token, id } = await tokenDe();

      await database.query({
        text: "UPDATE notification_unsubscribe_tokens SET expires_at = now() - interval '1 day' WHERE id = $1",
        values: [id],
      });

      const response = await unsubscribe(token);
      expect(response.status).toBe(404);
    });

    test("Token expirado não desliga nada", async () => {
      const { user, token, id } = await tokenDe();

      await database.query({
        text: "UPDATE notification_unsubscribe_tokens SET expires_at = now() - interval '1 day' WHERE id = $1",
        values: [id],
      });

      await unsubscribe(token);

      expect(await estaLigada(user.id, "TASK_DUE")).toBe(true);
    });
  });

  describe("E-mail transacional", () => {
    // Ativação e recuperação respondem a um pedido do usuário e não
    // consultam preferência nenhuma. Se o descadastro alcançasse esses
    // e-mails, quem se descadastrasse perderia o acesso à própria conta.
    test("Descadastro total não impede a recuperação de senha", async () => {
      const { user, token } = await tokenDe();

      await unsubscribe(token);
      await orchestrator.deleteAllEmails();

      const response = await fetch("http://localhost:3000/api/v1/recoveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });

      expect(response.status).toBe(201);

      const lastEmail = await orchestrator.getLastEmail();
      expect(lastEmail.recipients).toContain(`<${user.email}>`);
      expect(lastEmail.subject).toContain("Recuperação de senha");
    });
  });
});
