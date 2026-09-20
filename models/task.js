import database from "@/infra/database.js";
import logger from "@/infra/logger.js";
import notificationScheduler from "@/models/notification-scheduler.js";
import { NotFoundError, UnprocessableEntityError } from "@/infra/errors.js";
import {
  CLOSED_TASK_STATUSES,
  TASK_STATUS_LABELS,
  canTransitionTaskStatus,
} from "@/models/task-status.js";

// Lista montada a partir da constante compartilhada para que o SQL não
// possa divergir da regra em JavaScript. São valores internos do enum,
// nunca entrada de usuário.
const CLOSED_STATUSES_SQL = CLOSED_TASK_STATUSES.map(
  (status) => `'${status}'`,
).join(", ");

// `is_overdue` é derivado na consulta e nunca gravado. Persistir exigiria
// um job para envelhecer o registro à meia-noite; derivar sempre dá a
// resposta certa no instante da leitura, de graça. Tarefa encerrada não
// está atrasada — o prazo dela deixou de valer.
function isOverdueExpression(prefix) {
  return `(
            ${prefix}due_date IS NOT NULL
            AND ${prefix}due_date < now()
            AND ${prefix}status NOT IN (${CLOSED_STATUSES_SQL})
          ) AS is_overdue`;
}

function assertStatusTransition(currentStatus, nextStatus) {
  if (canTransitionTaskStatus(currentStatus, nextStatus)) {
    return;
  }

  const label = TASK_STATUS_LABELS[currentStatus] ?? currentStatus;

  throw new UnprocessableEntityError({
    message: `Uma tarefa ${label.toLowerCase()} não muda mais de status.`,
    action: "Crie uma nova tarefa se o trabalho precisar continuar.",
  });
}

async function create(tasksInputValues) {
  // Task + assignees são criados na mesma transação: se a inserção dos
  // assignees falhar, a task não fica órfã no banco.
  const newTask = await database.transaction(async (client) => {
    const insertedTask = await runInsertQuery(tasksInputValues, client);

    if (tasksInputValues.assigned_to) {
      const ids = Array.isArray(tasksInputValues.assigned_to)
        ? tasksInputValues.assigned_to
        : [tasksInputValues.assigned_to];
      await runInsertAssigneesQuery(insertedTask.id, ids, client);
    }

    return insertedTask;
  });

  const assignees = await runSelectAssigneesQuery(newTask.id);

  await reserveAssignedNotification({
    taskId: newTask.id,
    userIds: assignees.map((assignee) => assignee.id),
    actorId: newTask.created_by,
  });

  return { ...newTask, assignees, assigned_to: assignees[0]?.id ?? null };

  async function runInsertQuery(tasksInputValues, client) {
    const results = await client.query({
      text: `
        INSERT INTO
          tasks (title, description, status, priority, created_by, due_date)
        VALUES
          ($1, $2, $3, $4, $5, $6)
        RETURNING
          *,
          ${isOverdueExpression("")}
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
          ${isOverdueExpression("t.")},
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
          ${isOverdueExpression("t.")},
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

async function update(id, tasksInputValues, { actorId = null } = {}) {
  const currentTask = await findOneById(id);

  // Antes de qualquer escrita: mexer no status de uma tarefa encerrada
  // não pode gravar nem os outros campos que vieram na mesma requisição.
  if ("status" in tasksInputValues) {
    assertStatusTransition(currentTask.status, tasksInputValues.status);
  }

  const { assigned_to, ...taskFields } = tasksInputValues;
  const taskWithNewValues = { ...currentTask, ...taskFields };

  // Atualização da task e troca de assignees na mesma transação: falha no
  // meio não deixa a task sem responsáveis ou com estado parcial.
  const updatedTask = await database.transaction(async (client) => {
    const taskAfterUpdate = await runUpdateQuery(taskWithNewValues, client);

    if ("assigned_to" in tasksInputValues) {
      await runDeleteAssigneesQuery(id, client);
      if (assigned_to) {
        const ids = Array.isArray(assigned_to) ? assigned_to : [assigned_to];
        await runInsertAssigneesQuery(id, ids, client);
      }
    }

    return taskAfterUpdate;
  });

  const assignees = await runSelectAssigneesQuery(id);

  // Só quem entrou agora. A chave única já impediria o e-mail repetido,
  // mas calcular a diferença evita gastar uma ida ao banco toda vez que
  // alguém salva a tarefa sem mexer nos responsáveis.
  const previousIds = new Set(
    (currentTask.assignees ?? []).map((assignee) => assignee.id),
  );

  await reserveAssignedNotification({
    taskId: id,
    userIds: assignees
      .map((assignee) => assignee.id)
      .filter((assigneeId) => !previousIds.has(assigneeId)),
    actorId,
  });

  return { ...updatedTask, assignees, assigned_to: assignees[0]?.id ?? null };

  async function runUpdateQuery(task, client) {
    const results = await client.query({
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
          *,
          ${isOverdueExpression("")}
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

// Fora da transação da tarefa, e engolindo o erro: o aviso é consequência
// da atribuição, não condição dela. Ninguém pode perder uma tarefa salva
// porque a reserva do e-mail falhou — mas a falha precisa chegar a um
// humano, então vai para o log.
async function reserveAssignedNotification({ taskId, userIds, actorId }) {
  if (userIds.length === 0) {
    return;
  }

  try {
    await notificationScheduler.reserveTaskAssigned({
      taskId,
      userIds,
      actorId,
    });
  } catch (error) {
    logger.error("task_assigned_notification_failed", {
      task_id: taskId,
      reason: error.message,
    });
  }
}

// `client` é obrigatório: estas duas escritas em `task_assignees` só
// fazem sentido dentro da transação de `create`/`update`. Um default
// para `database` faria a escrita escapar da transação e sobreviver a
// um rollback, deixando responsáveis órfãos.
async function runInsertAssigneesQuery(taskId, userIds, client) {
  const placeholders = userIds.map((_, i) => `($1, $${i + 2})`).join(", ");
  await client.query({
    text: `INSERT INTO task_assignees (task_id, user_id) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    values: [taskId, ...userIds],
  });
}

async function runDeleteAssigneesQuery(taskId, client) {
  await client.query({
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
