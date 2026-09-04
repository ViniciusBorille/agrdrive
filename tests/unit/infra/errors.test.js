import {
  InternalServerError,
  ServiceError,
  MethodNotAllowedError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from "@/infra/errors.js";

// O `toJSON` de cada erro é o que vai literalmente para o corpo da
// resposta HTTP, então ele é contrato público da API: a forma das chaves
// e o status_code não podem mudar sem quebrar quem consome.
describe("infra/errors.js", () => {
  describe("InternalServerError", () => {
    test("usa 500 e mensagem genérica por padrão", () => {
      const error = new InternalServerError({ cause: new Error("causa real") });

      expect(error.statusCode).toBe(500);
      expect(error.message).toBe("Um erro interno não esperado aconteceu.");
      expect(error.cause).toBeInstanceOf(Error);
    });

    test("aceita um statusCode customizado", () => {
      const error = new InternalServerError({ cause: null, statusCode: 502 });

      expect(error.statusCode).toBe(502);
    });

    test("o toJSON não vaza a causa original", () => {
      const error = new InternalServerError({
        cause: new Error("segredo do banco"),
      });

      expect(error.toJSON()).toEqual({
        name: "InternalServerError",
        message: "Um erro interno não esperado aconteceu.",
        action: "Entre em contato com o suporte.",
        status_code: 500,
      });
      expect(JSON.stringify(error)).not.toContain("segredo do banco");
    });
  });

  describe("ServiceError", () => {
    test("usa 503 e textos padrão", () => {
      const error = new ServiceError({ cause: "timeout" });

      expect(error.statusCode).toBe(503);
      expect(error.message).toBe("Serviço indisponível no momento.");
      expect(error.action).toBe("Verifique se o serviço está disponível.");
    });

    test("aceita message, action e context customizados", () => {
      const error = new ServiceError({
        message: "Google indisponível.",
        action: "Tente sincronizar novamente.",
        context: { userId: "user-1" },
      });

      expect(error.toJSON()).toEqual({
        name: "ServiceError",
        message: "Google indisponível.",
        action: "Tente sincronizar novamente.",
        status_code: 503,
        context: { userId: "user-1" },
      });
    });
  });

  describe("MethodNotAllowedError", () => {
    test("usa 405 e não aceita customização", () => {
      const error = new MethodNotAllowedError();

      expect(error.statusCode).toBe(405);
      expect(error.toJSON()).toEqual({
        name: "MethodNotAllowedError",
        message: "Método não permitido para este endpoint.",
        action:
          "Verifique se o método HTTP enviado é válido para este endpoint.",
        status_code: 405,
      });
    });
  });

  describe.each([
    [ValidationError, 400, "Um erro de validação ocorreu."],
    [NotFoundError, 404, "Não foi possível encontrar este recurso no sistema."],
    [UnauthorizedError, 401, "Usuário não autenticado."],
    [ForbiddenError, 403, "Acesso negado."],
  ])("%p", (ErrorClass, expectedStatusCode, defaultMessage) => {
    test(`usa ${expectedStatusCode} e a mensagem padrão`, () => {
      const error = new ErrorClass({});

      expect(error.statusCode).toBe(expectedStatusCode);
      expect(error.message).toBe(defaultMessage);
      expect(error.action).toEqual(expect.any(String));
    });

    test("aceita message e action customizados", () => {
      const error = new ErrorClass({
        message: "mensagem própria",
        action: "ação própria",
      });

      expect(error.toJSON()).toEqual({
        name: error.name,
        message: "mensagem própria",
        action: "ação própria",
        status_code: expectedStatusCode,
      });
    });

    // Os construtores desestruturam o argumento sem default, então chamar
    // sem objeto explode. Fica documentado para evitar `throw new X()`.
    test("exige um objeto como argumento", () => {
      expect(() => new ErrorClass()).toThrow(TypeError);
    });

    test("preserva a causa sem expô-la no toJSON", () => {
      const error = new ErrorClass({ cause: new Error("detalhe interno") });

      expect(error.cause).toBeInstanceOf(Error);
      expect(error.toJSON()).not.toHaveProperty("cause");
    });
  });
});
