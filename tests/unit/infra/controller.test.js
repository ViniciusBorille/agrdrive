import session from "@/models/session.js";
import user from "@/models/user.js";
import logger from "@/infra/logger.js";

jest.mock("../../../models/session.js", () => ({
  __esModule: true,
  default: { findOneValidByToken: jest.fn(), EXPIRATION_IN_MILISECONDS: 1000 },
}));

jest.mock("../../../models/user.js", () => ({
  __esModule: true,
  default: { findOneById: jest.fn() },
}));

import controller from "@/infra/controller.js";
import {
  InternalServerError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from "@/infra/errors.js";

const ORIGINAL_ENV = process.env;

function buildResponse() {
  const response = {
    statusCode: null,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };

  return response;
}

function buildRequest(overrides = {}) {
  return {
    method: "POST",
    url: "/api/v1/sessions",
    headers: { "x-forwarded-for": "203.0.113.10" },
    ...overrides,
  };
}

beforeEach(() => {
  jest.restoreAllMocks();
  session.findOneValidByToken.mockReset();
  user.findOneById.mockReset();
  jest.spyOn(logger, "security").mockImplementation(() => {});
  process.env = { ...ORIGINAL_ENV };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("infra/controller.js", () => {
  describe(".errorHandlers.onNoMatch()", () => {
    test("responde 405 quando o método não é suportado pela rota", () => {
      const response = buildResponse();

      controller.errorHandlers.onNoMatch(buildRequest(), response);

      expect(response.statusCode).toBe(405);
      expect(response.body).toMatchObject({ name: "MethodNotAllowedError" });
    });
  });

  describe(".errorHandlers.onError()", () => {
    test("responde 401, limpa o cookie e registra o evento", () => {
      const response = buildResponse();
      const request = buildRequest({ context: { user: { id: "user-1" } } });

      controller.errorHandlers.onError(
        new UnauthorizedError({ message: "não autenticado", action: "logue" }),
        request,
        response,
      );

      expect(response.statusCode).toBe(401);
      // O cookie precisa morrer junto com a resposta, senão o navegador
      // segue reenviando um token que já foi recusado.
      expect(response.headers["Set-Cookie"]).toContain("session_id=invalid");
      expect(logger.security).toHaveBeenCalledWith(
        "authentication_denied",
        expect.objectContaining({ ip: "203.0.113.10", user_id: "user-1" }),
      );
    });

    test("usa user_id nulo no log quando não há usuário no contexto", () => {
      const response = buildResponse();

      controller.errorHandlers.onError(
        new UnauthorizedError({ message: "não autenticado", action: "logue" }),
        buildRequest(),
        response,
      );

      expect(logger.security).toHaveBeenCalledWith(
        "authentication_denied",
        expect.objectContaining({ user_id: null }),
      );
    });

    test("responde 403 e registra o evento, sem mexer no cookie", () => {
      const response = buildResponse();
      const request = buildRequest({ context: { user: { id: "user-1" } } });

      controller.errorHandlers.onError(
        new ForbiddenError({ message: "sem permissão", action: "peça acesso" }),
        request,
        response,
      );

      expect(response.statusCode).toBe(403);
      expect(response.headers["Set-Cookie"]).toBeUndefined();
      expect(logger.security).toHaveBeenCalledWith(
        "access_denied",
        expect.objectContaining({ user_id: "user-1" }),
      );
    });

    test("responde 403 com user_id nulo quando não há usuário no contexto", () => {
      const response = buildResponse();

      controller.errorHandlers.onError(
        new ForbiddenError({ message: "sem permissão", action: "peça acesso" }),
        buildRequest(),
        response,
      );

      expect(logger.security).toHaveBeenCalledWith(
        "access_denied",
        expect.objectContaining({ user_id: null }),
      );
    });

    test("repassa o ValidationError sem registrar evento de segurança", () => {
      const response = buildResponse();

      controller.errorHandlers.onError(
        new ValidationError({ message: "campo inválido", action: "corrija" }),
        buildRequest(),
        response,
      );

      expect(response.statusCode).toBe(400);
      expect(response.body).toMatchObject({ name: "ValidationError" });
      expect(logger.security).not.toHaveBeenCalled();
    });

    test("repassa o NotFoundError", () => {
      const response = buildResponse();

      controller.errorHandlers.onError(
        new NotFoundError({ message: "não existe", action: "confira o id" }),
        buildRequest(),
        response,
      );

      expect(response.statusCode).toBe(404);
      expect(response.body).toMatchObject({ name: "NotFoundError" });
    });

    // Qualquer erro não mapeado vira 500 genérico: a causa original fica
    // no log do servidor e nunca vaza no corpo da resposta.
    test("converte erro desconhecido em 500 sem expor a causa", () => {
      const response = buildResponse();
      const consoleError = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      controller.errorHandlers.onError(
        new Error("detalhe interno do banco"),
        buildRequest(),
        response,
      );

      expect(response.statusCode).toBe(500);
      expect(response.body).toMatchObject({ name: "InternalServerError" });
      expect(JSON.stringify(response.body)).not.toContain(
        "detalhe interno do banco",
      );
      expect(consoleError).toHaveBeenCalledWith(
        expect.any(InternalServerError),
      );
    });
  });

  describe(".setSessionCookie()", () => {
    test("emite o cookie httpOnly com o prazo da sessão", () => {
      const response = buildResponse();

      controller.setSessionCookie("token-cru", response);

      const setCookie = response.headers["Set-Cookie"];
      expect(setCookie).toContain("session_id=token-cru");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
      expect(setCookie).toContain("Max-Age=1");
      expect(setCookie).not.toContain("Secure");
    });

    test("marca o cookie como Secure em produção", () => {
      process.env = { ...ORIGINAL_ENV, NODE_ENV: "production" };
      const response = buildResponse();

      controller.setSessionCookie("token-cru", response);

      expect(response.headers["Set-Cookie"]).toContain("Secure");
    });
  });

  describe(".clearSessionCookie()", () => {
    test("expira o cookie com Max-Age negativo", () => {
      const response = buildResponse();

      controller.clearSessionCookie(response);

      const setCookie = response.headers["Set-Cookie"];
      expect(setCookie).toContain("session_id=invalid");
      expect(setCookie).toContain("Max-Age=-1");
    });

    test("marca o cookie como Secure em produção", () => {
      process.env = { ...ORIGINAL_ENV, NODE_ENV: "production" };
      const response = buildResponse();

      controller.clearSessionCookie(response);

      expect(response.headers["Set-Cookie"]).toContain("Secure");
    });
  });

  describe(".injectAnonymousOrUser()", () => {
    test("injeta o usuário da sessão quando há cookie válido", async () => {
      const userObject = { id: "user-1", features: ["read:session"] };
      session.findOneValidByToken.mockResolvedValue({ user_id: "user-1" });
      user.findOneById.mockResolvedValue(userObject);

      const request = buildRequest({ cookies: { session_id: "token-cru" } });
      const next = jest.fn();

      await controller.injectAnonymousOrUser(request, buildResponse(), next);

      expect(session.findOneValidByToken).toHaveBeenCalledWith("token-cru");
      expect(request.context.user).toEqual(userObject);
      expect(next).toHaveBeenCalledTimes(1);
    });

    test("injeta o usuário anônimo quando não há cookie", async () => {
      const request = buildRequest();
      const next = jest.fn();

      await controller.injectAnonymousOrUser(request, buildResponse(), next);

      expect(request.context.user.features).toEqual([
        "create:session",
        "read:activation_token",
        "create:recovery_token",
        "read:recovery_token",
      ]);
      expect(request.context.user.id).toBeUndefined();
      expect(next).toHaveBeenCalledTimes(1);
    });

    test("injeta o usuário anônimo quando o cookie está vazio", async () => {
      const request = buildRequest({ cookies: { session_id: "" } });
      const next = jest.fn();

      await controller.injectAnonymousOrUser(request, buildResponse(), next);

      expect(session.findOneValidByToken).not.toHaveBeenCalled();
      expect(request.context.user.features).toContain("create:session");
    });

    test("propaga o erro quando a sessão do cookie não é válida", async () => {
      session.findOneValidByToken.mockRejectedValue(
        new UnauthorizedError({ message: "expirada", action: "logue" }),
      );
      const request = buildRequest({ cookies: { session_id: "token-morto" } });
      const next = jest.fn();

      await expect(
        controller.injectAnonymousOrUser(request, buildResponse(), next),
      ).rejects.toThrow(UnauthorizedError);
      expect(next).not.toHaveBeenCalled();
    });

    test("preserva o que já existia em request.context", async () => {
      const request = buildRequest({ context: { algoAnterior: true } });

      await controller.injectAnonymousOrUser(
        request,
        buildResponse(),
        jest.fn(),
      );

      expect(request.context.algoAnterior).toBe(true);
    });
  });

  describe(".canRequest()", () => {
    test("segue adiante quando o usuário possui a feature", () => {
      const request = buildRequest({
        context: { user: { id: "user-1", features: ["create:session"] } },
      });
      const next = jest.fn();

      controller.canRequest("create:session")(request, buildResponse(), next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    test("lança ForbiddenError nomeando a feature que falta", () => {
      const request = buildRequest({
        context: { user: { id: "user-1", features: [] } },
      });
      const next = jest.fn();

      expect(() =>
        controller.canRequest("create:user")(request, buildResponse(), next),
      ).toThrow(
        expect.objectContaining({
          name: "ForbiddenError",
          action: 'Verifique se o seu usuário possui a feature "create:user"',
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe(".requireAuthentication()", () => {
    test("segue adiante quando há usuário autenticado no contexto", () => {
      const request = buildRequest({ context: { user: { id: "user-1" } } });
      const next = jest.fn();

      controller.requireAuthentication(request, buildResponse(), next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    // O usuário anônimo é injetado com features, mas sem `id` — é
    // exatamente essa ausência que separa anônimo de autenticado.
    test("lança UnauthorizedError para o usuário anônimo", () => {
      const request = buildRequest({
        context: { user: { features: ["create:session"] } },
      });
      const next = jest.fn();

      expect(() =>
        controller.requireAuthentication(request, buildResponse(), next),
      ).toThrow(
        expect.objectContaining({
          name: "UnauthorizedError",
          message: "Você precisa estar autenticado para acessar este recurso.",
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    test("lança UnauthorizedError quando não há contexto algum", () => {
      const next = jest.fn();

      expect(() =>
        controller.requireAuthentication(buildRequest(), buildResponse(), next),
      ).toThrow(UnauthorizedError);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
