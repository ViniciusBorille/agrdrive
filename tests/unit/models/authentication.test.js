import user from "@/models/user.js";
import password from "@/models/password.js";
import { NotFoundError } from "@/infra/errors.js";

jest.mock("../../../models/user.js", () => ({
  __esModule: true,
  default: { findOneByEmail: jest.fn() },
}));

import authentication from "@/models/authentication.js";

const GENERIC_ERROR = {
  name: "UnauthorizedError",
  message: "Dados de autenticação não conferem.",
};

beforeEach(() => {
  jest.restoreAllMocks();
  user.findOneByEmail.mockReset();
});

describe("models/authentication.js", () => {
  describe(".getUser()", () => {
    test("devolve o usuário quando e-mail e senha conferem", async () => {
      const storedUser = {
        id: "user-1",
        email: "pessoa@agrdrive.com.br",
        password: await password.hash("senhaCorreta"),
      };
      user.findOneByEmail.mockResolvedValue(storedUser);

      const authenticatedUser = await authentication.getUser(
        "pessoa@agrdrive.com.br",
        "senhaCorreta",
      );

      expect(authenticatedUser).toBe(storedUser);
    });

    // Sem o bcrypt descartável, o login responde muito mais rápido para
    // e-mails inexistentes e o tempo de resposta revela quem tem conta.
    test("gasta um bcrypt descartável quando o e-mail não existe", async () => {
      const dummySpy = jest.spyOn(password, "compareWithDummyHash");
      user.findOneByEmail.mockRejectedValue(
        new NotFoundError({
          message: "O email informado não foi encontrado no sistema",
        }),
      );

      await expect(
        authentication.getUser("nao.existe@agrdrive.com.br", "qualquerSenha"),
      ).rejects.toThrow(expect.objectContaining(GENERIC_ERROR));

      expect(dummySpy).toHaveBeenCalledTimes(1);
      expect(dummySpy).toHaveBeenCalledWith("qualquerSenha");
    });

    test("não gasta o bcrypt descartável quando só a senha está errada", async () => {
      const dummySpy = jest.spyOn(password, "compareWithDummyHash");
      user.findOneByEmail.mockResolvedValue({
        id: "user-1",
        email: "pessoa@agrdrive.com.br",
        password: await password.hash("senhaCorreta"),
      });

      await expect(
        authentication.getUser("pessoa@agrdrive.com.br", "senhaErrada"),
      ).rejects.toThrow(expect.objectContaining(GENERIC_ERROR));

      // O bcrypt da senha armazenada já foi executado neste caminho.
      expect(dummySpy).not.toHaveBeenCalled();
    });

    test("e-mail inexistente e senha errada produzem o mesmo erro", async () => {
      user.findOneByEmail.mockRejectedValue(
        new NotFoundError({
          message: "O email informado não foi encontrado no sistema",
        }),
      );
      const unknownEmailError = await authentication
        .getUser("nao.existe@agrdrive.com.br", "qualquerSenha")
        .catch((error) => error);

      user.findOneByEmail.mockResolvedValue({
        id: "user-1",
        email: "pessoa@agrdrive.com.br",
        password: await password.hash("senhaCorreta"),
      });
      const wrongPasswordError = await authentication
        .getUser("pessoa@agrdrive.com.br", "senhaErrada")
        .catch((error) => error);

      expect(unknownEmailError.message).toBe(wrongPasswordError.message);
      expect(unknownEmailError.action).toBe(wrongPasswordError.action);
      expect(unknownEmailError.statusCode).toBe(wrongPasswordError.statusCode);
    });

    // Banco fora do ar não é credencial inválida. Se este erro virasse
    // 401, o usuário tentaria "corrigir" a senha de uma conta correta e
    // a falha real ficaria invisível no monitoramento.
    test("propaga erro de infraestrutura em vez de mascarar como 401", async () => {
      const infraError = new Error("Erro na conexão com o Banco ou na Query.");
      infraError.name = "ServiceError";
      user.findOneByEmail.mockRejectedValue(infraError);

      await expect(
        authentication.getUser("pessoa@agrdrive.com.br", "senhaCorreta"),
      ).rejects.toBe(infraError);
    });

    test("não gasta bcrypt quando a falha não é de credencial", async () => {
      const infraError = new Error("banco fora");
      user.findOneByEmail.mockRejectedValue(infraError);
      const dummyCompare = jest.spyOn(password, "compareWithDummyHash");

      await expect(
        authentication.getUser("pessoa@agrdrive.com.br", "senhaCorreta"),
      ).rejects.toBe(infraError);
      expect(dummyCompare).not.toHaveBeenCalled();
    });
  });
});
