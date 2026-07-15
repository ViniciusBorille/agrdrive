import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "@/infra/controller";
import validator from "@/infra/validator.js";
import user from "@/models/user";
import activation from "@/models/activation";
import authorization from "@/models/authorization";
import session from "@/models/session.js";
import logger from "@/infra/logger.js";
import { ForbiddenError } from "@/infra/errors";

const updateUserSchema = z
  .object({
    username: validator.usernameSchema,
    email: validator.emailSchema,
    password: validator.passwordSchema,
  })
  .partial()
  .strict("Campos não permitidos foram enviados na requisição.")
  .refine((data) => Object.keys(data).length > 0, {
    message: "Pelo menos um campo deve ser fornecido para atualização.",
  });

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .get(getHandler)
  .patch(controller.canRequest("update:user"), patchHandler)
  .handler(controller.errorHandlers);

async function getHandler(request, response) {
  const userTryingToGet = request.context.user;
  const username = validator.validate(
    validator.usernameSchema,
    request.query.username,
  );
  const userFound = await user.findOneByUsername(username);

  const secureOutputValues = authorization.filterOutput(
    userTryingToGet,
    "read:user",
    userFound,
  );

  return response.status(200).json(secureOutputValues);
}

async function patchHandler(request, response) {
  const username = validator.validate(
    validator.usernameSchema,
    request.query.username,
  );
  const userTryingToPatch = request.context.user;
  const targetUser = await user.findOneByUsername(username);

  if (!authorization.can(userTryingToPatch, "update:user", targetUser)) {
    throw new ForbiddenError({
      message: "Você não possui permissão para atualizar outro usuário.",
      action:
        "Verifique se você possui a feature necessária para atualizar outros usuários.",
    });
  }

  const userInputValues = validator.validate(updateUserSchema, request.body);

  const emailChanged =
    "email" in userInputValues &&
    userInputValues.email.toLowerCase() !== targetUser.email.toLowerCase();

  let updatedUser = await user.update(username, userInputValues);

  if ("password" in userInputValues) {
    // Troca de senha invalida todas as sessões do usuário-alvo (A07),
    // exceto a sessão atual de quem fez a requisição.
    await session.expireAllByUserId(targetUser.id, {
      exceptToken: request.cookies?.session_id,
    });
  }

  if ("password" in userInputValues || emailChanged) {
    logger.security("user_credentials_updated", {
      ...logger.getRequestMetadata(request),
      user_id: userTryingToPatch.id ?? null,
      target_user_id: targetUser.id,
      fields: Object.keys(userInputValues),
    });
  }

  if (emailChanged) {
    updatedUser = await user.setFeatures(updatedUser.id, [
      "read:activation_token",
    ]);
    const activationToken = await activation.create(updatedUser.id);
    await activation.sendEmailToUser(updatedUser, activationToken);
  }

  const secureOutputValues = authorization.filterOutput(
    userTryingToPatch,
    "read:user",
    updatedUser,
  );

  const responseBody = emailChanged
    ? { ...secureOutputValues, emailVerificationRequired: true }
    : secureOutputValues;

  return response.status(200).json(responseBody);
}
