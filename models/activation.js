import { randomUUID } from "node:crypto";
import email from "@/infra/email.js";
import database from "@/infra/database.js";
import cryptography from "@/infra/crypto.js";
import webserver from "@/infra/webserver.js";
import { ForbiddenError, NotFoundError } from "@/infra/errors.js";
import user from "@/models/user.js";
import authorization from "@/models/authorization.js";

const EXPIRATION_IN_MILISECONDS = 60 * 15 * 1000; // 15 minutes

// O link do e-mail carrega o token cru; o banco guarda apenas o SHA-256,
// então um dump não permite ativar contas de terceiros.
async function findOneValidByToken(tokenValue) {
  const activationTokenObject = await runSelectQuery(tokenValue);

  return activationTokenObject;

  async function runSelectQuery(tokenValue) {
    const results = await database.query({
      text: `
                SELECT
                    *
                FROM
                    user_activation_tokens
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
          "O token de ativação não foi encontrado no sistema ou expirou.",
        action: "Faça um novo cadastro.",
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
                    user_activation_tokens (user_id, expires_at, token_hash)
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

async function sendEmailToUser(user, activationToken) {
  await email.send({
    from: "AgrDrive <contato@agrdrive.com.br>",
    to: user.email,
    subject: "Ative seu cadastro no AgrDrive!",
    text: `${user.username}, clique no link abaixo para ativar seu cadastro no AgrDrive:
        
${webserver.origin}/ativar/${activationToken.token}

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

  // Preserva as permissões de módulo escolhidas no cadastro,
  // trocando apenas o token de ativação pelas features de sessão.
  const featuresToKeep = userToActivate.features.filter(
    (feature) => feature !== "read:activation_token",
  );

  const activatedUser = await user.setFeatures(userId, [
    "create:session",
    "read:session",
    "update:user",
    ...featuresToKeep,
  ]);
  return activatedUser;
}

const activation = {
  sendEmailToUser,
  create,
  findOneValidByToken,
  markTokenAsUsed,
  activateUserByUserId,
  EXPIRATION_IN_MILISECONDS,
};

export default activation;
