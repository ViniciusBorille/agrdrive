import database from "@/infra/database.js";
import orchestrator from "@/tests/orchestrator.js";
import cryptography from "@/infra/crypto.js";
import notificationUnsubscribe from "@/models/notification-unsubscribe.js";
import notificationPreference from "@/models/notification-preference.js";
import notificationScheduler from "@/models/notification-scheduler.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

beforeEach(async () => {
  await database.query("DELETE FROM notification_unsubscribe_tokens");
});

async function criarUsuario() {
  const created = await orchestrator.createUser();
  return await orchestrator.activateUser(created);
}

async function preferenciaDe(userId, type) {
  return await notificationPreference.findOneByUserIdAndType(userId, type);
}

describe("models/notification-unsubscribe.js", () => {
  describe("token", () => {
    // O link do e-mail carrega o token cru; um dump do banco não pode
    // servir para descadastrar ninguém.
    test("guarda apenas o hash, nunca o token em claro", async () => {
      const user = await criarUsuario();

      const created = await notificationUnsubscribe.create(user.id, [
        "TASK_DUE",
      ]);

      const stored = await database.query({
        text: "SELECT token_hash FROM notification_unsubscribe_tokens WHERE id = $1",
        values: [created.id],
      });

      expect(created.token).toEqual(expect.any(String));
      expect(stored.rows[0].token_hash).not.toBe(created.token);
      expect(stored.rows[0].token_hash).toBe(
        cryptography.sha256(created.token),
      );
    });

    test("guarda os tipos que estavam no e-mail", async () => {
      const user = await criarUsuario();

      const created = await notificationUnsubscribe.create(user.id, [
        "TASK_DUE",
        "VISIT_UPCOMING",
      ]);

      const found = await notificationUnsubscribe.findOneValidByToken(
        created.token,
      );

      expect(found.types).toEqual(["TASK_DUE", "VISIT_UPCOMING"]);
      expect(found.username).toBe(user.username);
    });

    test("token inexistente é recusado", async () => {
      await expect(
        notificationUnsubscribe.findOneValidByToken("nao-existe"),
      ).rejects.toThrow(
        "O link de descadastro não foi encontrado ou já expirou.",
      );
    });

    test("token expirado é recusado", async () => {
      const user = await criarUsuario();
      const created = await notificationUnsubscribe.create(user.id, [
        "TASK_DUE",
      ]);

      await database.query({
        text: "UPDATE notification_unsubscribe_tokens SET expires_at = now() - interval '1 day' WHERE id = $1",
        values: [created.id],
      });

      await expect(
        notificationUnsubscribe.findOneValidByToken(created.token),
      ).rejects.toThrow("não foi encontrado ou já expirou");
    });

    test("token já usado é recusado", async () => {
      const user = await criarUsuario();
      const created = await notificationUnsubscribe.create(user.id, [
        "TASK_DUE",
      ]);

      await notificationUnsubscribe.markTokenAsUsed(created.id);

      await expect(
        notificationUnsubscribe.findOneValidByToken(created.token),
      ).rejects.toThrow("não foi encontrado ou já expirou");
    });

    // Marcar duas vezes não pode reescrever a data do primeiro uso.
    test("marcar como usado duas vezes não sobrescreve", async () => {
      const user = await criarUsuario();
      const created = await notificationUnsubscribe.create(user.id, []);

      const primeira = await notificationUnsubscribe.markTokenAsUsed(
        created.id,
      );
      const segunda = await notificationUnsubscribe.markTokenAsUsed(created.id);

      expect(primeira.used_at).not.toBeNull();
      expect(segunda).toBeNull();
    });

    test("dura noventa dias", () => {
      expect(notificationUnsubscribe.EXPIRATION_IN_MILISECONDS).toBe(
        90 * 24 * 60 * 60 * 1000,
      );
    });
  });

  describe("aplicar o descadastro", () => {
    test("desliga só o tipo pedido", async () => {
      const user = await criarUsuario();
      const created = await notificationUnsubscribe.create(user.id, [
        "TASK_DUE",
      ]);
      const token = await notificationUnsubscribe.findOneValidByToken(
        created.token,
      );

      const disabled = await notificationUnsubscribe.apply(token, {
        type: "TASK_DUE",
      });

      expect(disabled).toEqual(["TASK_DUE"]);
      expect((await preferenciaDe(user.id, "TASK_DUE")).enabled).toBe(false);
      // Os outros tipos continuam ligados: descadastro por tipo não pode
      // virar descadastro total por acidente.
      expect((await preferenciaDe(user.id, "VISIT_UPCOMING")).enabled).toBe(
        true,
      );
    });

    test("sem tipo, desliga o catálogo inteiro", async () => {
      const user = await criarUsuario();
      const created = await notificationUnsubscribe.create(user.id, [
        "TASK_DUE",
      ]);
      const token = await notificationUnsubscribe.findOneValidByToken(
        created.token,
      );

      const disabled = await notificationUnsubscribe.apply(token);

      expect(disabled.sort()).toEqual(
        notificationUnsubscribe.allTypes().sort(),
      );

      for (const type of notificationUnsubscribe.allTypes()) {
        expect((await preferenciaDe(user.id, type)).enabled).toBe(false);
      }
    });

    // Descadastro por engano não pode custar a configuração inteira: quem
    // religa depois espera encontrar as antecedências que escolheu.
    test("desligar preserva os lembretes já configurados", async () => {
      const user = await criarUsuario();
      await notificationPreference.replace(user.id, "TASK_DUE", {
        enabled: true,
        send_at_time: "07:00",
        reminders: [10080, 1440],
      });

      const created = await notificationUnsubscribe.create(user.id, [
        "TASK_DUE",
      ]);
      const token = await notificationUnsubscribe.findOneValidByToken(
        created.token,
      );
      await notificationUnsubscribe.apply(token, { type: "TASK_DUE" });

      const preference = await preferenciaDe(user.id, "TASK_DUE");

      expect(preference.enabled).toBe(false);
      expect(preference.reminders).toEqual([10080, 1440]);
      expect(preference.send_at_time).toBe("07:00");
    });

    test("aplicar consome o token", async () => {
      const user = await criarUsuario();
      const created = await notificationUnsubscribe.create(user.id, [
        "TASK_DUE",
      ]);
      const token = await notificationUnsubscribe.findOneValidByToken(
        created.token,
      );

      await notificationUnsubscribe.apply(token);

      await expect(
        notificationUnsubscribe.findOneValidByToken(created.token),
      ).rejects.toThrow("não foi encontrado ou já expirou");
    });

    // A garantia que interessa: desligar não é só gravar uma flag, é
    // parar de gerar e-mail. Sem este teste, o descadastro poderia ficar
    // bonito na tela e continuar mandando aviso.
    test("depois do descadastro, o agendador não apura mais nada", async () => {
      const user = await criarUsuario();
      await notificationPreference.replace(user.id, "TASK_DUE", {
        enabled: true,
        send_at_time: "07:00",
        reminders: [1440],
      });

      await database.query("DELETE FROM notification_deliveries");
      await database.query("DELETE FROM task_assignees");
      await database.query("DELETE FROM tasks");

      await orchestrator.createTask({
        created_by: user.id,
        assigned_to: user.id,
        due_date: "2026-09-29T23:59:59.999-03:00",
      });

      const antes = await notificationScheduler.reserveDue({
        now: new Date("2026-09-28T07:30:00-03:00"),
        dryRun: true,
      });
      expect(antes.pending).toHaveLength(1);

      const created = await notificationUnsubscribe.create(user.id, [
        "TASK_DUE",
      ]);
      const token = await notificationUnsubscribe.findOneValidByToken(
        created.token,
      );
      await notificationUnsubscribe.apply(token, { type: "TASK_DUE" });

      const depois = await notificationScheduler.reserveDue({
        now: new Date("2026-09-28T07:30:00-03:00"),
        dryRun: true,
      });
      expect(depois.pending).toHaveLength(0);
    });

    // Hoje todo usuário nasce com as preferências gravadas, mas o
    // descadastro não pode depender disso: uma linha apagada à mão, ou um
    // tipo novo acrescentado ao catálogo depois do cadastro, deixariam a
    // pessoa sem linha. O INSERT do `disable` é o que garante que desligar
    // funciona mesmo assim.
    test("desliga mesmo quem não tem preferência gravada", async () => {
      const user = await criarUsuario();

      await database.query({
        text: "DELETE FROM notification_preferences WHERE user_id = $1",
        values: [user.id],
      });
      expect(await preferenciaDe(user.id, "TASK_DUE")).toBeNull();

      const created = await notificationUnsubscribe.create(user.id, []);
      const token = await notificationUnsubscribe.findOneValidByToken(
        created.token,
      );
      await notificationUnsubscribe.apply(token, { type: "TASK_DUE" });

      expect((await preferenciaDe(user.id, "TASK_DUE")).enabled).toBe(false);
    });
  });
});
