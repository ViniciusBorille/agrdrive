import { createRouter } from "next-connect";
import controller from "@/infra/controller.js";
import validator from "@/infra/validator.js";
import activation from "@/models/activation.js";
import authorization from "@/models/authorization";

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .patch(controller.canRequest("read:activation_token"), patchHandler)
  .handler(controller.errorHandlers);

async function patchHandler(request, response) {
  const userTryingToPatch = request.context.user;
  const activationtokenId = validator.validate(
    validator.uuidSchema,
    request.query.token_id,
  );

  const validActivationToken =
    await activation.findOneByValidId(activationtokenId);

  await activation.activateUserByUserId(validActivationToken.user_id);

  const usedActivationToken =
    await activation.markTokenAsUsed(activationtokenId);

  const secureOutputValues = authorization.filterOutput(
    userTryingToPatch,
    "read:activation_token",
    usedActivationToken,
  );

  return response.status(200).json(secureOutputValues);
}
