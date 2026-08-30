import database from "@/infra/database.js";

jest.mock("../../../infra/database.js", () => ({
  __esModule: true,
  default: { query: jest.fn(), transaction: jest.fn() },
}));

import task from "@/models/task.js";
import { NotFoundError } from "@/infra/errors.js";

// O client da transação é o mesmo objeto passado ao callback; guardamos
// as chamadas dele à parte para conseguir afirmar sobre cada query.
function mockTransaction() {
  const client = { query: jest.fn() };

  database.transaction.mockImplementation(async (callback) => {
    return await callback(client);
  });

  return client;
}

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

beforeEach(() => {
  database.query.mockReset();
  database.transaction.mockReset();
});

describe("models/task.js", () => {
  describe(".create()", () => {
    // Task e assignees precisam nascer juntos: uma task criada sem os
    // responsáveis ficaria órfã se o segundo insert falhasse.
    test("cria a task e os assignees dentro da mesma transação", async () => {
      const client = mockTransaction();
      client.query.mockResolvedValue({ rows: [{ id: "task-1" }] });
      database.query.mockResolvedValue({
        rows: [{ id: "user-2", username: "Beltrano" }],
      });

      const created = await task.create({
        title: "Aplicar defensivo",
        created_by: "user-1",
        assigned_to: "user-2",
      });

      expect(database.transaction).toHaveBeenCalledTimes(1);
      expect(normalize(client.query.mock.calls[0][0].text)).toContain(
        "INSERT INTO tasks",
      );
      expect(normalize(client.query.mock.calls[1][0].text)).toContain(
        "INSERT INTO task_assignees",
      );
      expect(created.assigned_to).toBe("user-2");
      expect(created.assignees).toEqual([
        { id: "user-2", username: "Beltrano" },
      ]);
    });

    test("aplica os defaults de status, prioridade e campos opcionais", async () => {
      const client = mockTransaction();
      client.query.mockResolvedValue({ rows: [{ id: "task-1" }] });
      database.query.mockResolvedValue({ rows: [] });

      await task.create({ title: "Sem detalhes", created_by: "user-1" });

      expect(client.query.mock.calls[0][0].values).toEqual([
        "Sem detalhes",
        null,
        "PENDING",
        "MEDIUM",
        "user-1",
        null,
      ]);
    });

    test("não insere assignees quando nenhum é informado", async () => {
      const client = mockTransaction();
      client.query.mockResolvedValue({ rows: [{ id: "task-1" }] });
      database.query.mockResolvedValue({ rows: [] });

      const created = await task.create({
        title: "Sem responsável",
        created_by: "user-1",
      });

      expect(client.query).toHaveBeenCalledTimes(1);
      expect(created.assigned_to).toBeNull();
      expect(created.assignees).toEqual([]);
    });

    test("aceita uma lista de assignees", async () => {
      const client = mockTransaction();
      client.query.mockResolvedValue({ rows: [{ id: "task-1" }] });
      database.query.mockResolvedValue({
        rows: [
          { id: "user-2", username: "Beltrano" },
          { id: "user-3", username: "Cicrano" },
        ],
      });

      const created = await task.create({
        title: "Mutirão",
        created_by: "user-1",
        assigned_to: ["user-2", "user-3"],
      });

      const assigneesQuery = client.query.mock.calls[1][0];
      expect(assigneesQuery.text).toContain("($1, $2), ($1, $3)");
      expect(assigneesQuery.values).toEqual(["task-1", "user-2", "user-3"]);
      expect(created.assignees).toHaveLength(2);
    });

    test("ignora responsável repetido em vez de quebrar", async () => {
      const client = mockTransaction();
      client.query.mockResolvedValue({ rows: [{ id: "task-1" }] });
      database.query.mockResolvedValue({ rows: [] });

      await task.create({
        title: "Duplicado",
        created_by: "user-1",
        assigned_to: ["user-2", "user-2"],
      });

      expect(client.query.mock.calls[1][0].text).toContain(
        "ON CONFLICT DO NOTHING",
      );
    });
  });

  describe(".findAll()", () => {
    beforeEach(() => {
      database.query.mockResolvedValue({ rows: [] });
    });

    test("na visão padrão traz o que o usuário criou ou lhe foi atribuído", async () => {
      await task.findAll({ userId: "user-1" });

      const text = normalize(database.query.mock.calls[0][0].text);
      expect(text).toContain("t.created_by = $1 OR EXISTS");
      expect(database.query.mock.calls[0][0].values).toEqual(["user-1"]);
    });

    test("na visão `assigned` traz apenas o que lhe foi atribuído", async () => {
      await task.findAll({ userId: "user-1", view: "assigned" });

      const text = normalize(database.query.mock.calls[0][0].text);
      expect(text).toContain("WHERE EXISTS (SELECT 1 FROM task_assignees");
      expect(text).not.toContain("t.created_by = $1 OR");
    });

    test("na visão `created` traz apenas o que o usuário criou", async () => {
      await task.findAll({ userId: "user-1", view: "created" });

      const text = normalize(database.query.mock.calls[0][0].text);
      expect(text).toContain(
        "WHERE t.created_by = $1 AND t.deleted_at IS NULL",
      );
      expect(text).not.toContain("EXISTS");
    });

    test("uma visão desconhecida cai na visão padrão", async () => {
      await task.findAll({ userId: "user-1", view: "inventada" });

      expect(normalize(database.query.mock.calls[0][0].text)).toContain(
        "t.created_by = $1 OR EXISTS",
      );
    });

    test("esconde as tarefas removidas e ordena da mais nova para a mais antiga", async () => {
      await task.findAll({ userId: "user-1" });

      const text = normalize(database.query.mock.calls[0][0].text);
      expect(text).toContain("t.deleted_at IS NULL");
      expect(text).toContain("ORDER BY t.created_at DESC");
    });

    test("deriva assigned_to do primeiro responsável", async () => {
      database.query.mockResolvedValue({
        rows: [
          { id: "task-1", assignees: [{ id: "user-2" }, { id: "user-3" }] },
          { id: "task-2", assignees: [] },
        ],
      });

      const tasks = await task.findAll({ userId: "user-1" });

      expect(tasks[0].assigned_to).toBe("user-2");
      expect(tasks[1].assigned_to).toBeNull();
    });
  });

  describe(".findOneById()", () => {
    test("devolve a tarefa com os responsáveis", async () => {
      database.query.mockResolvedValue({
        rowCount: 1,
        rows: [{ id: "task-1", assignees: [{ id: "user-2" }] }],
      });

      const found = await task.findOneById("task-1");

      expect(found.assigned_to).toBe("user-2");
      expect(normalize(database.query.mock.calls[0][0].text)).toContain(
        "t.deleted_at IS NULL",
      );
    });

    test("assigned_to é nulo quando não há responsáveis", async () => {
      database.query.mockResolvedValue({
        rowCount: 1,
        rows: [{ id: "task-1", assignees: [] }],
      });

      await expect(task.findOneById("task-1")).resolves.toMatchObject({
        assigned_to: null,
      });
    });

    test("lança NotFoundError quando não existe ou já foi removida", async () => {
      database.query.mockResolvedValue({ rowCount: 0, rows: [] });

      await expect(task.findOneById("task-sumida")).rejects.toThrow(
        expect.objectContaining({
          name: "NotFoundError",
          message: "A tarefa informada não foi encontrada no sistema.",
        }),
      );
    });
  });

  describe(".update()", () => {
    const currentTask = {
      id: "task-1",
      title: "Título antigo",
      description: "Descrição antiga",
      status: "PENDING",
      priority: "MEDIUM",
      due_date: "2026-09-01",
      assignees: [{ id: "user-2" }],
    };

    function mockCurrentTask() {
      database.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [currentTask],
      });
    }

    test("mescla os campos novos por cima dos atuais", async () => {
      mockCurrentTask();
      const client = mockTransaction();
      client.query.mockResolvedValue({ rows: [{ id: "task-1" }] });
      database.query.mockResolvedValue({ rows: [] });

      await task.update("task-1", { status: "DONE" });

      expect(client.query.mock.calls[0][0].values).toEqual([
        "task-1",
        "Título antigo",
        "Descrição antiga",
        "DONE",
        "MEDIUM",
        "2026-09-01",
      ]);
    });

    // Sem `assigned_to` no payload, os responsáveis atuais não podem ser
    // tocados — um PATCH de status não deve esvaziar a equipe.
    test("não mexe nos responsáveis quando assigned_to não vem no payload", async () => {
      mockCurrentTask();
      const client = mockTransaction();
      client.query.mockResolvedValue({ rows: [{ id: "task-1" }] });
      database.query.mockResolvedValue({ rows: [] });

      await task.update("task-1", { status: "DONE" });

      const textos = client.query.mock.calls.map((call) => call[0].text);
      expect(textos.some((t) => t.includes("DELETE FROM task_assignees"))).toBe(
        false,
      );
    });

    test("troca os responsáveis quando assigned_to vem preenchido", async () => {
      mockCurrentTask();
      const client = mockTransaction();
      client.query.mockResolvedValue({ rows: [{ id: "task-1" }] });
      database.query.mockResolvedValue({ rows: [{ id: "user-9" }] });

      await task.update("task-1", { assigned_to: "user-9" });

      const textos = client.query.mock.calls.map((call) =>
        normalize(call[0].text),
      );
      expect(textos[1]).toContain("DELETE FROM task_assignees");
      expect(textos[2]).toContain("INSERT INTO task_assignees");
    });

    // `assigned_to: null` é a forma de desatribuir: apaga os vínculos e
    // não insere nenhum novo.
    test("apenas remove os responsáveis quando assigned_to vem nulo", async () => {
      mockCurrentTask();
      const client = mockTransaction();
      client.query.mockResolvedValue({ rows: [{ id: "task-1" }] });
      database.query.mockResolvedValue({ rows: [] });

      const updated = await task.update("task-1", { assigned_to: null });

      const textos = client.query.mock.calls.map((call) => call[0].text);
      expect(textos.some((t) => t.includes("DELETE FROM task_assignees"))).toBe(
        true,
      );
      expect(textos.some((t) => t.includes("INSERT INTO task_assignees"))).toBe(
        false,
      );
      expect(updated.assigned_to).toBeNull();
    });

    test("aceita uma lista de responsáveis", async () => {
      mockCurrentTask();
      const client = mockTransaction();
      client.query.mockResolvedValue({ rows: [{ id: "task-1" }] });
      database.query.mockResolvedValue({ rows: [] });

      await task.update("task-1", { assigned_to: ["user-8", "user-9"] });

      expect(client.query.mock.calls[2][0].values).toEqual([
        "task-1",
        "user-8",
        "user-9",
      ]);
    });

    test("propaga o NotFoundError quando a tarefa não existe", async () => {
      database.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await expect(
        task.update("task-sumida", { status: "DONE" }),
      ).rejects.toThrow(NotFoundError);
      expect(database.transaction).not.toHaveBeenCalled();
    });
  });

  describe(".remove()", () => {
    test("marca deleted_at em vez de apagar a linha", async () => {
      database.query.mockResolvedValue({
        rowCount: 1,
        rows: [{ id: "task-1" }],
      });

      await task.remove("task-1");

      const text = normalize(database.query.mock.calls[0][0].text);
      expect(text).toContain("deleted_at = timezone('utc', now())");
      expect(text).not.toContain("DELETE FROM tasks");
    });

    test("devolve a tarefa removida", async () => {
      database.query.mockResolvedValue({
        rowCount: 1,
        rows: [{ id: "task-1" }],
      });

      await expect(task.remove("task-1")).resolves.toEqual({ id: "task-1" });
    });

    test("lança NotFoundError ao remover duas vezes", async () => {
      database.query.mockResolvedValue({ rowCount: 0, rows: [] });

      await expect(task.remove("task-1")).rejects.toThrow(NotFoundError);
    });
  });
});
