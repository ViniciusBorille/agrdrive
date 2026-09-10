import { randomBytes } from "node:crypto";
import database from "@/infra/database.js";
import cryptography from "@/infra/crypto.js";
import { NotFoundError } from "@/infra/errors.js";
import { listNotificationTypes } from "@/models/notification-catalog.js";

// Noventa dias. O usuário pode abrir um e-mail antigo e querer parar de
// receber; link morto empurra de volta para o botão de spam, que é
// exatamente o que este token existe para evitar.
const EXPIRATION_IN_MILISECONDS = 90 * 24 * 60 * 60 * 1000;

// 32 bytes em vez do `randomUUID()` da recuperação de senha: aquele link
// vale 15 minutos, este vale três meses. Vida longa pede mais entropia.
const TOKEN_LENGTH_IN_BYTES = 32;

// O `pg` não tem parser para array de tipo enumerado e devolveria o
// literal do Postgres — a string "{TASK_DUE,VISIT_UPCOMING}" em vez de uma
// lista. O cast para `text[]` cai num tipo que ele sabe converter.
const TOKEN_COLUMNS_SQL = `
  t.id,
  t.user_id,
  t.token_hash,
  t.types::text[] AS types,
  t.used_at,
  t.expires_at,
  t.created_at,
  t.updated_at`;

// O e-mail carrega o token cru; o banco guarda só o SHA-256, como em
// `models/recovery.js`.
async function create(userId, types = []) {
  const token = randomBytes(TOKEN_LENGTH_IN_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + EXPIRATION_IN_MILISECONDS);

  const results = await database.query({
    text: `
      INSERT INTO
        notification_unsubscribe_tokens (user_id, token_hash, types, expires_at)
      VALUES
        ($1, $2, $3, $4)
      RETURNING
        id, user_id, types::text[] AS types, expires_at, created_at
    ;`,
    values: [userId, cryptography.sha256(token), types, expiresAt],
  });

  return { ...results.rows[0], token };
}

async function findOneValidByToken(tokenValue) {
  const results = await database.query({
    text: `
      SELECT
        ${TOKEN_COLUMNS_SQL},
        u.username,
        u.email
      FROM
        notification_unsubscribe_tokens t
      JOIN
        users u ON u.id = t.user_id
      WHERE
        t.token_hash = $1
        AND t.expires_at > NOW()
        AND t.used_at IS NULL
      LIMIT
        1
    ;`,
    values: [cryptography.sha256(tokenValue)],
  });

  if (results.rowCount === 0) {
    throw new NotFoundError({
      message: "O link de descadastro não foi encontrado ou já expirou.",
      action:
        "Entre no sistema e ajuste seus avisos em Configurações > Notificações.",
    });
  }

  return results.rows[0];
}

async function markTokenAsUsed(tokenId) {
  const results = await database.query({
    text: `
      UPDATE
        notification_unsubscribe_tokens
      SET
        used_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
      WHERE
        id = $1
        AND used_at IS NULL
      RETURNING
        *
    ;`,
    values: [tokenId],
  });

  return results.rows[0] ?? null;
}

// Desligar é gravar `enabled = false`, não apagar: os lembretes ficam
// guardados e voltam intactos se a pessoa religar depois. Descadastro por
// engano não deve custar a configuração inteira.
//
// O INSERT é necessário porque quem nunca abriu a tela não tem linha —
// nesse caso o padrão do catálogo vale, e um DELETE ou UPDATE sozinho não
// desligaria nada.
async function disable(userId, types) {
  if (types.length === 0) {
    return [];
  }

  const placeholders = types
    .map((_, index) => `($1, $${index + 2}, false)`)
    .join(", ");

  const results = await database.query({
    text: `
      INSERT INTO
        notification_preferences (user_id, type, enabled)
      VALUES
        ${placeholders}
      ON CONFLICT
        (user_id, type)
      DO UPDATE SET
        enabled = false,
        updated_at = timezone('utc', now())
      RETURNING
        type
    ;`,
    values: [userId, ...types],
  });

  return results.rows.map((row) => row.type);
}

function allTypes() {
  return listNotificationTypes().map((definition) => definition.type);
}

// Descadastro só alcança aviso agendado. Ativação de conta e recuperação
// de senha são transacionais — o usuário pediu, o sistema respondeu — e
// não consultam preferência nenhuma para sair.
async function apply(unsubscribeToken, { type = null } = {}) {
  const types = type ? [type] : allTypes();
  const disabled = await disable(unsubscribeToken.user_id, types);

  await markTokenAsUsed(unsubscribeToken.id);

  return disabled;
}

const notificationUnsubscribe = {
  create,
  findOneValidByToken,
  markTokenAsUsed,
  disable,
  apply,
  allTypes,
  EXPIRATION_IN_MILISECONDS,
};

export default notificationUnsubscribe;
