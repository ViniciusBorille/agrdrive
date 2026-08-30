import database from "@/infra/database.js";
import email from "@/infra/email.js";

jest.mock("../../../infra/database.js", () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

jest.mock("../../../infra/email.js", () => ({
  __esModule: true,
  default: { send: jest.fn() },
}));

import recovery from "@/models/recovery.js";

beforeEach(() => {
  database.query.mockReset();
  email.send.mockReset();
});

describe("models/recovery.js", () => {
  describe(".sendEmailToUser()", () => {
    // O link precisa carregar o token cru: o banco guarda só o hash, e o
    // `id` da linha deixou de ser credencial.
    test("monta o link com o token cru devolvido por create()", async () => {
      await recovery.sendEmailToUser(
        { username: "Fulano", email: "fulano@agrdrive.com.br" },
        { id: "linha-1", token: "token-cru", token_hash: "hash-no-banco" },
      );

      const sentEmail = email.send.mock.calls[0][0];
      expect(sentEmail.to).toBe("fulano@agrdrive.com.br");
      expect(sentEmail.subject).toBe("Recuperação de senha no AgrDrive");
      expect(sentEmail.text).toContain(
        "http://localhost:3000/recuperar-senha/token-cru",
      );
      expect(sentEmail.text).not.toContain("hash-no-banco");
      expect(sentEmail.text).not.toContain("linha-1");
    });

    // Quem não pediu a recuperação precisa saber que pode ignorar — é o
    // que evita pânico quando alguém digita o e-mail errado.
    test("orienta a ignorar quando o usuário não solicitou", async () => {
      await recovery.sendEmailToUser(
        { username: "Fulano", email: "fulano@agrdrive.com.br" },
        { token: "token-cru" },
      );

      expect(email.send.mock.calls[0][0].text).toContain(
        "Se você não solicitou a recuperação de senha, ignore este e-mail.",
      );
    });

    test("envia a partir do remetente institucional", async () => {
      await recovery.sendEmailToUser(
        { username: "Fulano", email: "fulano@agrdrive.com.br" },
        { token: "token-cru" },
      );

      expect(email.send.mock.calls[0][0].from).toBe(
        "AgrDrive <contato@agrdrive.com.br>",
      );
    });
  });

  describe(".markTokenAsUsed()", () => {
    test("preenche used_at do token informado", async () => {
      database.query.mockResolvedValue({
        rows: [{ id: "linha-1", used_at: "2026-09-01T00:00:00.000Z" }],
      });

      const usedToken = await recovery.markTokenAsUsed("linha-1");

      const query = database.query.mock.calls[0][0];
      expect(query.text.replace(/\s+/g, " ")).toContain(
        "UPDATE password_recovery_tokens SET used_at",
      );
      expect(query.values).toEqual(["linha-1"]);
      expect(usedToken.used_at).toBe("2026-09-01T00:00:00.000Z");
    });
  });
});
