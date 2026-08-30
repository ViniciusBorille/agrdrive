import orchestrator from "@/tests/orchestrator.js";
import database from "@/infra/database.js";
import cryptography from "@/infra/crypto.js";
import session from "@/models/session.js";
import activation from "@/models/activation.js";
import recovery from "@/models/recovery.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

async function countRowsMatching(table, column, value) {
  const results = await database.query({
    text: `SELECT count(*)::int FROM ${table} WHERE ${column} = $1;`,
    values: [value],
  });

  return results.rows[0].count;
}

describe("Tokens guardados em repouso", () => {
  // O backfill da migração `hash-tokens-at-rest` hasheia os tokens já
  // existentes usando `sha256()` do Postgres, enquanto a aplicação usa o
  // `crypto` do Node. Se os dois não produzissem o mesmo digest, todas as
  // sessões ativas seriam invalidadas no deploy.
  describe("compatibilidade entre o hash do Postgres e o do Node", () => {
    test("produzem o mesmo digest", async () => {
      const values = [
        "5575f9a11eddcc674f50cbd1492fdc8cff2966f37c093d4acbca670ad182f7a8",
        "59d0ad37-4a6d-4818-950f-3b27cc64631c",
        "acentuação e emoji 🌱",
      ];

      const results = await database.query({
        text: `
          SELECT
            value,
            encode(sha256(convert_to(value, 'UTF8')), 'hex') AS digest
          FROM
            unnest($1::text[]) AS value
        ;`,
        values: [values],
      });

      expect(results.rows).toHaveLength(values.length);

      for (const row of results.rows) {
        expect(row.digest).toBe(cryptography.sha256(row.value));
      }
    });
  });

  describe("sessions", () => {
    test("o banco guarda o hash, nunca o token do cookie", async () => {
      const createdUser = await orchestrator.createUser();
      const sessionObject = await session.create(createdUser.id);

      expect(
        await countRowsMatching("sessions", "token", sessionObject.token),
      ).toBe(0);
      expect(
        await countRowsMatching(
          "sessions",
          "token",
          cryptography.sha256(sessionObject.token),
        ),
      ).toBe(1);
    });

    test("a sessão continua sendo encontrada pelo token cru", async () => {
      const createdUser = await orchestrator.createUser();
      const sessionObject = await session.create(createdUser.id);

      const foundSession = await session.findOneValidByToken(
        sessionObject.token,
      );

      expect(foundSession.id).toBe(sessionObject.id);
    });

    test("`exceptToken` preserva a sessão de quem fez a requisição", async () => {
      const createdUser = await orchestrator.createUser();
      const sessionToKeep = await session.create(createdUser.id);
      const sessionToExpire = await session.create(createdUser.id);

      await session.expireAllByUserId(createdUser.id, {
        exceptToken: sessionToKeep.token,
      });

      const keptSession = await session.findOneValidByToken(
        sessionToKeep.token,
      );
      expect(keptSession.id).toBe(sessionToKeep.id);

      await expect(
        session.findOneValidByToken(sessionToExpire.token),
      ).rejects.toThrow(expect.objectContaining({ name: "UnauthorizedError" }));
    });
  });

  describe("user_activation_tokens", () => {
    test("o banco guarda o hash, nunca o token do e-mail", async () => {
      const createdUser = await orchestrator.createUser();
      const activationToken = await activation.create(createdUser.id);

      expect(
        await countRowsMatching(
          "user_activation_tokens",
          "token_hash",
          activationToken.token,
        ),
      ).toBe(0);
      expect(
        await countRowsMatching(
          "user_activation_tokens",
          "token_hash",
          cryptography.sha256(activationToken.token),
        ),
      ).toBe(1);
    });

    test("o `id` da linha não vale como token", async () => {
      const createdUser = await orchestrator.createUser();
      const activationToken = await activation.create(createdUser.id);

      await expect(
        activation.findOneValidByToken(activationToken.id),
      ).rejects.toThrow(expect.objectContaining({ name: "NotFoundError" }));

      const foundToken = await activation.findOneValidByToken(
        activationToken.token,
      );
      expect(foundToken.id).toBe(activationToken.id);
    });
  });

  describe("password_recovery_tokens", () => {
    test("o banco guarda o hash, nunca o token do e-mail", async () => {
      const createdUser = await orchestrator.createUser();
      const recoveryToken = await recovery.create(createdUser.id);

      expect(
        await countRowsMatching(
          "password_recovery_tokens",
          "token_hash",
          recoveryToken.token,
        ),
      ).toBe(0);
      expect(
        await countRowsMatching(
          "password_recovery_tokens",
          "token_hash",
          cryptography.sha256(recoveryToken.token),
        ),
      ).toBe(1);
    });

    test("o `id` da linha não vale como token", async () => {
      const createdUser = await orchestrator.createUser();
      const recoveryToken = await recovery.create(createdUser.id);

      await expect(
        recovery.findOneValidByToken(recoveryToken.id),
      ).rejects.toThrow(expect.objectContaining({ name: "NotFoundError" }));

      const foundToken = await recovery.findOneValidByToken(
        recoveryToken.token,
      );
      expect(foundToken.id).toBe(recoveryToken.id);
    });
  });
});
