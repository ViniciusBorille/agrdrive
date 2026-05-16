import email from "infra/email.js";
import database from "infra/database.js";
import webserver from "infra/webserver.js";
import { ForbiddenError, NotFoundError } from "infra/errors.js";
import user from "models/user.js";
import authorization from "models/authorization.js";

const EXPIRATION_IN_MILISECONDS = 60 * 15 * 1000; // 15 minutes

async function findOneByValidId(tokenId) {
  const activationTokenObject = await runSelectQuery(tokenId);

  return activationTokenObject;

  async function runSelectQuery(tokenId) {
    const results = await database.query({
      text: `
                SELECT
                    *
                FROM
                    user_activation_tokens
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
          "O token de ativação não foi encontrado no sistema ou expirou.",
        action: "Faça um novo cadastro.",
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
                    user_activation_tokens (user_id, expires_at)
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

async function sendEmailToUser(user, activationToken) {
  await email.send({
    from: "AgrDrive <contato@agrdrive.com.br>",
    to: user.email,
    subject: "Ative seu cadastro no AgrDrive!",
    text: `${user.username}, clique no link abaixo para ativar seu cadastro no AgrDrive:
        
${webserver.origin}/ativar/${activationToken.id}

Atenciosamente,
Equipe AgrDrive`,
  });
}

async function markTokenAsUsed(activationTokenId) {
  const results = await database.query({
    text: `
            UPDATE
                user_activation_tokens
            SET
                used_at = timezone('utc', now()),
                updated_at = timezone('utc', now())
            WHERE
                id = $1
            RETURNING
                *
        ;`,
    values: [activationTokenId],
  });

  return results.rows[0];
}

async function activateUserByUserId(userId) {
  const userToActivate = await user.findOneById(userId);

  if (!authorization.can(userToActivate, "read:activation_token")) {
    throw new ForbiddenError({
      message: "Você não pode mais utilizar tokens de ativação.",
      action: "Entre em contato com o suporte.",
    });
  }

  const activatedUser = await user.setFeatures(userId, [
    "create:session",
    "read:session",
    "update:user",
  ]);
  return activatedUser;
}

const activation = {
  sendEmailToUser,
  create,
  findOneByValidId,
  markTokenAsUsed,
  activateUserByUserId,
  EXPIRATION_IN_MILISECONDS,
};

export default activation;
