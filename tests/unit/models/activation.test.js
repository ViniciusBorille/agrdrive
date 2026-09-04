import database from "@/infra/database.js";
import email from "@/infra/email.js";
import user from "@/models/user.js";

jest.mock("../../../infra/database.js", () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

jest.mock("../../../infra/email.js", () => ({
  __esModule: true,
  default: { send: jest.fn() },
}));

jest.mock("../../../models/user.js", () => ({
  __esModule: true,
  default: { findOneById: jest.fn(), setFeatures: jest.fn() },
}));

import activation from "@/models/activation.js";
import { ForbiddenError } from "@/infra/errors.js";

beforeEach(() => {
  database.query.mockReset();
  email.send.mockReset();
  user.findOneById.mockReset();
  user.setFeatures.mockReset();
});

describe("models/activation.js", () => {
  describe(".sendEmailToUser()", () => {
    // O link precisa carregar o token cru. Se algum dia ele passar a
    // carregar o `id` da linha ou o hash, o usuário recebe um link morto.
    test("monta o link com o token cru devolvido por create()", async () => {
      await activation.sendEmailToUser(
        { username: "Fulano", email: "fulano@agrdrive.com.br" },
        { id: "linha-1", token: "token-cru", token_hash: "hash-no-banco" },
      );

      const sentEmail = email.send.mock.calls[0][0];
      expect(sentEmail.to).toBe("fulano@agrdrive.com.br");
      expect(sentEmail.subject).toBe("Ative seu cadastro no AgrDrive!");
      expect(sentEmail.text).toContain(
        "http://localhost:3000/ativar/token-cru",
      );
      expect(sentEmail.text).not.toContain("hash-no-banco");
      expect(sentEmail.text).not.toContain("linha-1");
    });

    test("trata o usuário pelo username no corpo do e-mail", async () => {
      await activation.sendEmailToUser(
        { username: "Fulano", email: "fulano@agrdrive.com.br" },
        { token: "token-cru" },
      );

      expect(email.send.mock.calls[0][0].text).toContain("Fulano, clique");
    });

    test("envia a partir do remetente institucional", async () => {
      await activation.sendEmailToUser(
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

      const usedToken = await activation.markTokenAsUsed("linha-1");

      const query = database.query.mock.calls[0][0];
      expect(query.text.replace(/\s+/g, " ")).toContain(
        "UPDATE user_activation_tokens SET used_at",
      );
      expect(query.values).toEqual(["linha-1"]);
      expect(usedToken.used_at).toBe("2026-09-01T00:00:00.000Z");
    });
  });

  describe(".activateUserByUserId()", () => {
    test("troca o token de ativação pelas features de sessão", async () => {
      user.findOneById.mockResolvedValue({
        id: "user-1",
        features: ["read:activation_token"],
      });
      user.setFeatures.mockResolvedValue({ id: "user-1" });

      await activation.activateUserByUserId("user-1");

      expect(user.setFeatures).toHaveBeenCalledWith("user-1", [
        "create:session",
        "read:session",
        "update:user",
      ]);
    });

    // As features de módulo são escolhidas no cadastro, antes da
    // ativação: perdê-las aqui deixaria o usuário sem acesso ao sistema.
    test("preserva as features de módulo escolhidas no cadastro", async () => {
      user.findOneById.mockResolvedValue({
        id: "user-1",
        features: ["read:activation_token", "use:tasks", "use:agenda"],
      });
      user.setFeatures.mockResolvedValue({ id: "user-1" });

      await activation.activateUserByUserId("user-1");

      expect(user.setFeatures).toHaveBeenCalledWith("user-1", [
        "create:session",
        "read:session",
        "update:user",
        "use:tasks",
        "use:agenda",
      ]);
    });

    test("devolve o usuário já ativado", async () => {
      user.findOneById.mockResolvedValue({
        id: "user-1",
        features: ["read:activation_token"],
      });
      user.setFeatures.mockResolvedValue({ id: "user-1", features: [] });

      await expect(activation.activateUserByUserId("user-1")).resolves.toEqual({
        id: "user-1",
        features: [],
      });
    });

    // Sem a feature, o usuário já foi ativado antes — reativar
    // rebaixaria as permissões dele de volta ao conjunto inicial.
    test("recusa ativar quem já não tem read:activation_token", async () => {
      user.findOneById.mockResolvedValue({
        id: "user-1",
        features: ["create:session", "read:session"],
      });

      await expect(activation.activateUserByUserId("user-1")).rejects.toThrow(
        expect.objectContaining({
          name: "ForbiddenError",
          message: "Você não pode mais utilizar tokens de ativação.",
        }),
      );
      expect(user.setFeatures).not.toHaveBeenCalled();
    });

    test("o erro de recusa é um ForbiddenError", async () => {
      user.findOneById.mockResolvedValue({ id: "user-1", features: [] });

      await expect(activation.activateUserByUserId("user-1")).rejects.toThrow(
        ForbiddenError,
      );
    });
  });
});
