import { randomUUID } from "node:crypto";
import email from "@/infra/email.js";
import database from "@/infra/database.js";
import cryptography from "@/infra/crypto.js";
import webserver from "@/infra/webserver.js";
import { NotFoundError } from "@/infra/errors.js";

const EXPIRATION_IN_MILISECONDS = 60 * 15 * 1000; // 15 minutes

// O link do e-mail carrega o token cru; o banco guarda apenas o SHA-256,
// então um dump não permite tomar contas via reset de senha.
async function findOneValidByToken(tokenValue) {
  const recoveryTokenObject = await runSelectQuery(tokenValue);

  return recoveryTokenObject;

  async function runSelectQuery(tokenValue) {
    const results = await database.query({
      text: `
                SELECT
                    *
                FROM
                    password_recovery_tokens
                WHERE
                    token_hash = $1
                    AND expires_at > NOW()
                    AND used_at IS NULL
                LIMIT
                    1
            ;`,
      values: [cryptography.sha256(tokenValue)],
    });

    if (results.rowCount === 0) {
      throw new NotFoundError({
        message:
          "O token de recuperação não foi encontrado no sistema ou expirou.",
        action: "Solicite uma nova recuperação de senha.",
      });
    }

    return results.rows[0];
  }
}

async function create(userId) {
  const expireAt = new Date(Date.now() + EXPIRATION_IN_MILISECONDS);
  const token = randomUUID();

  const newToken = await runInsertQuery(userId, expireAt, token);

  // Devolve o token cru (para o link do e-mail); no banco fica só o hash.
  return { ...newToken, token };

  async function runInsertQuery(userId, expireAt, token) {
    const results = await database.query({
      text: `
                INSERT INTO
                    password_recovery_tokens (user_id, expires_at, token_hash)
                VALUES
                    ($1, $2, $3)
                RETURNING
                    *
            ;`,
      values: [userId, expireAt, cryptography.sha256(token)],
    });

    return results.rows[0];
  }
}

async function sendEmailToUser(user, recoveryToken) {
  await email.send({
    from: "AgrDrive <contato@agrdrive.com.br>",
    to: user.email,
    subject: "Recuperação de senha no AgrDrive",
    text: `${user.username}, clique no link abaixo para definir uma nova senha no AgrDrive:

${webserver.origin}/recuperar-senha/${recoveryToken.token}

Se você não solicitou a recuperação de senha, ignore este e-mail.

Atenciosamente,
Equipe AgrDrive`,
  });
}

async function markTokenAsUsed(recoveryTokenId) {
  const results = await database.query({
    text: `
            UPDATE
                password_recovery_tokens
            SET
                used_at = timezone('utc', now()),
                updated_at = timezone('utc', now())
            WHERE
                id = $1
            RETURNING
                *
        ;`,
    values: [recoveryTokenId],
  });

  return results.rows[0];
}

const recovery = {
  sendEmailToUser,
  create,
  findOneValidByToken,
  markTokenAsUsed,
  EXPIRATION_IN_MILISECONDS,
};

export default recovery;
