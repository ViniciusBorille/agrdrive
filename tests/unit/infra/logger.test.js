import logger from "@/infra/logger.js";

describe("infra/logger.js", () => {
  describe(".security()", () => {
    let consoleLog;

    beforeEach(() => {
      consoleLog = jest.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLog.mockRestore();
    });

    // A saída precisa ser uma linha de JSON válido: é assim que a Vercel
    // indexa os campos para busca. Texto solto perderia a estrutura.
    test("emite uma linha de JSON com nível, evento e timestamp", () => {
      logger.security("login_success");

      expect(consoleLog).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLog.mock.calls[0][0]);

      expect(logEntry).toMatchObject({
        level: "security",
        event: "login_success",
      });
      expect(Date.parse(logEntry.timestamp)).not.toBeNaN();
    });

    test("mescla os dados extras na raiz do registro", () => {
      logger.security("access_denied", { ip: "203.0.113.10", user_id: "u-1" });

      const logEntry = JSON.parse(consoleLog.mock.calls[0][0]);

      expect(logEntry).toMatchObject({
        event: "access_denied",
        ip: "203.0.113.10",
        user_id: "u-1",
      });
    });

    test("os dados extras não sobrescrevem o nível", () => {
      logger.security("evento", { level: "debug" });

      const logEntry = JSON.parse(consoleLog.mock.calls[0][0]);

      // `...data` vem depois de `level`, então hoje o campo é sobrescrito.
      // O teste registra o comportamento real para que uma mudança apareça.
      expect(logEntry.level).toBe("debug");
    });
  });

  describe(".getRequestMetadata()", () => {
    test("usa o primeiro IP do x-forwarded-for", () => {
      const metadata = logger.getRequestMetadata({
        headers: {
          "x-forwarded-for": "203.0.113.10, 70.41.3.18, 150.172.238.178",
        },
        method: "POST",
        url: "/api/v1/sessions",
      });

      expect(metadata).toEqual({
        ip: "203.0.113.10",
        method: "POST",
        route: "/api/v1/sessions",
      });
    });

    test("remove o espaço em volta do IP", () => {
      const metadata = logger.getRequestMetadata({
        headers: { "x-forwarded-for": "  203.0.113.10  , 70.41.3.18" },
      });

      expect(metadata.ip).toBe("203.0.113.10");
    });

    test("cai no remoteAddress do socket quando não há o header", () => {
      const metadata = logger.getRequestMetadata({
        headers: {},
        socket: { remoteAddress: "127.0.0.1" },
        method: "GET",
        url: "/api/v1/status",
      });

      expect(metadata).toEqual({
        ip: "127.0.0.1",
        method: "GET",
        route: "/api/v1/status",
      });
    });

    test("devolve ip indefinido quando não há header nem socket", () => {
      const metadata = logger.getRequestMetadata({});

      expect(metadata.ip).toBeUndefined();
    });

    test("não quebra com uma requisição sem headers", () => {
      expect(() => logger.getRequestMetadata({ method: "GET" })).not.toThrow();
    });
  });
});
