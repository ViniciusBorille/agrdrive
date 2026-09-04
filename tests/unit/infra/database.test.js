import { Client } from "pg";

jest.mock("pg", () => {
  const client = {
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
  };

  return {
    __esModule: true,
    Client: jest.fn(() => client),
    types: { setTypeParser: jest.fn() },
    __client: client,
  };
});

import database from "@/infra/database.js";
import { ServiceError } from "@/infra/errors.js";

const client = jest.requireMock("pg").__client;

beforeEach(() => {
  Client.mockClear();
  client.connect.mockReset().mockResolvedValue();
  client.query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
  client.end.mockReset().mockResolvedValue();
});

describe("infra/database.js", () => {
  describe(".query()", () => {
    test("devolve o resultado da query", async () => {
      client.query.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      const result = await database.query("SELECT 1;");

      expect(result.rows).toEqual([{ id: 1 }]);
      expect(client.query).toHaveBeenCalledWith("SELECT 1;");
    });

    // Cada query abre e fecha a própria conexão: em serverless não há
    // pool compartilhado, e deixar conexão aberta esgota o Postgres.
    test("fecha a conexão depois de executar", async () => {
      await database.query("SELECT 1;");

      expect(client.end).toHaveBeenCalledTimes(1);
    });

    test("envolve o erro do banco em ServiceError", async () => {
      client.query.mockRejectedValue(new Error("relation does not exist"));

      await expect(database.query("SELECT 1;")).rejects.toThrow(
        expect.objectContaining({
          name: "ServiceError",
          message: "Erro na conexão com o Banco ou na Query.",
        }),
      );
    });

    test("fecha a conexão mesmo quando a query falha", async () => {
      client.query.mockRejectedValue(new Error("boom"));

      await expect(database.query("SELECT 1;")).rejects.toThrow(ServiceError);
      expect(client.end).toHaveBeenCalledTimes(1);
    });

    // Se o `connect` falhar não existe client para fechar; o `?.` evita
    // que um erro de conexão vire um TypeError mascarando a causa real.
    test("não quebra quando nem chega a conectar", async () => {
      client.connect.mockRejectedValue(new Error("conexão recusada"));

      await expect(database.query("SELECT 1;")).rejects.toThrow(ServiceError);
      expect(client.end).not.toHaveBeenCalled();
    });
  });

  describe(".transaction()", () => {
    test("envolve o callback em BEGIN e COMMIT", async () => {
      const callback = jest.fn().mockResolvedValue("resultado");

      const result = await database.transaction(callback);

      expect(result).toBe("resultado");
      expect(client.query).toHaveBeenNthCalledWith(1, "BEGIN");
      expect(client.query).toHaveBeenLastCalledWith("COMMIT");
      expect(callback).toHaveBeenCalledWith(client);
    });

    test("faz ROLLBACK quando o callback falha", async () => {
      const callback = jest.fn().mockRejectedValue(new Error("falhou no meio"));

      await expect(database.transaction(callback)).rejects.toThrow(
        ServiceError,
      );
      expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    });

    test("envolve o erro do callback em ServiceError", async () => {
      const callback = jest.fn().mockRejectedValue(new Error("falhou"));

      await expect(database.transaction(callback)).rejects.toThrow(
        expect.objectContaining({
          name: "ServiceError",
          message: "Erro na transação com o Banco de Dados.",
        }),
      );
    });

    // Um ServiceError vindo de dentro já descreve o problema real; ficar
    // reembrulhando esconderia a mensagem específica.
    test("repassa um ServiceError vindo do callback sem reembrulhar", async () => {
      const callback = jest
        .fn()
        .mockRejectedValue(
          new ServiceError({ message: "Erro específico do domínio." }),
        );

      await expect(database.transaction(callback)).rejects.toThrow(
        expect.objectContaining({ message: "Erro específico do domínio." }),
      );
    });

    test("não deixa o erro do ROLLBACK mascarar o erro original", async () => {
      const callback = jest.fn().mockRejectedValue(new Error("falhou no meio"));
      client.query.mockImplementation(async (sql) => {
        if (sql === "ROLLBACK") throw new Error("conexão já morreu");
        return { rows: [] };
      });

      await expect(database.transaction(callback)).rejects.toThrow(
        expect.objectContaining({
          message: "Erro na transação com o Banco de Dados.",
        }),
      );
    });

    test("fecha a conexão em qualquer desfecho", async () => {
      await database.transaction(jest.fn().mockResolvedValue(null));
      expect(client.end).toHaveBeenCalledTimes(1);

      client.end.mockClear();

      await expect(
        database.transaction(jest.fn().mockRejectedValue(new Error("x"))),
      ).rejects.toThrow();
      expect(client.end).toHaveBeenCalledTimes(1);
    });
  });

  describe(".getNewClient()", () => {
    test("conecta usando as variáveis de ambiente", async () => {
      await database.getNewClient();

      expect(Client).toHaveBeenCalledWith(
        expect.objectContaining({
          host: process.env.POSTGRES_HOST,
          user: process.env.POSTGRES_USER,
          database: process.env.POSTGRES_DB,
        }),
      );
      expect(client.connect).toHaveBeenCalledTimes(1);
    });

    test("não exige SSL fora de produção", async () => {
      await database.getNewClient();

      expect(Client.mock.calls[0][0].ssl).toBe(false);
    });

    // Em produção o banco é remoto: sem SSL as credenciais e os dados
    // trafegariam em claro pela internet.
    test("exige SSL em produção", async () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv, NODE_ENV: "production" };

      await database.getNewClient();

      expect(Client.mock.calls[0][0].ssl).toBe(true);

      process.env = originalEnv;
    });
  });
});
