import orchestrator from "@/tests/orchestrator.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

describe("DELETE /api/v1/tasks/:task_id", () => {
  describe("Anonymous user", () => {
    test("Should return 401", async () => {
      const response = await fetch(
        "http:localhost:3000/api/v1/tasks/00000000-0000-0000-0000-000000000000",
        { method: "DELETE" },
      );

      expect(response.status).toBe(401);
    });
  });

  describe("Authenticated user", () => {
    test("Assignee cannot delete task", async () => {
      const creator = await orchestrator.createUser();
      const assignee = await orchestrator.createUser();
      const activatedAssignee = await orchestrator.activateUser(assignee);
      const sessionObject = await orchestrator.createSession(activatedAssignee);

      const createdTask = await orchestrator.createTask({
        created_by: creator.id,
        assigned_to: assignee.id,
      });

      const response = await fetch(
        `http:localhost:3000/api/v1/tasks/${createdTask.id}`,
        {
          method: "DELETE",
          headers: { Cookie: `session_id=${sessionObject.token}` },
        },
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();

      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "Somente o criador pode excluir a tarefa.",
        action: "Contate o criador da tarefa para excluí-la.",
        status_code: 403,
      });
    });

    test("Unrelated user cannot delete task", async () => {
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
          method: "DELETE",
          headers: { Cookie: `session_id=${sessionObject.token}` },
        },
      );

      expect(response.status).toBe(403);
    });

    test("Creator can soft-delete own task", async () => {
      const creator = await orchestrator.createUser();
      const activatedCreator = await orchestrator.activateUser(creator);
      const sessionObject = await orchestrator.createSession(activatedCreator);

      const createdTask = await orchestrator.createTask({
        created_by: creator.id,
        title: "Tarefa a excluir",
      });

      const response = await fetch(
        `http:localhost:3000/api/v1/tasks/${createdTask.id}`,
        {
          method: "DELETE",
          headers: { Cookie: `session_id=${sessionObject.token}` },
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();

      expect(responseBody).toMatchObject({
        id: createdTask.id,
        title: "Tarefa a excluir",
        created_by: creator.id,
      });

      expect(Date.parse(responseBody.deleted_at)).not.toBeNaN();
    });

    test("Deleted task is no longer accessible", async () => {
      const creator = await orchestrator.createUser();
      const activatedCreator = await orchestrator.activateUser(creator);
      const sessionObject = await orchestrator.createSession(activatedCreator);

      const createdTask = await orchestrator.createTask({
        created_by: creator.id,
        title: "Tarefa que será deletada",
      });

      await fetch(`http:localhost:3000/api/v1/tasks/${createdTask.id}`, {
        method: "DELETE",
        headers: { Cookie: `session_id=${sessionObject.token}` },
      });

      const getResponse = await fetch(
        `http:localhost:3000/api/v1/tasks/${createdTask.id}`,
        {
          headers: { Cookie: `session_id=${sessionObject.token}` },
        },
      );

      expect(getResponse.status).toBe(404);
    });

    test("Returns 404 for nonexistent task", async () => {
      const createdUser = await orchestrator.createUser();
      const activatedUser = await orchestrator.activateUser(createdUser);
      const sessionObject = await orchestrator.createSession(activatedUser);

      const response = await fetch(
        "http:localhost:3000/api/v1/tasks/00000000-0000-0000-0000-000000000000",
        {
          method: "DELETE",
          headers: { Cookie: `session_id=${sessionObject.token}` },
        },
      );

      expect(response.status).toBe(404);
    });
  });
});
