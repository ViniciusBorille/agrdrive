import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "@/infra/controller.js";
import validator from "@/infra/validator.js";
import user from "@/models/user.js";
import session from "@/models/session.js";
import recovery from "@/models/recovery.js";
import authorization from "@/models/authorization";

const resetPasswordSchema = z
  .object({
    password: validator.passwordSchema,
  })
  .strict("Campos não permitidos foram enviados na requisição.");

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .patch(controller.canRequest("read:recovery_token"), patchHandler)
  .handler(controller.errorHandlers);

async function patchHandler(request, response) {
  const userTryingToPatch = request.context.user;
  const recoveryTokenId = validator.validate(
    validator.uuidSchema,
    request.query.token_id,
  );
  const { password } = validator.validate(resetPasswordSchema, request.body);

  const validRecoveryToken = await recovery.findOneByValidId(recoveryTokenId);

  const userToUpdate = await user.findOneById(validRecoveryToken.user_id);
  await user.update(userToUpdate.username, { password });

  // Encerra todas as sessões ativas do usuário após a troca de senha.
  await session.expireAllByUserId(userToUpdate.id);

  const usedRecoveryToken = await recovery.markTokenAsUsed(recoveryTokenId);

  const secureOutputValues = authorization.filterOutput(
    userTryingToPatch,
    "read:recovery_token",
    usedRecoveryToken,
  );

  return response.status(200).json(secureOutputValues);
}
