import { version as uuidVersion } from "uuid";
import orchestrator from "@/tests/orchestrator.js";
import user from "@/models/user.js";
import password from "@/models/password.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

describe("POST /api/v1/users", () => {
  describe("Anonymous user", () => {
    test("With unique and valid data", async () => {
      const response = await fetch("http:localhost:3000/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "viniciusborille",
          email: "vinibor@email.com",
          password: "senha123",
          role: "gestor",
        }),
      });

      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: responseBody.id,
        username: "viniciusborille",
        features: ["read:activation_token"],
        role: "gestor",
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });

      expect(uuidVersion(responseBody.id)).toBe(4);

      expect(Date.parse(responseBody.created_at)).not.toBeNaN();
      expect(Date.parse(responseBody.updated_at)).not.toBeNaN();

      const userInDatabase = await user.findOneByUsername("viniciusborille");
      const correctPasswordAMatch = await password.compare(
        "senha123",
        userInDatabase.password,
      );

      const incorrectPasswordAMatch = await password.compare(
        "senhaErrada",
        userInDatabase.password,
      );

      expect(correctPasswordAMatch).toBe(true);
      expect(incorrectPasswordAMatch).toBe(false);
    });
    test("With duplicated 'email'", async () => {
      const response1 = await fetch("http:localhost:3000/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "viniciusduplicado1",
          email: "vinibor@vinidup.com",
          password: "senha123",
          role: "gestor",
        }),
      });

      expect(response1.status).toBe(201);

      const response2 = await fetch("http:localhost:3000/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "viniciusduplicado",
          email: "Vinibor@vinidup.com",
          password: "senha123",
          role: "gestor",
        }),
      });

      expect(response2.status).toBe(400);

      const response2Body = await response2.json();

      expect(response2Body).toEqual({
        name: "ValidationError",
        message: "O email informado já está sendo utilizado.",
        action: "Utilize outro email para realizar esta operação.",
        status_code: 400,
      });
    });
    test("With duplicated 'username'", async () => {
      const response1 = await fetch("http:localhost:3000/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "viniciussilva",
          email: "vinisil@email.com",
          password: "senha123",
          role: "gestor",
        }),
      });

      expect(response1.status).toBe(201);

      const response2 = await fetch("http:localhost:3000/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "Viniciussilva",
          email: "vinisil2@email.com",
          password: "senha123",
          role: "gestor",
        }),
      });

      expect(response2.status).toBe(400);

      const response2Body = await response2.json();

      expect(response2Body).toEqual({
        name: "ValidationError",
        message: "O username informado já está sendo utilizado.",
        action: "Utilize outro username para realizar esta operação.",
        status_code: 400,
      });
    });
    test("With not allowed role", async () => {
      const response = await fetch("http:localhost:3000/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "viniciiiusborille",
          email: "viniborii@email.com",
          password: "senha123",
          role: "gestao",
        }),
      });

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ValidationError",
        message: "O role informado não é permitido.",
        action: "Utilize outro role para realizar o cadastro.",
        status_code: 400,
      });
    });
  });
  describe("Default user", () => {
    test("With unique and valid data", async () => {
      const user1 = await orchestrator.createUser();
      const activatedUser1 = await orchestrator.activateUser(user1);
      const user1SessionObject =
        await orchestrator.createSession(activatedUser1);

      const user2Response = await fetch("http://localhost:3000/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${user1SessionObject.token}`,
        },
        body: JSON.stringify({
          username: "usuarioLogado",
          email: "usuarioLogado@email.com",
          password: "senha123",
          role: "atendente",
        }),
      });

      expect(user2Response.status).toBe(403);

      const user2ResponseBody = await user2Response.json();

      expect(user2ResponseBody).toEqual({
        name: "ForbiddenError",
        message: "Você não possui permissão para executar esta ação.",
        action: 'Verifique se o seu usuário possui a feature "create:user"',
        status_code: 403,
      });
    });
  });
});
