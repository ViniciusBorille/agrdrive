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

describe("GET /api/v1/tasks (is_overdue)", () => {
  const DAY_IN_MILISECONDS = 24 * 60 * 60 * 1000;

  test("Marca atraso conforme o prazo e o status", async () => {
    const owner = await orchestrator.createUser();
    const activatedOwner = await orchestrator.activateUser(owner);
    const sessionObject = await orchestrator.createSession(activatedOwner);

    const semPrazo = await orchestrator.createTask({
      created_by: owner.id,
      due_date: null,
    });
    const prazoFuturo = await orchestrator.createTask({
      created_by: owner.id,
      due_date: new Date(Date.now() + 7 * DAY_IN_MILISECONDS).toISOString(),
    });
    const prazoVencido = await orchestrator.createTask({
      created_by: owner.id,
      due_date: new Date(Date.now() - DAY_IN_MILISECONDS).toISOString(),
    });
    // Vencida, mas encerrada: o prazo deixou de valer.
    const vencidaConcluida = await orchestrator.createTask({
      created_by: owner.id,
      status: "COMPLETED",
      due_date: new Date(Date.now() - DAY_IN_MILISECONDS).toISOString(),
    });

    const response = await fetch("http:localhost:3000/api/v1/tasks", {
      headers: { Cookie: `session_id=${sessionObject.token}` },
    });

    expect(response.status).toBe(200);

    const responseBody = await response.json();
    const byId = Object.fromEntries(responseBody.map((t) => [t.id, t]));

    expect(byId[semPrazo.id].is_overdue).toBe(false);
    expect(byId[prazoFuturo.id].is_overdue).toBe(false);
    expect(byId[prazoVencido.id].is_overdue).toBe(true);
    expect(byId[vencidaConcluida.id].is_overdue).toBe(false);
  });

  // O atraso é derivado na leitura: concluir a tarefa já faz a listagem
  // parar de apontá-la como atrasada, sem nenhum job envolvido.
  test("Deixa de apontar atraso assim que a tarefa é concluída", async () => {
    const owner = await orchestrator.createUser();
    const activatedOwner = await orchestrator.activateUser(owner);
    const sessionObject = await orchestrator.createSession(activatedOwner);

    const atrasada = await orchestrator.createTask({
      created_by: owner.id,
      due_date: new Date(Date.now() - DAY_IN_MILISECONDS).toISOString(),
    });

    await fetch(`http:localhost:3000/api/v1/tasks/${atrasada.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_id=${sessionObject.token}`,
      },
      body: JSON.stringify({ status: "COMPLETED" }),
    });

    const response = await fetch("http:localhost:3000/api/v1/tasks", {
      headers: { Cookie: `session_id=${sessionObject.token}` },
    });
    const responseBody = await response.json();
    const found = responseBody.find((t) => t.id === atrasada.id);

    expect(found.is_overdue).toBe(false);
  });
});
