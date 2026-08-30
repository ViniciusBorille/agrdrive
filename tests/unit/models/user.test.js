import database from "@/infra/database.js";
import password from "@/models/password.js";

jest.mock("../../../infra/database.js", () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import user from "@/models/user.js";
import { ValidationError, NotFoundError } from "@/infra/errors.js";

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

function queryAt(callIndex = 0) {
  return database.query.mock.calls[callIndex][0];
}

const found = (rows) => ({ rowCount: rows.length, rows });
const empty = () => ({ rowCount: 0, rows: [] });

beforeEach(() => {
  database.query.mockReset();
  jest.restoreAllMocks();
});

describe("models/user.js", () => {
  // Username e e-mail são comparados com LOWER dos dois lados: o usuário
  // precisa conseguir logar sem acertar a caixa exata do cadastro.
  describe.each([
    [
      "findOneByUsername",
      "username",
      "O username informado não foi encontrado no sistema",
    ],
    [
      "findOneByEmail",
      "email",
      "O email informado não foi encontrado no sistema",
    ],
  ])(".%s()", (method, column, notFoundMessage) => {
    test("compara ignorando maiúsculas e minúsculas", async () => {
      database.query.mockResolvedValue(found([{ id: "user-1" }]));

      await user[method]("VALOR");

      expect(normalize(queryAt().text)).toContain(
        `LOWER(${column}) = LOWER($1)`,
      );
      expect(queryAt().values).toEqual(["VALOR"]);
    });

    test("devolve o usuário encontrado", async () => {
      database.query.mockResolvedValue(found([{ id: "user-1" }]));

      await expect(user[method]("valor")).resolves.toEqual({ id: "user-1" });
    });

    test("lança NotFoundError quando não encontra", async () => {
      database.query.mockResolvedValue(empty());

      await expect(user[method]("valor")).rejects.toThrow(
        expect.objectContaining({
          name: "NotFoundError",
          message: notFoundMessage,
        }),
      );
    });
  });

  describe(".findOneById()", () => {
    test("busca pela chave primária", async () => {
      database.query.mockResolvedValue(found([{ id: "user-1" }]));

      await user.findOneById("user-1");

      expect(normalize(queryAt().text)).toContain("WHERE id = $1");
    });

    test("lança NotFoundError quando o id não existe", async () => {
      database.query.mockResolvedValue(empty());

      await expect(user.findOneById("user-sumido")).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe(".create()", () => {
    function mockCreateHappyPath() {
      database.query
        .mockResolvedValueOnce(empty()) // username livre
        .mockResolvedValueOnce(empty()) // email livre
        .mockResolvedValueOnce(found([{ id: "user-1" }])); // insert
    }

    test("nunca grava a senha em texto puro", async () => {
      mockCreateHappyPath();

      await user.create({
        username: "Fulano",
        email: "fulano@agrdrive.com.br",
        password: "senhaCorreta",
      });

      const insertedPassword = queryAt(2).values[2];
      expect(insertedPassword).not.toBe("senhaCorreta");
      expect(insertedPassword).toMatch(/^\$2[aby]\$/);
    });

    // Todo usuário nasce só com o token de ativação: é a ativação que
    // troca isso pelas features de sessão.
    test("injeta read:activation_token como feature inicial", async () => {
      mockCreateHappyPath();

      await user.create({
        username: "Fulano",
        email: "fulano@agrdrive.com.br",
        password: "senhaCorreta",
      });

      expect(queryAt(2).values[3]).toEqual(["read:activation_token"]);
    });

    test("preserva as features de módulo escolhidas no cadastro", async () => {
      mockCreateHappyPath();

      await user.create({
        username: "Fulano",
        email: "fulano@agrdrive.com.br",
        password: "senhaCorreta",
        features: ["use:tasks", "use:agenda"],
      });

      expect(queryAt(2).values[3]).toEqual([
        "read:activation_token",
        "use:tasks",
        "use:agenda",
      ]);
    });

    test("recusa username já utilizado antes de tocar no e-mail", async () => {
      database.query.mockResolvedValueOnce(found([{ username: "Fulano" }]));

      await expect(
        user.create({
          username: "Fulano",
          email: "fulano@agrdrive.com.br",
          password: "senhaCorreta",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          name: "ValidationError",
          message: "O username informado já está sendo utilizado.",
        }),
      );
      expect(database.query).toHaveBeenCalledTimes(1);
    });

    test("recusa e-mail já utilizado", async () => {
      database.query
        .mockResolvedValueOnce(empty())
        .mockResolvedValueOnce(found([{ email: "fulano@agrdrive.com.br" }]));

      await expect(
        user.create({
          username: "Fulano",
          email: "fulano@agrdrive.com.br",
          password: "senhaCorreta",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          message: "O email informado já está sendo utilizado.",
        }),
      );
    });

    test("devolve o usuário criado", async () => {
      mockCreateHappyPath();

      await expect(
        user.create({
          username: "Fulano",
          email: "fulano@agrdrive.com.br",
          password: "senhaCorreta",
        }),
      ).resolves.toEqual({ id: "user-1" });
    });
  });

  describe(".update()", () => {
    const currentUser = {
      id: "user-1",
      username: "Fulano",
      email: "fulano@agrdrive.com.br",
      password: "hash-antigo",
    };

    function mockCurrentUser() {
      database.query.mockResolvedValueOnce(found([currentUser]));
    }

    test("mescla os valores novos por cima dos atuais", async () => {
      mockCurrentUser();
      database.query.mockResolvedValueOnce(found([{ id: "user-1" }]));

      await user.update("Fulano", {});

      expect(queryAt(1).values).toEqual([
        "user-1",
        "Fulano",
        "fulano@agrdrive.com.br",
        "hash-antigo",
      ]);
    });

    // Só vale checar unicidade se o valor realmente mudou; senão o
    // próprio registro do usuário apareceria como conflito.
    test("não revalida o username quando ele não mudou", async () => {
      mockCurrentUser();
      database.query.mockResolvedValueOnce(found([{ id: "user-1" }]));

      await user.update("Fulano", { username: "fulano" });

      expect(database.query).toHaveBeenCalledTimes(2);
    });

    test("valida a unicidade quando o username muda", async () => {
      mockCurrentUser();
      database.query
        .mockResolvedValueOnce(empty())
        .mockResolvedValueOnce(found([{ id: "user-1" }]));

      await user.update("Fulano", { username: "NovoNome" });

      expect(normalize(queryAt(1).text)).toContain(
        "LOWER(username) = LOWER($1)",
      );
    });

    test("recusa quando o novo username já existe", async () => {
      mockCurrentUser();
      database.query.mockResolvedValueOnce(found([{ username: "Ocupado" }]));

      await expect(
        user.update("Fulano", { username: "Ocupado" }),
      ).rejects.toThrow(ValidationError);
    });

    test("não revalida o e-mail quando ele não mudou", async () => {
      mockCurrentUser();
      database.query.mockResolvedValueOnce(found([{ id: "user-1" }]));

      await user.update("Fulano", { email: "FULANO@agrdrive.com.br" });

      expect(database.query).toHaveBeenCalledTimes(2);
    });

    test("recusa quando o novo e-mail já existe", async () => {
      mockCurrentUser();
      database.query.mockResolvedValueOnce(found([{ email: "ocupado@x.com" }]));

      await expect(
        user.update("Fulano", { email: "ocupado@x.com" }),
      ).rejects.toThrow(ValidationError);
    });

    test("hasheia a senha nova antes de gravar", async () => {
      mockCurrentUser();
      database.query.mockResolvedValueOnce(found([{ id: "user-1" }]));

      await user.update("Fulano", { password: "senhaNova" });

      const gravado = queryAt(1).values[3];
      expect(gravado).not.toBe("senhaNova");
      await expect(password.compare("senhaNova", gravado)).resolves.toBe(true);
    });

    test("propaga o NotFoundError quando o usuário não existe", async () => {
      database.query.mockResolvedValueOnce(empty());

      await expect(user.update("Inexistente", {})).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe(".setFeatures()", () => {
    test("substitui a lista inteira de features", async () => {
      database.query.mockResolvedValue(found([{ id: "user-1" }]));

      await user.setFeatures("user-1", ["create:session"]);

      expect(normalize(queryAt().text)).toContain("SET features = $2");
      expect(queryAt().values).toEqual(["user-1", ["create:session"]]);
    });
  });

  describe(".addFeatures()", () => {
    test("concatena sem descartar as features atuais", async () => {
      database.query.mockResolvedValue(found([{ id: "user-1" }]));

      await user.addFeatures("user-1", ["use:agenda"]);

      expect(normalize(queryAt().text)).toContain(
        "features = array_cat(features, $2)",
      );
      expect(queryAt().values).toEqual(["user-1", ["use:agenda"]]);
    });
  });

  describe(".findAll()", () => {
    test("não seleciona a coluna de senha nem o e-mail", async () => {
      database.query.mockResolvedValue(found([{ id: "user-1" }]));

      await user.findAll();

      const text = normalize(queryAt().text);
      expect(text).toContain("SELECT id, username, features");
      expect(text).not.toContain("password");
      expect(text).not.toContain("email");
    });

    test("ordena do mais antigo para o mais novo", async () => {
      database.query.mockResolvedValue(found([]));

      await user.findAll();

      expect(normalize(queryAt().text)).toContain("ORDER BY created_at ASC");
    });

    test("devolve as linhas encontradas", async () => {
      database.query.mockResolvedValue(
        found([{ id: "user-1" }, { id: "user-2" }]),
      );

      await expect(user.findAll()).resolves.toHaveLength(2);
    });
  });
});
