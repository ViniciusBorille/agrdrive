import database from "@/infra/database.js";
import { NotFoundError } from "@/infra/errors.js";

async function create(tasksInputValues) {
  const newTask = await runInsertQuery(tasksInputValues);
  return newTask;

  async function runInsertQuery(tasksInputValues) {
    const results = await database.query({
      text: `
        INSERT INTO
          tasks (title, description, status, priority, created_by, assigned_to, due_date)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
          *
      ;`,
      values: [
        tasksInputValues.title,
        tasksInputValues.description ?? null,
        tasksInputValues.status ?? "PENDING",
        tasksInputValues.priority ?? "MEDIUM",
        tasksInputValues.created_by,
        tasksInputValues.assigned_to ?? null,
        tasksInputValues.due_date ?? null,
      ],
    });

    return results.rows[0];
  }
}

async function findAll({ userId, view = "all" }) {
  const results = await runSelectQuery({ userId, view });
  return results;

  async function runSelectQuery({ userId, view }) {
    let whereClause;

    if (view === "assigned") {
      whereClause = "assigned_to = $1";
    } else if (view === "created") {
      whereClause = "created_by = $1";
    } else {
      whereClause = "(created_by = $1 OR assigned_to = $1)";
    }

    const queryResult = await database.query({
      text: `
        SELECT
          *
        FROM
          tasks
        WHERE
          ${whereClause}
          AND deleted_at IS NULL
        ORDER BY
          created_at DESC
      ;`,
      values: [userId],
    });

    return queryResult.rows;
  }
}

async function findOneById(id) {
  const taskFound = await runSelectQuery(id);
  return taskFound;

  async function runSelectQuery(id) {
    const results = await database.query({
      text: `
        SELECT
          *
        FROM
          tasks
        WHERE
          id = $1
          AND deleted_at IS NULL
        LIMIT
          1
      ;`,
      values: [id],
    });

    if (results.rowCount === 0) {
      throw new NotFoundError({
        message: "A tarefa informada não foi encontrada no sistema.",
        action: "Verifique se o id está correto.",
      });
    }

    return results.rows[0];
  }
}

async function update(id, tasksInputValues) {
  const currentTask = await findOneById(id);
  const taskWithNewValues = { ...currentTask, ...tasksInputValues };
  const updatedTask = await runUpdateQuery(taskWithNewValues);
  return updatedTask;

  async function runUpdateQuery(task) {
    const results = await database.query({
      text: `
        UPDATE
          tasks
        SET
          title = $2,
          description = $3,
          status = $4,
          priority = $5,
          assigned_to = $6,
          due_date = $7,
          updated_at = timezone('utc', now())
        WHERE
          id = $1
          AND deleted_at IS NULL
        RETURNING
          *
      ;`,
      values: [
        task.id,
        task.title,
        task.description,
        task.status,
        task.priority,
        task.assigned_to,
        task.due_date,
      ],
    });

    return results.rows[0];
  }
}

async function remove(id) {
  const removedTask = await runSoftDeleteQuery(id);
  return removedTask;

  async function runSoftDeleteQuery(id) {
    const results = await database.query({
      text: `
        UPDATE
          tasks
        SET
          deleted_at = timezone('utc', now()),
          updated_at = timezone('utc', now())
        WHERE
          id = $1
          AND deleted_at IS NULL
        RETURNING
          *
      ;`,
      values: [id],
    });

    if (results.rowCount === 0) {
      throw new NotFoundError({
        message: "A tarefa informada não foi encontrada no sistema.",
        action: "Verifique se o id está correto.",
      });
    }

    return results.rows[0];
  }
}

const task = {
  create,
  findAll,
  findOneById,
  update,
  remove,
};

export default task;
