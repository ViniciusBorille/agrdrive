import database from "@/infra/database.js";
import { NotFoundError } from "@/infra/errors.js";

async function create(tasksInputValues) {
  const newTask = await runInsertQuery(tasksInputValues);
  if (tasksInputValues.assigned_to) {
    const ids = Array.isArray(tasksInputValues.assigned_to)
      ? tasksInputValues.assigned_to
      : [tasksInputValues.assigned_to];
    await runInsertAssigneesQuery(newTask.id, ids);
  }
  const assignees = await runSelectAssigneesQuery(newTask.id);
  return { ...newTask, assignees, assigned_to: assignees[0]?.id ?? null };

  async function runInsertQuery(tasksInputValues) {
    const results = await database.query({
      text: `
        INSERT INTO
          tasks (title, description, status, priority, created_by, due_date)
        VALUES
          ($1, $2, $3, $4, $5, $6)
        RETURNING
          *
      ;`,
      values: [
        tasksInputValues.title,
        tasksInputValues.description ?? null,
        tasksInputValues.status ?? "PENDING",
        tasksInputValues.priority ?? "MEDIUM",
        tasksInputValues.created_by,
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
      whereClause =
        "EXISTS (SELECT 1 FROM task_assignees ta2 WHERE ta2.task_id = t.id AND ta2.user_id = $1)";
    } else if (view === "created") {
      whereClause = "t.created_by = $1";
    } else {
      whereClause =
        "(t.created_by = $1 OR EXISTS (SELECT 1 FROM task_assignees ta2 WHERE ta2.task_id = t.id AND ta2.user_id = $1))";
    }

    const queryResult = await database.query({
      text: `
        SELECT
          t.*,
          COALESCE(
            json_agg(
              json_build_object('id', u.id, 'username', u.username)
              ORDER BY ta.created_at
            ) FILTER (WHERE u.id IS NOT NULL),
            '[]'::json
          ) AS assignees
        FROM
          tasks t
        LEFT JOIN
          task_assignees ta ON ta.task_id = t.id
        LEFT JOIN
          users u ON u.id = ta.user_id
        WHERE
          ${whereClause}
          AND t.deleted_at IS NULL
        GROUP BY
          t.id
        ORDER BY
          t.created_at DESC
      ;`,
      values: [userId],
    });

    return queryResult.rows.map((row) => ({
      ...row,
      assigned_to: row.assignees?.[0]?.id ?? null,
    }));
  }
}

async function findOneById(id) {
  const taskFound = await runSelectQuery(id);
  return taskFound;

  async function runSelectQuery(id) {
    const results = await database.query({
      text: `
        SELECT
          t.*,
          COALESCE(
            json_agg(
              json_build_object('id', u.id, 'username', u.username)
              ORDER BY ta.created_at
            ) FILTER (WHERE u.id IS NOT NULL),
            '[]'::json
          ) AS assignees
        FROM
          tasks t
        LEFT JOIN
          task_assignees ta ON ta.task_id = t.id
        LEFT JOIN
          users u ON u.id = ta.user_id
        WHERE
          t.id = $1
          AND t.deleted_at IS NULL
        GROUP BY
          t.id
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

    const row = results.rows[0];
    return { ...row, assigned_to: row.assignees?.[0]?.id ?? null };
  }
}

async function update(id, tasksInputValues) {
  const currentTask = await findOneById(id);
  const { assigned_to, ...taskFields } = tasksInputValues;
  const taskWithNewValues = { ...currentTask, ...taskFields };
  const updatedTask = await runUpdateQuery(taskWithNewValues);

  if ("assigned_to" in tasksInputValues) {
    await runDeleteAssigneesQuery(id);
    if (assigned_to) {
      const ids = Array.isArray(assigned_to) ? assigned_to : [assigned_to];
      await runInsertAssigneesQuery(id, ids);
    }
  }

  const assignees = await runSelectAssigneesQuery(id);
  return { ...updatedTask, assignees, assigned_to: assignees[0]?.id ?? null };

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
          due_date = $6,
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

async function runInsertAssigneesQuery(taskId, userIds) {
  const placeholders = userIds.map((_, i) => `($1, $${i + 2})`).join(", ");
  await database.query({
    text: `INSERT INTO task_assignees (task_id, user_id) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    values: [taskId, ...userIds],
  });
}

async function runDeleteAssigneesQuery(taskId) {
  await database.query({
    text: `DELETE FROM task_assignees WHERE task_id = $1`,
    values: [taskId],
  });
}

async function runSelectAssigneesQuery(taskId) {
  const results = await database.query({
    text: `
      SELECT u.id, u.username
      FROM task_assignees ta
      JOIN users u ON u.id = ta.user_id
      WHERE ta.task_id = $1
      ORDER BY ta.created_at
    `,
    values: [taskId],
  });
  return results.rows;
}

const task = {
  create,
  findAll,
  findOneById,
  update,
  remove,
};

export default task;
