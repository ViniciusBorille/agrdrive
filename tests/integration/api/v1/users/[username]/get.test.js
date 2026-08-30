import { version as uuidVersion } from "uuid";
import orchestrator from "@/tests/orchestrator.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

async function createAuthenticatedSession() {
  const createdUser = await orchestrator.createUser();
  const activatedUser = await orchestrator.activateUser(createdUser);
  return await orchestrator.createSession(activatedUser);
}

describe("GET /api/v1/users/[username]", () => {
  describe("Anonymous user", () => {
    test("Retrieving another user", async () => {
      await orchestrator.createUser({
        username: "UsuarioProtegido",
      });

      const response = await fetch(
        "http:localhost:3000/api/v1/users/UsuarioProtegido",
      );

      expect(response.status).toBe(401);

      const responseBody = await response.json();

      expect(responseBody).toEqual({
        name: "UnauthorizedError",
        message: "Você precisa estar autenticado para acessar este recurso.",
        action: "Faça login para continuar.",
        status_code: 401,
      });
    });
  });

  describe("Authenticated user", () => {
    test("With exact case match", async () => {
      const sessionObject = await createAuthenticatedSession();

      await orchestrator.createUser({
        username: "MesmoCase",
      });

      const response2 = await fetch(
        "http:localhost:3000/api/v1/users/MesmoCase",
        {
          headers: {
            Cookie: `session_id=${sessionObject.token}`,
          },
        },
      );

      expect(response2.status).toBe(200);

      const response2Body = await response2.json();

      expect(response2Body).toEqual({
        id: response2Body.id,
        username: "MesmoCase",
        features: ["read:activation_token"],
        created_at: response2Body.created_at,
        updated_at: response2Body.updated_at,
      });

      expect(uuidVersion(response2Body.id)).toBe(4);
      expect(Date.parse(response2Body.created_at)).not.toBeNaN();
      expect(Date.parse(response2Body.updated_at)).not.toBeNaN();
    });
    test("With case mismatch", async () => {
      const sessionObject = await createAuthenticatedSession();

      await orchestrator.createUser({
        username: "CaseDiferente",
        email: "case.diferente@email.com",
        password: "senha123",
      });

      const response2 = await fetch(
        "http:localhost:3000/api/v1/users/casediferente",
        {
          headers: {
            Cookie: `session_id=${sessionObject.token}`,
          },
        },
      );

      expect(response2.status).toBe(200);

      const response2Body = await response2.json();

      expect(response2Body).toEqual({
        id: response2Body.id,
        username: "CaseDiferente",
        features: ["read:activation_token"],
        created_at: response2Body.created_at,
        updated_at: response2Body.updated_at,
      });

      expect(uuidVersion(response2Body.id)).toBe(4);
      expect(Date.parse(response2Body.created_at)).not.toBeNaN();
      expect(Date.parse(response2Body.updated_at)).not.toBeNaN();
    });
    test("With nonexistent username", async () => {
      const sessionObject = await createAuthenticatedSession();

      const response = await fetch(
        "http:localhost:3000/api/v1/users/UsuarioInexistente",
        {
          headers: {
            Cookie: `session_id=${sessionObject.token}`,
          },
        },
      );

      expect(response.status).toBe(404);

      const responseBody = await response.json();

      expect(responseBody).toEqual({
        name: "NotFoundError",
        message: "O username informado não foi encontrado no sistema",
        action: "Verifique se o username está digitado corretamente",
        status_code: 404,
      });
    });
  });
});
