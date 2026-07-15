import { version as uuidVersion } from "uuid";
import orchestrator from "@/tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

describe("POST /api/v1/recoveries", () => {
  describe("Anonymous user", () => {
    test("With malformed email", async () => {
      const response = await fetch("http://localhost:3000/api/v1/recoveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "email-invalido" }),
      });

      expect(response.status).toBe(400);

      const responseBody = await response.json();

      expect(responseBody).toEqual({
        name: "ValidationError",
        message: "O email informado não possui um formato válido.",
        action: "Verifique os dados enviados e tente novamente.",
        status_code: 400,
      });
    });

    test("With nonexistent email", async () => {
      await orchestrator.deleteAllEmails();

      const response = await fetch("http://localhost:3000/api/v1/recoveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nao.existe@nowhere.com" }),
      });

      expect(response.status).toBe(201);

      const responseBody = await response.json();

      expect(responseBody).toEqual({
        message:
          "Se o e-mail estiver cadastrado, você receberá um link de recuperação.",
      });

      const lastEmail = await orchestrator.getLastEmail();
      expect(lastEmail).toBeNull();
    });

    test("With existing user email", async () => {
      await orchestrator.deleteAllEmails();

      const createdUser = await orchestrator.createUser();

      const response = await fetch("http://localhost:3000/api/v1/recoveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: createdUser.email }),
      });

      expect(response.status).toBe(201);

      const responseBody = await response.json();

      expect(responseBody).toEqual({
        message:
          "Se o e-mail estiver cadastrado, você receberá um link de recuperação.",
      });

      const lastEmail = await orchestrator.getLastEmail();
      expect(lastEmail).not.toBeNull();
      expect(lastEmail.recipients[0]).toBe(`<${createdUser.email}>`);
      expect(lastEmail.subject).toBe("Recuperação de senha no AgrDrive");
      expect(lastEmail.text).toContain("/recuperar-senha/");

      const recoveryTokenId = orchestrator.extractUUID(lastEmail.text);
      expect(uuidVersion(recoveryTokenId)).toBe(4);
    });
  });
});
