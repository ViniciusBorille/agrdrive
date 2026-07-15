import { version as uuidVersion } from "uuid";
import orchestrator from "@/tests/orchestrator";
import recovery from "@/models/recovery.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

describe("PATCH /api/v1/recoveries/[token_id]", () => {
  describe("Anonymous user", () => {
    test("With nonexistent token", async () => {
      const response = await fetch(
        "http://localhost:3000/api/v1/recoveries/59d0ad37-4a6d-4818-950f-3b27cc64631c",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "novaSenhaValida1" }),
        },
      );

      expect(response.status).toBe(404);

      const responseBody = await response.json();

      expect(responseBody).toEqual({
        name: "NotFoundError",
        message:
          "O token de recuperação não foi encontrado no sistema ou expirou.",
        action: "Solicite uma nova recuperação de senha.",
        status_code: 404,
      });
    });

    test("With expired token", async () => {
      jest.useFakeTimers({
        now: new Date(Date.now() - recovery.EXPIRATION_IN_MILISECONDS - 10000),
      });

      const createdUser = await orchestrator.createUser();
      const expiredRecoveryToken = await recovery.create(createdUser.id);

      jest.useRealTimers();

      const response = await fetch(
        `http://localhost:3000/api/v1/recoveries/${expiredRecoveryToken.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "novaSenhaValida1" }),
        },
      );

      expect(response.status).toBe(404);

      const responseBody = await response.json();

      expect(responseBody).toEqual({
        name: "NotFoundError",
        message:
          "O token de recuperação não foi encontrado no sistema ou expirou.",
        action: "Solicite uma nova recuperação de senha.",
        status_code: 404,
      });
    });

    test("With valid token but invalid password", async () => {
      const createdUser = await orchestrator.createUser();
      const recoveryToken = await recovery.create(createdUser.id);

      const response = await fetch(
        `http://localhost:3000/api/v1/recoveries/${recoveryToken.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "curta" }),
        },
      );

      expect(response.status).toBe(400);

      const responseBody = await response.json();

      expect(responseBody).toEqual({
        name: "ValidationError",
        message: "A senha deve ter no mínimo 8 caracteres.",
        action: "Verifique os dados enviados e tente novamente.",
        status_code: 400,
      });
    });

    test("With already used token", async () => {
      const createdUser = await orchestrator.createUser();
      const recoveryToken = await recovery.create(createdUser.id);

      const response1 = await fetch(
        `http://localhost:3000/api/v1/recoveries/${recoveryToken.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "novaSenhaValida1" }),
        },
      );

      expect(response1.status).toBe(200);

      const response2 = await fetch(
        `http://localhost:3000/api/v1/recoveries/${recoveryToken.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "outraSenhaValida1" }),
        },
      );

      expect(response2.status).toBe(404);

      const response2Body = await response2.json();

      expect(response2Body).toEqual({
        name: "NotFoundError",
        message:
          "O token de recuperação não foi encontrado no sistema ou expirou.",
        action: "Solicite uma nova recuperação de senha.",
        status_code: 404,
      });
    });

    test("With valid token", async () => {
      const createdUser = await orchestrator.createUser();
      await orchestrator.activateUser(createdUser);
      const sessionObject = await orchestrator.createSession(createdUser);
      const recoveryToken = await recovery.create(createdUser.id);

      const response = await fetch(
        `http://localhost:3000/api/v1/recoveries/${recoveryToken.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "novaSenhaValida1" }),
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();

      expect(responseBody).toEqual({
        id: recoveryToken.id,
        used_at: responseBody.used_at,
        user_id: recoveryToken.user_id,
        expires_at: recoveryToken.expires_at.toISOString(),
        created_at: recoveryToken.created_at.toISOString(),
        updated_at: expect.any(String),
      });

      expect(responseBody.used_at).not.toBeNull();
      expect(uuidVersion(responseBody.id)).toBe(4);
      expect(uuidVersion(responseBody.user_id)).toBe(4);

      // Todas as sessões ativas do usuário devem ser encerradas.
      const oldSessionResponse = await fetch(
        "http://localhost:3000/api/v1/user",
        {
          headers: { Cookie: `session_id=${sessionObject.token}` },
        },
      );
      expect(oldSessionResponse.status).toBe(401);

      // A senha antiga deixa de funcionar.
      const oldPasswordLoginResponse = await fetch(
        "http://localhost:3000/api/v1/sessions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: createdUser.email,
            password: "validpassword",
          }),
        },
      );
      expect(oldPasswordLoginResponse.status).toBe(401);

      // A nova senha permite login.
      const newLoginResponse = await fetch(
        "http://localhost:3000/api/v1/sessions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: createdUser.email,
            password: "novaSenhaValida1",
          }),
        },
      );
      expect(newLoginResponse.status).toBe(201);
    });
  });
});
