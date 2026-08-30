import database from "@/infra/database.js";
import cryptography from "@/infra/crypto.js";

jest.mock("../../../infra/database.js", () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import session from "@/models/session.js";
import { UnauthorizedError } from "@/infra/errors.js";

function queryText(callIndex = 0) {
  return database.query.mock.calls[callIndex][0].text.replace(/\s+/g, " ");
}

function queryValues(callIndex = 0) {
  return database.query.mock.calls[callIndex][0].values;
}

beforeEach(() => {
  database.query.mockReset();
});

describe("models/session.js", () => {
  describe(".create()", () => {
    test("guarda o hash e devolve o token cru", async () => {
      database.query.mockResolvedValue({
        rows: [{ id: "session-1", user_id: "user-1" }],
      });

      const newSession = await session.create("user-1");

      // O valor que vai para o cookie precisa ser o cru; o banco recebe
      // o digest. Confundir os dois desloga todo mundo.
      expect(newSession.token).toMatch(/^[0-9a-f]{96}$/);
      expect(queryValues()[0]).toBe(cryptography.sha256(newSession.token));
      expect(queryValues()[0]).not.toBe(newSession.token);
    });

    test("gera um token diferente a cada sessão", async () => {
      database.query.mockResolvedValue({ rows: [{ id: "session-1" }] });

      const primeira = await session.create("user-1");
      const segunda = await session.create("user-1");

      expect(primeira.token).not.toBe(segunda.token);
    });

    test("preserva as demais colunas devolvidas pelo banco", async () => {
      database.query.mockResolvedValue({
        rows: [
          { id: "session-1", user_id: "user-1", expires_at: "2026-10-01" },
        ],
      });

      const newSession = await session.create("user-1");

      expect(newSession).toMatchObject({
        id: "session-1",
        user_id: "user-1",
        expires_at: "2026-10-01",
      });
    });
  });

  describe(".findOneValidByToken()", () => {
    test("busca pelo hash, nunca pelo token cru", async () => {
      database.query.mockResolvedValue({
        rowCount: 1,
        rows: [{ id: "session-1", user_id: "user-1" }],
      });

      await session.findOneValidByToken("token-cru");

      expect(queryValues()).toEqual([cryptography.sha256("token-cru")]);
    });

    test("devolve a sessão encontrada", async () => {
      database.query.mockResolvedValue({
        rowCount: 1,
        rows: [{ id: "session-1", user_id: "user-1" }],
      });

      await expect(
        session.findOneValidByToken("token-cru"),
      ).resolves.toMatchObject({ id: "session-1" });
    });

    test("lança UnauthorizedError quando não há sessão válida", async () => {
      database.query.mockResolvedValue({ rowCount: 0, rows: [] });

      await expect(session.findOneValidByToken("token-morto")).rejects.toThrow(
        UnauthorizedError,
      );
    });
  });

  describe(".renew()", () => {
    test("estende o prazo sem trocar o token", async () => {
      database.query.mockResolvedValue({ rows: [{ id: "session-1" }] });

      await session.renew("session-1");

      // A renovação é por id: a coluna `token` não aparece no SET, então
      // o cookie do usuário continua valendo.
      expect(queryText()).toContain("UPDATE sessions SET expires_at");
      expect(queryText()).not.toContain("token =");
      expect(queryValues()[0]).toBe("session-1");
    });

    // Sem o LEAST, renovar indefinidamente daria sessão eterna; o teto
    // absoluto conta a partir da criação.
    test("respeita o teto absoluto contado desde a criação", async () => {
      database.query.mockResolvedValue({ rows: [{ id: "session-1" }] });

      await session.renew("session-1");

      expect(queryText()).toContain("LEAST(");
      expect(queryText()).toContain("created_at + ($3");
      expect(queryValues()[1]).toBe(session.EXPIRATION_IN_MILISECONDS);
      expect(queryValues()[2]).toBeGreaterThan(
        session.EXPIRATION_IN_MILISECONDS,
      );
    });

    test("devolve a sessão renovada", async () => {
      database.query.mockResolvedValue({
        rows: [{ id: "session-1", expires_at: "2026-10-01" }],
      });

      await expect(session.renew("session-1")).resolves.toMatchObject({
        expires_at: "2026-10-01",
      });
    });
  });

  describe(".expireById()", () => {
    test("joga o vencimento para o passado", async () => {
      database.query.mockResolvedValue({ rows: [{ id: "session-1" }] });

      await session.expireById("session-1");

      expect(queryText()).toContain(
        "expires_at = expires_at - interval '1 year'",
      );
      expect(queryValues()).toEqual(["session-1"]);
    });

    test("devolve a sessão expirada", async () => {
      database.query.mockResolvedValue({ rows: [{ id: "session-1" }] });

      await expect(session.expireById("session-1")).resolves.toEqual({
        id: "session-1",
      });
    });
  });

  describe(".expireAllByUserId()", () => {
    test("expira todas as sessões ativas do usuário", async () => {
      database.query.mockResolvedValue({ rows: [{ id: "session-1" }] });

      await session.expireAllByUserId("user-1");

      expect(queryValues()).toEqual(["user-1", null]);
      expect(queryText()).toContain("expires_at > NOW()");
    });

    // Usado na troca de senha: derruba as outras sessões mas mantém a
    // de quem está fazendo a troca. A exceção compara pelo hash.
    test("preserva a sessão informada em exceptToken, comparando o hash", async () => {
      database.query.mockResolvedValue({ rows: [] });

      await session.expireAllByUserId("user-1", { exceptToken: "token-cru" });

      expect(queryValues()).toEqual([
        "user-1",
        cryptography.sha256("token-cru"),
      ]);
      expect(queryValues()[1]).not.toBe("token-cru");
    });

    test("devolve as sessões que foram expiradas", async () => {
      database.query.mockResolvedValue({
        rows: [{ id: "session-1" }, { id: "session-2" }],
      });

      await expect(session.expireAllByUserId("user-1")).resolves.toHaveLength(
        2,
      );
    });
  });
});
