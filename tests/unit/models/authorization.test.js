import { InternalServerError } from "@/infra/errors";
import authorization from "@/models/authorization";

describe("models/authorization.js", () => {
  describe(".can()", () => {
    test("without `user`", () => {
      expect(() => {
        authorization.can();
      }).toThrow(InternalServerError);
    });
    test("without `user.features`", () => {
      const createdUser = {
        username: "UserWithoutFeatures",
      };
      expect(() => {
        authorization.can(createdUser);
      }).toThrow(InternalServerError);
    });
    test("with unknown `feature`", () => {
      const createdUser = {
        features: [],
      };
      expect(() => {
        authorization.can(createdUser, "unknown:feature");
      }).toThrow(InternalServerError);
    });
    test("with valid `user` and known `feature`", () => {
      const createdUser = {
        features: ["create:user"],
      };
      expect(authorization.can(createdUser, "create:user")).toBe(true);
    });
  });
  describe(".filterOutput()", () => {
    test("without `user`", () => {
      expect(() => {
        authorization.filterOutput();
      }).toThrow(InternalServerError);
    });
    test("without `user.features`", () => {
      const createdUser = {
        username: "UserWithoutFeatures",
      };
      expect(() => {
        authorization.filterOutput(createdUser);
      }).toThrow(InternalServerError);
    });
    test("with unknown `feature`", () => {
      const createdUser = {
        features: [],
      };
      expect(() => {
        authorization.filterOutput(createdUser, "unknown:feature");
      }).toThrow(InternalServerError);
    });
    test("with valid `user`, known `feature` but no `resource`", () => {
      const createdUser = {
        features: ["read:user"],
      };
      expect(() => {
        authorization.filterOutput(createdUser, "read:user");
      }).toThrow(InternalServerError);
    });
    test("with valid `user`, known `feature` ande `resource`", () => {
      const createdUser = {
        features: ["read:user"],
      };

      const resource = {
        id: 1,
        username: "resource",
        features: ["read:user"],
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        email: "resource@resource.com",
        password: "resource",
      };

      const results = authorization.filterOutput(
        createdUser,
        "read:user",
        resource,
      );
      expect(results).toEqual({
        id: 1,
        username: "resource",
        features: ["read:user"],
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      });
    });
  });

  // `update:user` é a única feature com regra de dono: ter a feature não
  // basta, é preciso ser o próprio usuário ou ter `update:user:others`.
  describe(".can() com resource em `update:user`", () => {
    test("permite editar o próprio cadastro", () => {
      const userTryingToUpdate = { id: "user-1", features: ["update:user"] };

      expect(
        authorization.can(userTryingToUpdate, "update:user", { id: "user-1" }),
      ).toBe(true);
    });

    test("bloqueia editar outro usuário sem `update:user:others`", () => {
      const userTryingToUpdate = { id: "user-1", features: ["update:user"] };

      expect(
        authorization.can(userTryingToUpdate, "update:user", { id: "user-2" }),
      ).toBe(false);
    });

    test("permite editar outro usuário com `update:user:others`", () => {
      const userTryingToUpdate = {
        id: "user-1",
        features: ["update:user", "update:user:others"],
      };

      expect(
        authorization.can(userTryingToUpdate, "update:user", { id: "user-2" }),
      ).toBe(true);
    });

    test("sem resource, apenas a posse da feature decide", () => {
      const userTryingToUpdate = { id: "user-1", features: ["update:user"] };

      expect(authorization.can(userTryingToUpdate, "update:user")).toBe(true);
    });

    test("devolve false quando o usuário não tem a feature", () => {
      const userTryingToUpdate = { id: "user-1", features: [] };

      expect(authorization.can(userTryingToUpdate, "read:user")).toBe(false);
    });
  });

  describe(".filterOutput() por feature", () => {
    const fullUserResource = {
      id: "user-1",
      username: "Fulano",
      email: "fulano@agrdrive.com.br",
      password: "hash-secreto",
      features: ["read:user"],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };

    test("`create:user` devolve o mesmo recorte de `read:user`", () => {
      const userTryingToRead = { id: "admin", features: ["create:user"] };

      const output = authorization.filterOutput(
        userTryingToRead,
        "create:user",
        fullUserResource,
      );

      expect(output).toEqual({
        id: "user-1",
        username: "Fulano",
        features: ["read:user"],
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      });
      expect(output).not.toHaveProperty("email");
      expect(output).not.toHaveProperty("password");
    });

    test("`read:user:self` expõe o e-mail apenas para o próprio dono", () => {
      const owner = { id: "user-1", features: ["read:user:self"] };

      const output = authorization.filterOutput(
        owner,
        "read:user:self",
        fullUserResource,
      );

      expect(output).toMatchObject({
        id: "user-1",
        email: "fulano@agrdrive.com.br",
      });
      expect(output).not.toHaveProperty("password");
    });

    test("`read:user:self` não devolve nada para um terceiro", () => {
      const outro = { id: "user-2", features: ["read:user:self"] };

      expect(
        authorization.filterOutput(outro, "read:user:self", fullUserResource),
      ).toBeUndefined();
    });

    test("`read:session` devolve a sessão apenas para o próprio dono", () => {
      const owner = { id: "user-1", features: ["read:session"] };
      const sessionResource = {
        id: "session-1",
        token: "token-cru",
        user_id: "user-1",
        expires_at: "2026-02-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      };

      expect(
        authorization.filterOutput(owner, "read:session", sessionResource),
      ).toEqual(sessionResource);
    });

    test("`read:session` não devolve a sessão de outro usuário", () => {
      const outro = { id: "user-2", features: ["read:session"] };

      expect(
        authorization.filterOutput(outro, "read:session", {
          id: "session-1",
          user_id: "user-1",
        }),
      ).toBeUndefined();
    });

    test("`read:activation_token` não expõe o hash do token", () => {
      const anonimo = { features: ["read:activation_token"] };
      const tokenResource = {
        id: "token-1",
        user_id: "user-1",
        token_hash: "hash-que-nao-pode-vazar",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2026-01-01T00:15:00.000Z",
        used_at: null,
      };

      const output = authorization.filterOutput(
        anonimo,
        "read:activation_token",
        tokenResource,
      );

      expect(output).not.toHaveProperty("token_hash");
      expect(output).toMatchObject({ id: "token-1", used_at: null });
    });

    test("`read:recovery_token` não expõe o hash do token", () => {
      const anonimo = { features: ["read:recovery_token"] };

      const output = authorization.filterOutput(
        anonimo,
        "read:recovery_token",
        {
          id: "token-1",
          user_id: "user-1",
          token_hash: "hash-que-nao-pode-vazar",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          expires_at: "2026-01-01T00:15:00.000Z",
          used_at: null,
        },
      );

      expect(output).not.toHaveProperty("token_hash");
      expect(output).toMatchObject({ id: "token-1" });
    });

    const statusResource = {
      updated_at: "2026-01-01T00:00:00.000Z",
      dependencies: {
        database: {
          version: "16.0",
          max_connections: 100,
          openned_connections: 1,
        },
      },
    };

    test("`read:status` esconde a versão do banco de quem não é admin", () => {
      const anonimo = { features: ["read:status"] };

      const output = authorization.filterOutput(
        anonimo,
        "read:status",
        statusResource,
      );

      expect(output.dependencies.database).toEqual({
        max_connections: 100,
        openned_connections: 1,
      });
    });

    test("`read:status` inclui a versão para quem tem `read:status:all`", () => {
      const admin = { features: ["read:status", "read:status:all"] };

      const output = authorization.filterOutput(
        admin,
        "read:status",
        statusResource,
      );

      expect(output.dependencies.database.version).toBe("16.0");
    });

    const migrationsResource = [
      {
        path: "/infra/migrations/1767740833060_create-users.js",
        name: "1767740833060_create-users",
        timestamp: 1767740833060,
        extra: "campo interno que não deve sair",
      },
    ];

    test("`read:migration` devolve só path, name e timestamp", () => {
      const admin = { features: ["read:migration"] };

      expect(
        authorization.filterOutput(admin, "read:migration", migrationsResource),
      ).toEqual([
        {
          path: "/infra/migrations/1767740833060_create-users.js",
          name: "1767740833060_create-users",
          timestamp: 1767740833060,
        },
      ]);
    });

    test("`create:migration` devolve o mesmo recorte", () => {
      const admin = { features: ["create:migration"] };

      expect(
        authorization.filterOutput(
          admin,
          "create:migration",
          migrationsResource,
        ),
      ).toEqual([
        {
          path: "/infra/migrations/1767740833060_create-users.js",
          name: "1767740833060_create-users",
          timestamp: 1767740833060,
        },
      ]);
    });

    test("devolve undefined para uma feature sem recorte definido", () => {
      const admin = { features: ["update:user"] };

      expect(
        authorization.filterOutput(admin, "update:user", fullUserResource),
      ).toBeUndefined();
    });
  });
});
