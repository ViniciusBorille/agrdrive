import email from "@/infra/email.js";
import database from "@/infra/database.js";
import webserver from "@/infra/webserver.js";
import { NotFoundError } from "@/infra/errors.js";

const EXPIRATION_IN_MILISECONDS = 60 * 15 * 1000; // 15 minutes

async function findOneByValidId(tokenId) {
  const recoveryTokenObject = await runSelectQuery(tokenId);

  return recoveryTokenObject;

  async function runSelectQuery(tokenId) {
    const results = await database.query({
      text: `
                SELECT
                    *
                FROM
                    password_recovery_tokens
                WHERE
                    id = $1
                    AND expires_at > NOW()
                    AND used_at IS NULL
                LIMIT
                    1
            ;`,
      values: [tokenId],
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

  const newToken = await runInsertQuery(userId, expireAt);
  return newToken;

  async function runInsertQuery(userId, expireAt) {
    const results = await database.query({
      text: `
                INSERT INTO
                    password_recovery_tokens (user_id, expires_at)
                VALUES
                    ($1, $2)
                RETURNING
                    *
            ;`,
      values: [userId, expireAt],
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

${webserver.origin}/recuperar-senha/${recoveryToken.id}

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
  findOneByValidId,
  markTokenAsUsed,
  EXPIRATION_IN_MILISECONDS,
};

export default recovery;
