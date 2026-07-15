import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "@/infra/controller.js";
import validator from "@/infra/validator.js";
import logger from "@/infra/logger.js";
import authentication from "@/models/authentication.js";
import authorization from "@/models/authorization.js";
import session from "@/models/session.js";

import { ForbiddenError } from "@/infra/errors.js";

const createSessionSchema = z
  .object({
    email: validator.emailSchema,
    password: z
      .string("A senha deve ser um texto.")
      .min(1, "A senha é obrigatória.")
      .max(72, "A senha deve ter no máximo 72 caracteres."),
  })
  .strict("Campos não permitidos foram enviados na requisição.");

// Proteção contra brute force / credential stuffing (A07):
// no máximo 5 tentativas de login por IP+email a cada 15 minutos.
const loginRateLimit = controller.rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (request, ip) =>
    `${ip}:${String(request.body?.email ?? "").toLowerCase()}`,
});

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .post(loginRateLimit, controller.canRequest("create:session"), postHandler)
  .delete(deleteHandler)
  .handler(controller.errorHandlers);

async function postHandler(request, response) {
  const userInputValues = validator.validate(createSessionSchema, request.body);

  const authenticatedUser = await authentication.getUser(
    userInputValues.email,
    userInputValues.password,
  );

  if (!authorization.can(authenticatedUser, "create:session")) {
    throw new ForbiddenError({
      message: "Você não tem permissão para fazer login",
      action: "Contate o suporte caso você acredite que seja um erro.",
    });
  }

  const newSession = await session.create(authenticatedUser.id);

  logger.security("login_success", {
    ...logger.getRequestMetadata(request),
    user_id: authenticatedUser.id,
  });

  controller.setSessionCookie(newSession.token, response);

  const secureOutputValues = authorization.filterOutput(
    authenticatedUser,
    "read:session",
    newSession,
  );

  return response.status(201).json(secureOutputValues);
}

async function deleteHandler(request, response) {
  const userTryingToDelete = request.context.user;
  const sessionToken = request.cookies.session_id;

  const sessionObject = await session.findOneValidByToken(sessionToken);
  const expiredSession = await session.expireById(sessionObject.id);

  logger.security("logout", {
    ...logger.getRequestMetadata(request),
    user_id: sessionObject.user_id,
  });

  controller.clearSessionCookie(response);

  const secureOutputValues = authorization.filterOutput(
    userTryingToDelete,
    "read:session",
    expiredSession,
  );

  return response.status(200).json(secureOutputValues);
}
