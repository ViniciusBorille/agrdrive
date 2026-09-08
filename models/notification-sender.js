import database from "@/infra/database.js";
import email from "@/infra/email.js";
import logger from "@/infra/logger.js";
import { buildNotificationEmail } from "@/models/notification-templates.js";

// Falha de SMTP costuma ser momentânea, então desistir na primeira perderia
// aviso por nada. Endereço inválido, porém, falha sempre — sem teto a linha
// seria retentada em toda execução, para sempre.
const MAX_ATTEMPTS = 3;

// Teto por execução. O tempo limite da função serverless é o limite real do
// lote: se não couber, a saída é rodar com mais frequência, não aumentar o
// laço.
const DEFAULT_BATCH_SIZE = 200;

// Junta a entrega reservada com os dados de quem recebe e do item avisado.
// `title` vem nulo quando o assunto sumiu entre a reserva e o envio; essas
// linhas são deixadas para o `skipObsolete` do agendador em vez de virarem
// e-mail sobre coisa nenhuma.
async function findPending({ limit = DEFAULT_BATCH_SIZE } = {}) {
  const results = await database.query({
    text: `
      SELECT
        d.id,
        d.user_id,
        d.type,
        d.subject_id,
        d.offset_minutes,
        d.attempts,
        u.username,
        u.email,
        u.timezone,
        COALESCE(t.title, v.title) AS title,
        COALESCE(
          t.due_date,
          (v.event_date + v.start_time) AT TIME ZONE u.timezone
        ) AS event_at
      FROM
        notification_deliveries d
      JOIN
        users u ON u.id = d.user_id
      LEFT JOIN
        tasks t
          ON d.type = 'TASK_DUE'
          AND t.id = d.subject_id
          AND t.deleted_at IS NULL
          AND t.status NOT IN ('COMPLETED', 'CANCELLED')
      LEFT JOIN
        visits v
          ON d.type = 'VISIT_UPCOMING'
          AND v.id = d.subject_id
          AND v.deleted_at IS NULL
      WHERE
        d.status = 'PENDING'
        AND d.attempts < $1
      ORDER BY
        d.user_id, d.scheduled_for
      LIMIT
        $2
    ;`,
    values: [MAX_ATTEMPTS, limit],
  });

  return results.rows.filter((row) => row.title !== null);
}

async function markSent(ids) {
  await database.query({
    text: `
      UPDATE notification_deliveries
      SET
        status = 'SENT',
        sent_at = timezone('utc', now()),
        attempts = attempts + 1,
        error = NULL
      WHERE
        id = ANY($1)
    ;`,
    values: [ids],
  });
}

// Uma tentativa gasta. Quem ainda tem crédito continua PENDING e volta na
// próxima execução; quem esgotou vira FAILED e sai de circulação.
async function registerFailure(ids, message) {
  const results = await database.query({
    text: `
      UPDATE notification_deliveries
      SET
        attempts = attempts + 1,
        error = $2,
        status = CASE
          WHEN attempts + 1 >= $3 THEN 'FAILED'
          ELSE 'PENDING'
        END::notification_delivery_status
      WHERE
        id = ANY($1)
      RETURNING id, type, attempts, status
    ;`,
    values: [ids, message, MAX_ATTEMPTS],
  });

  return results.rows;
}

function groupByUser(rows) {
  const users = new Map();

  for (const row of rows) {
    if (!users.has(row.user_id)) {
      users.set(row.user_id, {
        user: {
          id: row.user_id,
          username: row.username,
          email: row.email,
          timezone: row.timezone,
        },
        rows: [],
      });
    }

    users.get(row.user_id).rows.push(row);
  }

  return [...users.values()];
}

function toItems(rows) {
  return rows.map((row) => ({
    type: row.type,
    offsetMinutes: row.offset_minutes,
    title: row.title,
    eventAt: row.event_at,
  }));
}

// Envia o que está reservado. A falha de um usuário não derruba o lote: o
// laço segue, no mesmo espírito do `pages/api/v1/google-calendar/sync.js`.
async function sendPending({ limit = DEFAULT_BATCH_SIZE } = {}) {
  const pending = await findPending({ limit });
  const summary = { sent: 0, retrying: 0, failed: 0, recipients: 0 };

  for (const { user, rows } of groupByUser(pending)) {
    const ids = rows.map((row) => row.id);
    const message = buildNotificationEmail({ user, items: toItems(rows) });

    try {
      await email.send({
        to: user.email,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      await markSent(ids);
      summary.sent += ids.length;
      summary.recipients += 1;
    } catch (error) {
      // Só a mensagem. O `ServiceError` de `infra/email.js` carrega
      // `context: mailOptions`, que inclui o corpo do e-mail e o endereço
      // do destinatário — isso não pode ir para o log.
      const updated = await registerFailure(ids, error.message);

      for (const row of updated) {
        if (row.status === "FAILED") {
          summary.failed += 1;
          // Esgotou as tentativas: ninguém mais vai tentar, então este é o
          // único momento em que a falha pode chegar a um humano.
          logger.error("notification_delivery_failed", {
            delivery_id: row.id,
            type: row.type,
            attempts: row.attempts,
            reason: error.message,
          });
        } else {
          summary.retrying += 1;
        }
      }
    }
  }

  return summary;
}

const notificationSender = {
  findPending,
  sendPending,
  MAX_ATTEMPTS,
  DEFAULT_BATCH_SIZE,
};

export default notificationSender;
