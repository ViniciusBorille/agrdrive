import database from "@/infra/database.js";
import {
  findNotificationType,
  listNotificationTypes,
} from "@/models/notification-catalog.js";

const DEFAULT_SEND_AT_TIME = "08:00";

// `send_at_time` é `time` no banco e volta como "08:00:00". A API fala em
// "HH:MM" — converter aqui evita que cada consumidor tenha a própria
// versão do corte.
const SEND_AT_TIME_SQL = "to_char(p.send_at_time, 'HH24:MI') AS send_at_time";

// Do mais distante para o mais próximo: é a ordem em que os avisos
// acontecem, e é como a tela vai listar.
const REMINDERS_SQL = `
  COALESCE(
    (
      SELECT array_agg(r.offset_minutes ORDER BY r.offset_minutes DESC)
      FROM notification_reminders r
      WHERE r.preference_id = p.id
    ),
    ARRAY[]::integer[]
  ) AS reminders`;

async function findAllByUserId(userId) {
  const results = await database.query({
    text: `
      SELECT
        p.type,
        p.enabled,
        ${SEND_AT_TIME_SQL},
        ${REMINDERS_SQL}
      FROM
        notification_preferences p
      WHERE
        p.user_id = $1
    ;`,
    values: [userId],
  });

  return results.rows;
}

async function findOneByUserIdAndType(userId, type) {
  const results = await database.query({
    text: `
      SELECT
        p.type,
        p.enabled,
        ${SEND_AT_TIME_SQL},
        ${REMINDERS_SQL}
      FROM
        notification_preferences p
      WHERE
        p.user_id = $1
        AND p.type = $2
      LIMIT
        1
    ;`,
    values: [userId, type],
  });

  return results.rows[0] ?? null;
}

// Substituição, não mesclagem: a tela sempre manda o estado completo
// daquele tipo. Isso remove a ambiguidade de "lista vazia quer dizer
// apagar tudo ou não mexer?".
//
// Preferência e lembretes vão na mesma transação — uma falha no meio
// deixaria a preferência ligada sem nenhuma antecedência, ou seja,
// ligada e muda.
async function replace(userId, type, { enabled, send_at_time, reminders }) {
  await database.transaction(async (client) => {
    const preferenceResult = await client.query({
      text: `
        INSERT INTO
          notification_preferences (user_id, type, enabled, send_at_time)
        VALUES
          ($1, $2, $3, $4)
        ON CONFLICT
          (user_id, type)
        DO UPDATE SET
          enabled = EXCLUDED.enabled,
          send_at_time = EXCLUDED.send_at_time,
          updated_at = timezone('utc', now())
        RETURNING
          id
      ;`,
      values: [userId, type, enabled, send_at_time],
    });

    const preferenceId = preferenceResult.rows[0].id;

    await client.query({
      text: `DELETE FROM notification_reminders WHERE preference_id = $1`,
      values: [preferenceId],
    });

    if (reminders.length > 0) {
      const placeholders = reminders
        .map((_, index) => `($1, $${index + 2})`)
        .join(", ");

      await client.query({
        text: `INSERT INTO notification_reminders (preference_id, offset_minutes) VALUES ${placeholders}`,
        values: [preferenceId, ...reminders],
      });
    }
  });

  return await findOneByUserIdAndType(userId, type);
}

// O que o usuário recebe quando nunca configurou nada: o padrão do
// catálogo. Assim o GET responde certo sem exigir uma escrita antes, e
// usuário novo já nasce sendo avisado.
function defaultsFor(type) {
  const definition = findNotificationType(type);

  return {
    type,
    enabled: true,
    send_at_time: DEFAULT_SEND_AT_TIME,
    reminders: definition ? definition.defaultOffsets : [],
  };
}

// Usuário novo precisa nascer com as preferências **gravadas**, não apenas
// com um padrão teórico. O agendador faz JOIN com `notification_preferences`
// — quem não tem linha nunca é apurado, e nenhum e-mail sai. Sem isto a
// tela mostra os padrões como se estivessem valendo, o que é pior que não
// mostrar nada: ninguém vai abrir a configuração para clicar em Salvar num
// formulário que já parece certo.
//
// Sem filtro por feature de propósito. A feature do módulo é conferida pelo
// agendador na hora da apuração; gravar a linha aqui faz com que conceder
// `use:agenda` meses depois já comece a avisar, sem visita à tela.
//
// `ON CONFLICT DO NOTHING` em vez de sobrescrever: quem já configurou tem
// preferência sobre o padrão, sempre.
async function seedDefaultsFor(userId) {
  await database.transaction(async (client) => {
    for (const definition of listNotificationTypes()) {
      const created = await client.query({
        text: `
          INSERT INTO
            notification_preferences (user_id, type, enabled, send_at_time)
          VALUES
            ($1, $2, true, $3)
          ON CONFLICT
            (user_id, type)
          DO NOTHING
          RETURNING
            id
        ;`,
        values: [userId, definition.type, DEFAULT_SEND_AT_TIME],
      });

      // Já existia: não encosta nos lembretes de quem configurou.
      if (created.rowCount === 0 || definition.defaultOffsets.length === 0) {
        continue;
      }

      const placeholders = definition.defaultOffsets
        .map((_, index) => `($1, $${index + 2})`)
        .join(", ");

      await client.query({
        text: `INSERT INTO notification_reminders (preference_id, offset_minutes) VALUES ${placeholders}`,
        values: [created.rows[0].id, ...definition.defaultOffsets],
      });
    }
  });
}

const notificationPreference = {
  findAllByUserId,
  findOneByUserIdAndType,
  replace,
  defaultsFor,
  seedDefaultsFor,
  DEFAULT_SEND_AT_TIME,
};

export default notificationPreference;
