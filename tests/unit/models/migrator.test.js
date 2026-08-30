import migrationRunner from "node-pg-migrate";
import database from "@/infra/database.js";

jest.mock("node-pg-migrate", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("../../../infra/database.js", () => ({
  __esModule: true,
  default: { getNewClient: jest.fn() },
}));

import migrator from "@/models/migrator.js";

let dbClient;

beforeEach(() => {
  dbClient = { end: jest.fn().mockResolvedValue() };
  database.getNewClient.mockReset().mockResolvedValue(dbClient);
  migrationRunner.mockReset().mockResolvedValue([]);
});

describe("models/migrator.js", () => {
  describe(".listPendingMigrations()", () => {
    // Listar não pode aplicar nada: o dryRun é o que separa o GET
    // (consulta) do POST (execução) no endpoint de migrations.
    test("roda em dryRun", async () => {
      await migrator.listPendingMigrations();

      expect(migrationRunner).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true, direction: "up" }),
      );
    });

    test("aponta para o diretório de migrations do projeto", async () => {
      await migrator.listPendingMigrations();

      const options = migrationRunner.mock.calls[0][0];
      expect(options.dir).toContain("migrations");
      expect(options.migrationsTable).toBe("pgmigrations");
    });

    test("devolve as migrations pendentes", async () => {
      migrationRunner.mockResolvedValue([
        { name: "1767740833060_create-users" },
      ]);

      await expect(migrator.listPendingMigrations()).resolves.toEqual([
        { name: "1767740833060_create-users" },
      ]);
    });

    test("fecha o client ao final", async () => {
      await migrator.listPendingMigrations();

      expect(dbClient.end).toHaveBeenCalledTimes(1);
    });

    // Sem o finally, uma migration quebrada deixaria a conexão pendurada
    // — e o endpoint seguinte já encontraria o Postgres sem slots.
    test("fecha o client mesmo quando a migration falha", async () => {
      migrationRunner.mockRejectedValue(new Error("migration quebrada"));

      await expect(migrator.listPendingMigrations()).rejects.toThrow(
        "migration quebrada",
      );
      expect(dbClient.end).toHaveBeenCalledTimes(1);
    });

    test("não quebra quando nem chega a abrir o client", async () => {
      database.getNewClient.mockRejectedValue(new Error("banco fora"));

      await expect(migrator.listPendingMigrations()).rejects.toThrow(
        "banco fora",
      );
    });
  });

  describe(".runPendingMigrations()", () => {
    test("roda de verdade, com dryRun desligado", async () => {
      await migrator.runPendingMigrations();

      expect(migrationRunner).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: false, direction: "up" }),
      );
    });

    test("devolve as migrations aplicadas", async () => {
      migrationRunner.mockResolvedValue([
        { name: "1790600000001_hash-tokens" },
      ]);

      await expect(migrator.runPendingMigrations()).resolves.toEqual([
        { name: "1790600000001_hash-tokens" },
      ]);
    });

    test("fecha o client ao final", async () => {
      await migrator.runPendingMigrations();

      expect(dbClient.end).toHaveBeenCalledTimes(1);
    });

    test("fecha o client mesmo quando a migration falha", async () => {
      migrationRunner.mockRejectedValue(new Error("migration quebrada"));

      await expect(migrator.runPendingMigrations()).rejects.toThrow(
        "migration quebrada",
      );
      expect(dbClient.end).toHaveBeenCalledTimes(1);
    });
  });
});
