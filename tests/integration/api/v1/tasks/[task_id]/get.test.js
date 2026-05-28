import { version as uuidVersion } from "uuid";
import orchestrator from "@/tests/orchestrator.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

describe("GET /api/v1/tasks/:task_id", () => {
  describe("Anonymous user", () => {
    test("Should return 401", async () => {
      const response = await fetch(
        "http:localhost:3000/api/v1/tasks/00000000-0000-0000-0000-000000000000",
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
    test("Creator can view own task", async () => {
      const creator = await orchestrator.createUser();
      const activatedCreator = await orchestrator.activateUser(creator);
      const sessionObject = await orchestrator.createSession(activatedCreator);

      const createdTask = await orchestrator.createTask({
        created_by: creator.id,
        title: "Tarefa do criador",
      });

      const response = await fetch(
        `http:localhost:3000/api/v1/tasks/${createdTask.id}`,
        {
          headers: { Cookie: `session_id=${sessionObject.token}` },
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();

      expect(responseBody).toMatchObject({
        id: createdTask.id,
        title: "Tarefa do criador",
        created_by: creator.id,
      });

      expect(uuidVersion(responseBody.id)).toBe(4);
    });

    test("Assignee can view assigned task", async () => {
      const creator = await orchestrator.createUser();
      const assignee = await orchestrator.createUser();
      const activatedAssignee = await orchestrator.activateUser(assignee);
      const sessionObject = await orchestrator.createSession(activatedAssignee);

      const createdTask = await orchestrator.createTask({
        created_by: creator.id,
        assigned_to: assignee.id,
        title: "Tarefa do atribuído",
      });

      const response = await fetch(
        `http:localhost:3000/api/v1/tasks/${createdTask.id}`,
        {
          headers: { Cookie: `session_id=${sessionObject.token}` },
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();

      expect(responseBody).toMatchObject({
        id: createdTask.id,
        assigned_to: assignee.id,
      });
    });

    test("Unrelated user cannot view task", async () => {
      const creator = await orchestrator.createUser();
      const unrelated = await orchestrator.createUser();
      const activatedUnrelated = await orchestrator.activateUser(unrelated);
      const sessionObject =
        await orchestrator.createSession(activatedUnrelated);

      const createdTask = await orchestrator.createTask({
        created_by: creator.id,
      });

      const response = await fetch(
        `http:localhost:3000/api/v1/tasks/${createdTask.id}`,
        {
          headers: { Cookie: `session_id=${sessionObject.token}` },
        },
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();

      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "Você não tem acesso a esta tarefa.",
        action:
          "Somente o criador ou o usuário atribuído pode visualizar a tarefa.",
        status_code: 403,
      });
    });

    test("Returns 404 for nonexistent task", async () => {
      const createdUser = await orchestrator.createUser();
      const activatedUser = await orchestrator.activateUser(createdUser);
      const sessionObject = await orchestrator.createSession(activatedUser);

      const response = await fetch(
        "http:localhost:3000/api/v1/tasks/00000000-0000-0000-0000-000000000000",
        {
          headers: { Cookie: `session_id=${sessionObject.token}` },
        },
      );

      expect(response.status).toBe(404);

      const responseBody = await response.json();

      expect(responseBody).toEqual({
        name: "NotFoundError",
        message: "A tarefa informada não foi encontrada no sistema.",
        action: "Verifique se o id está correto.",
        status_code: 404,
      });
    });
  });
});
