import orchestrator from "@/tests/orchestrator.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

describe("PATCH /api/v1/tasks/:task_id", () => {
  describe("Anonymous user", () => {
    test("Should return 401", async () => {
      const response = await fetch(
        "http:localhost:3000/api/v1/tasks/00000000-0000-0000-0000-000000000000",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Novo título" }),
        },
      );

      expect(response.status).toBe(401);
    });
  });

  describe("Authenticated user", () => {
    test("With invalid body (empty object)", async () => {
      const creator = await orchestrator.createUser();
      const activatedCreator = await orchestrator.activateUser(creator);
      const sessionObject = await orchestrator.createSession(activatedCreator);

      const createdTask = await orchestrator.createTask({
        created_by: creator.id,
      });

      const response = await fetch(
        `http:localhost:3000/api/v1/tasks/${createdTask.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObject.token}`,
          },
          body: JSON.stringify({}),
        },
      );

      expect(response.status).toBe(400);

      const responseBody = await response.json();

      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.status_code).toBe(400);
    });

    test("With invalid 'status' value", async () => {
      const creator = await orchestrator.createUser();
      const activatedCreator = await orchestrator.activateUser(creator);
      const sessionObject = await orchestrator.createSession(activatedCreator);

      const createdTask = await orchestrator.createTask({
        created_by: creator.id,
      });

      const response = await fetch(
        `http:localhost:3000/api/v1/tasks/${createdTask.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObject.token}`,
          },
          body: JSON.stringify({ status: "INVALID_STATUS" }),
        },
      );

      expect(response.status).toBe(400);

      const responseBody = await response.json();

      expect(responseBody.name).toBe("ValidationError");
    });

    test("Unrelated user cannot update task", async () => {
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
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObject.token}`,
          },
          body: JSON.stringify({ title: "Título alterado" }),
        },
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();

      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "Você não tem acesso a esta tarefa.",
        action:
          "Somente o criador ou o usuário atribuído pode atualizar a tarefa.",
        status_code: 403,
      });
    });

    test("Creator can update any field including title and assigned_to", async () => {
      const creator = await orchestrator.createUser();
      const activatedCreator = await orchestrator.activateUser(creator);
      const sessionObject = await orchestrator.createSession(activatedCreator);

      const newAssignee = await orchestrator.createUser();

      const createdTask = await orchestrator.createTask({
        created_by: creator.id,
        title: "Título original",
      });

      const response = await fetch(
        `http:localhost:3000/api/v1/tasks/${createdTask.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObject.token}`,
          },
          body: JSON.stringify({
            title: "Título atualizado",
            assigned_to: newAssignee.id,
          }),
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();

      expect(responseBody).toMatchObject({
        id: createdTask.id,
        title: "Título atualizado",
        assigned_to: newAssignee.id,
        created_by: creator.id,
      });
    });

    test("Assignee can update status", async () => {
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
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObject.token}`,
          },
          body: JSON.stringify({ status: "IN_PROGRESS" }),
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();

      expect(responseBody).toMatchObject({
        id: createdTask.id,
        status: "IN_PROGRESS",
      });
    });

    test("Assignee cannot reassign task (update assigned_to)", async () => {
      const creator = await orchestrator.createUser();
      const assignee = await orchestrator.createUser();
      const activatedAssignee = await orchestrator.activateUser(assignee);
      const sessionObject = await orchestrator.createSession(activatedAssignee);

      const otherUser = await orchestrator.createUser();

      const createdTask = await orchestrator.createTask({
        created_by: creator.id,
        assigned_to: assignee.id,
      });

      const response = await fetch(
        `http:localhost:3000/api/v1/tasks/${createdTask.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObject.token}`,
          },
          body: JSON.stringify({ assigned_to: otherUser.id }),
        },
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();

      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "Somente o criador pode reatribuir a tarefa.",
        action:
          "Remova o campo 'assigned_to' da requisição ou contate o criador da tarefa.",
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
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${sessionObject.token}`,
          },
          body: JSON.stringify({ title: "Título" }),
        },
      );

      expect(response.status).toBe(404);
    });
  });
});
