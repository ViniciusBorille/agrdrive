import database from "@/infra/database.js";
import { NotFoundError } from "@/infra/errors.js";

async function create(visitInputValues) {
  const results = await database.query({
    text: `
      INSERT INTO
        visits (title, client, event_date, start_time, end_time, type, created_by)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        *
    ;`,
    values: [
      visitInputValues.title,
      visitInputValues.client ?? null,
      visitInputValues.event_date,
      visitInputValues.start_time,
      visitInputValues.end_time,
      visitInputValues.type ?? "OUTRO",
      visitInputValues.created_by,
    ],
  });

  return results.rows[0];
}

async function findAll({ userId, from, to }) {
  const values = [userId];
  let whereClause = "created_by = $1 AND deleted_at IS NULL";

  if (from && to) {
    whereClause += " AND event_date BETWEEN $2 AND $3";
    values.push(from, to);
  }

  const results = await database.query({
    text: `
      SELECT
        *
      FROM
        visits
      WHERE
        ${whereClause}
      ORDER BY
        event_date ASC, start_time ASC
    ;`,
    values,
  });

  return results.rows;
}

async function findOneById(id) {
  const results = await database.query({
    text: `
      SELECT
        *
      FROM
        visits
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
      message: "A visita informada não foi encontrada no sistema.",
      action: "Verifique se o id está correto.",
    });
  }

  return results.rows[0];
}

async function update(id, visitInputValues) {
  const currentVisit = await findOneById(id);
  const visitWithNewValues = { ...currentVisit, ...visitInputValues };

  const results = await database.query({
    text: `
      UPDATE
        visits
      SET
        title = $2,
        client = $3,
        event_date = $4,
        start_time = $5,
        end_time = $6,
        type = $7,
        synced = $8,
        google_event_id = $9,
        updated_at = timezone('utc', now())
      WHERE
        id = $1
        AND deleted_at IS NULL
      RETURNING
        *
    ;`,
    values: [
      id,
      visitWithNewValues.title,
      visitWithNewValues.client,
      visitWithNewValues.event_date,
      visitWithNewValues.start_time,
      visitWithNewValues.end_time,
      visitWithNewValues.type,
      visitWithNewValues.synced,
      visitWithNewValues.google_event_id,
    ],
  });

  return results.rows[0];
}

async function remove(id) {
  const results = await database.query({
    text: `
      UPDATE
        visits
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
      message: "A visita informada não foi encontrada no sistema.",
      action: "Verifique se o id está correto.",
    });
  }

  return results.rows[0];
}

const visit = {
  create,
  findAll,
  findOneById,
  update,
  remove,
};

export default visit;
