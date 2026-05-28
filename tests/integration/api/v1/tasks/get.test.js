import orchestrator from "@/tests/orchestrator.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

describe("GET /api/v1/tasks", () => {
  describe("Anonymous user", () => {
    test("Should return 401", async () => {
      const response = await fetch("http:localhost:3000/api/v1/tasks");

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
    test("With invalid 'view' param", async () => {
      const createdUser = await orchestrator.createUser();
      const activatedUser = await orchestrator.activateUser(createdUser);
      const sessionObject = await orchestrator.createSession(activatedUser);

      const response = await fetch(
        "http:localhost:3000/api/v1/tasks?view=invalid",
        {
          headers: { Cookie: `session_id=${sessionObject.token}` },
        },
      );

      expect(response.status).toBe(400);

      const responseBody = await response.json();

      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.status_code).toBe(400);
    });

    test("Returns empty list when user has no tasks", async () => {
      const createdUser = await orchestrator.createUser();
      const activatedUser = await orchestrator.activateUser(createdUser);
      const sessionObject = await orchestrator.createSession(activatedUser);

      const response = await fetch("http:localhost:3000/api/v1/tasks", {
        headers: { Cookie: `session_id=${sessionObject.token}` },
      });

      expect(response.status).toBe(200);

      const responseBody = await response.json();

      expect(responseBody).toEqual([]);
    });

    test("Returns tasks created by user with view=created", async () => {
      const creator = await orchestrator.createUser();
      const activatedCreator = await orchestrator.activateUser(creator);
      const sessionObject = await orchestrator.createSession(activatedCreator);

      const otherUser = await orchestrator.createUser();

      await orchestrator.createTask({ created_by: creator.id });
      await orchestrator.createTask({ created_by: creator.id });
      await orchestrator.createTask({ created_by: otherUser.id });

      const response = await fetch(
        "http:localhost:3000/api/v1/tasks?view=created",
        {
          headers: { Cookie: `session_id=${sessionObject.token}` },
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();

      expect(responseBody).toHaveLength(2);
      responseBody.forEach((task) => {
        expect(task.created_by).toBe(creator.id);
      });
    });

    test("Returns tasks assigned to user with view=assigned", async () => {
      const creator = await orchestrator.createUser();
      const assignee = await orchestrator.createUser();
      const activatedAssignee = await orchestrator.activateUser(assignee);
      const sessionObject = await orchestrator.createSession(activatedAssignee);

      await orchestrator.createTask({
        created_by: creator.id,
        assigned_to: assignee.id,
      });
      await orchestrator.createTask({ created_by: creator.id });

      const response = await fetch(
        "http:localhost:3000/api/v1/tasks?view=assigned",
        {
          headers: { Cookie: `session_id=${sessionObject.token}` },
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();

      expect(responseBody).toHaveLength(1);
      expect(responseBody[0].assigned_to).toBe(assignee.id);
    });

    test("Returns all relevant tasks with view=all (default)", async () => {
      const user1 = await orchestrator.createUser();
      const activatedUser1 = await orchestrator.activateUser(user1);
      const sessionObject = await orchestrator.createSession(activatedUser1);

      const user2 = await orchestrator.createUser();

      await orchestrator.createTask({ created_by: user1.id });
      await orchestrator.createTask({
        created_by: user2.id,
        assigned_to: user1.id,
      });
      await orchestrator.createTask({ created_by: user2.id });

      const response = await fetch("http:localhost:3000/api/v1/tasks", {
        headers: { Cookie: `session_id=${sessionObject.token}` },
      });

      expect(response.status).toBe(200);

      const responseBody = await response.json();

      expect(responseBody.length).toBeGreaterThanOrEqual(2);
      const relevantIds = responseBody.map((t) => t.created_by);
      const hasUser1Task = relevantIds.some((id) => id === user1.id);
      expect(hasUser1Task).toBe(true);
    });

    test("Does not return tasks from other users with no relationship", async () => {
      const user1 = await orchestrator.createUser();
      const activatedUser1 = await orchestrator.activateUser(user1);
      const sessionObject = await orchestrator.createSession(activatedUser1);

      const user2 = await orchestrator.createUser();
      await orchestrator.createTask({ created_by: user2.id });

      const response = await fetch(
        "http:localhost:3000/api/v1/tasks?view=all",
        {
          headers: { Cookie: `session_id=${sessionObject.token}` },
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();

      const user2Tasks = responseBody.filter(
        (t) => t.created_by === user2.id && t.assigned_to !== user1.id,
      );
      expect(user2Tasks).toHaveLength(0);
    });
  });
});
