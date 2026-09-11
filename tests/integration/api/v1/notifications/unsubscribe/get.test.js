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

describe("GET /api/v1/notifications/unsubscribe/[token]", () => {
  test("Token válido descreve o que dá para desligar", async () => {
    const { user, token } = await tokenDe({
      types: ["TASK_DUE", "VISIT_UPCOMING"],
    });

    const response = await fetch(`${ENDPOINT}/${token}`);
    expect(response.status).toBe(200);

    const responseBody = await response.json();

    expect(responseBody.types.map((item) => item.type)).toEqual([
      "TASK_DUE",
      "VISIT_UPCOMING",
    ]);
    // Rótulo do catálogo, não o valor cru do enum: a página mostra isso
    // para uma pessoa.
    expect(responseBody.types[0].label).toBe("Tarefa com prazo se aproximando");
    expect(responseBody.all_types).toHaveLength(3);
    expect(responseBody.username).toBe(user.username);
  });

  // Cliente de e-mail pré-carrega link. Se o GET desligasse, a notificação
  // sumiria sem o usuário ter clicado em nada.
  test("Abrir o link não desliga nada nem gasta o token", async () => {
    const { user, token } = await tokenDe();

    await fetch(`${ENDPOINT}/${token}`);

    // Continua ligado: abrir o link não é o mesmo que clicar no botão.
    expect(
      (await notificationPreference.findOneByUserIdAndType(user.id, "TASK_DUE"))
        .enabled,
    ).toBe(true);

    const segunda = await fetch(`${ENDPOINT}/${token}`);
    expect(segunda.status).toBe(200);
  });

  test("Token inexistente devolve 404", async () => {
    const response = await fetch(`${ENDPOINT}/token-que-nao-existe`);

    expect(response.status).toBe(404);

    const responseBody = await response.json();
    expect(responseBody.name).toBe("NotFoundError");
  });

  test("Token expirado devolve 404", async () => {
    const { token, id } = await tokenDe();

    await database.query({
      text: "UPDATE notification_unsubscribe_tokens SET expires_at = now() - interval '1 day' WHERE id = $1",
      values: [id],
    });

    const response = await fetch(`${ENDPOINT}/${token}`);
    expect(response.status).toBe(404);
  });

  test("Token já usado devolve 404", async () => {
    const { token, id } = await tokenDe();

    await notificationUnsubscribe.markTokenAsUsed(id);

    const response = await fetch(`${ENDPOINT}/${token}`);
    expect(response.status).toBe(404);
  });

  // A recusa não pode distinguir "não existe" de "já usou": isso viraria
  // um oráculo para descobrir tokens válidos.
  test("A recusa não revela o motivo", async () => {
    const { token, id } = await tokenDe();
    await notificationUnsubscribe.markTokenAsUsed(id);

    const usado = await (await fetch(`${ENDPOINT}/${token}`)).json();
    const inexistente = await (await fetch(`${ENDPOINT}/qualquer`)).json();

    expect(usado.message).toBe(inexistente.message);
  });
});
