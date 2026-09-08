import database from "@/infra/database.js";

// Quanto tempo depois do momento previsto um aviso ainda vale a pena.
// Passou disso, o aviso perdeu a graça: mandar "sua tarefa vence em 3
// dias" dois dias atrasado é pior que não mandar.
const TOLERANCE_IN_MINUTES = 24 * 60;

// Até onde olhar para trás. Sem este teto, a primeira execução em uma base
// antiga geraria uma linha SKIPPED para cada aviso que "deveria" ter saído
// desde sempre.
const BACKFILL_LIMIT_IN_MINUTES = 7 * 24 * 60;

const DAY_IN_MINUTES = 1440;

// Antecedência de um dia ou mais é conceito de calendário: "3 dias antes"
// quer dizer de manhã, no horário que o usuário escolheu. Antecedência
// menor que um dia é conceito de relógio: "2 horas antes" precisa ser duas
// horas antes mesmo, senão vira outra coisa. Por isso `send_at_time` só
// vale a partir de 1440 minutos.
const SCHEDULED_FOR_SQL = `
  CASE
    WHEN base.offset_minutes >= ${DAY_IN_MINUTES} THEN
      (
        (
          (base.event_at AT TIME ZONE base.timezone)
          - (base.offset_minutes * interval '1 minute')
        )::date + base.send_at_time
      ) AT TIME ZONE base.timezone
    ELSE
      base.event_at - (base.offset_minutes * interval '1 minute')
  END AS scheduled_for`;

// Uma consulta por tipo, não uma por usuário: `infra/database.js` abre uma
// conexão nova a cada query, então um laço por usuário abriria centenas de
// conexões contra o Neon e bateria no limite.
//
// A apuração e a reserva acontecem no mesmo INSERT ... SELECT: quem
// sobrevive ao ON CONFLICT ganhou a corrida e é o único autorizado a
// enviar. Duas execuções simultâneas do job não duplicam, e não há lock na
// aplicação — quem resolve é a chave única.
function buildReservationQuery(type, baseQuery) {
  return `
    INSERT INTO notification_deliveries
      (user_id, type, subject_id, offset_minutes, scheduled_for, status)
    SELECT
      candidato.user_id,
      '${type}'::notification_type,
      candidato.subject_id,
      candidato.offset_minutes,
      candidato.scheduled_for,
      CASE
        WHEN candidato.scheduled_for > $1::timestamptz - ($2 * interval '1 minute')
          THEN 'PENDING'
        ELSE 'SKIPPED'
      END::notification_delivery_status
    FROM (
      SELECT
        base.user_id,
        base.subject_id,
        base.offset_minutes,
        ${SCHEDULED_FOR_SQL}
      FROM (${baseQuery}) AS base
    ) AS candidato
    WHERE
      candidato.scheduled_for <= $1::timestamptz
      AND candidato.scheduled_for > $1::timestamptz - ($3 * interval '1 minute')
    ON CONFLICT
      (user_id, type, subject_id, offset_minutes)
    DO NOTHING
    RETURNING *
  ;`;
}

// A feature do módulo é conferida aqui e não só na tela: preferência
// gravada antes de o acesso ser revogado não pode continuar gerando aviso.
const TASK_DUE_BASE = `
  SELECT
    u.id AS user_id,
    u.timezone,
    p.send_at_time,
    r.offset_minutes,
    t.id AS subject_id,
    t.due_date AS event_at
  FROM tasks t
  JOIN task_assignees ta ON ta.task_id = t.id
  JOIN users u ON u.id = ta.user_id
  JOIN notification_preferences p
    ON p.user_id = u.id AND p.type = 'TASK_DUE' AND p.enabled
  JOIN notification_reminders r ON r.preference_id = p.id
  WHERE
    t.deleted_at IS NULL
    AND t.due_date IS NOT NULL
    AND t.status NOT IN ('COMPLETED', 'CANCELLED')
    AND 'use:tasks' = ANY(u.features)`;

// `visits` guarda data e hora sem fuso; o instante real só existe depois
// de interpretá-las no fuso do usuário.
const VISIT_UPCOMING_BASE = `
  SELECT
    u.id AS user_id,
    u.timezone,
    p.send_at_time,
    r.offset_minutes,
    v.id AS subject_id,
    (v.event_date + v.start_time) AT TIME ZONE u.timezone AS event_at
  FROM visits v
  JOIN users u ON u.id = v.created_by
  JOIN notification_preferences p
    ON p.user_id = u.id AND p.type = 'VISIT_UPCOMING' AND p.enabled
  JOIN notification_reminders r ON r.preference_id = p.id
  WHERE
    v.deleted_at IS NULL
    AND 'use:agenda' = ANY(u.features)`;

async function reserveByType(type, baseQuery, now) {
  const results = await database.query({
    text: buildReservationQuery(type, baseQuery),
    values: [now, TOLERANCE_IN_MINUTES, BACKFILL_LIMIT_IN_MINUTES],
  });

  return results.rows;
}

// Reserva o que já venceu e ainda não foi reservado. Não envia nada — o
// envio é de quem consome as linhas PENDING. Separar as duas coisas é o
// que torna a apuração testável sem mandar e-mail.
//
// `now` entra por parâmetro para o teste conseguir posicionar o relógio em
// vez de depender do momento em que roda.
async function reserveDue({ now = new Date() } = {}) {
  const reserved = [
    ...(await reserveByType("TASK_DUE", TASK_DUE_BASE, now)),
    ...(await reserveByType("VISIT_UPCOMING", VISIT_UPCOMING_BASE, now)),
  ];

  return {
    pending: reserved.filter((row) => row.status === "PENDING"),
    skipped: reserved.filter((row) => row.status === "SKIPPED"),
  };
}

// Uma reserva pode envelhecer entre a apuração e o envio: a tarefa é
// concluída, a visita é apagada. Marcar como SKIPPED evita mandar aviso de
// algo que deixou de existir, e deixa registro de que a decisão foi
// consciente.
async function skipObsolete() {
  const results = await database.query({
    text: `
      UPDATE notification_deliveries d
      SET
        status = 'SKIPPED'
      WHERE
        d.status = 'PENDING'
        AND (
          (
            d.type = 'TASK_DUE'
            AND NOT EXISTS (
              SELECT 1 FROM tasks t
              WHERE t.id = d.subject_id
                AND t.deleted_at IS NULL
                AND t.status NOT IN ('COMPLETED', 'CANCELLED')
            )
          )
          OR (
            d.type = 'VISIT_UPCOMING'
            AND NOT EXISTS (
              SELECT 1 FROM visits v
              WHERE v.id = d.subject_id AND v.deleted_at IS NULL
            )
          )
        )
      RETURNING *
    ;`,
  });

  return results.rows;
}

const notificationScheduler = {
  reserveDue,
  skipObsolete,
  TOLERANCE_IN_MINUTES,
  BACKFILL_LIMIT_IN_MINUTES,
};

export default notificationScheduler;
