import { createRouter } from "next-connect";
import controller from "@/infra/controller";
import user from "@/models/user";
import authorization from "@/models/authorization";
import { ForbiddenError } from "@/infra/errors";

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .get(getHandler)
  .patch(controller.canRequest("update:user"), patchHandler)
  .handler(controller.errorHandlers);

async function getHandler(request, response) {
  const userTryingToGet = request.context.user;
  const username = request.query.username;
  const userFound = await user.findOneByUsername(username);

  const secureOutputValues = authorization.filterOutput(
    userTryingToGet,
    "read:user",
    userFound,
  );

  return response.status(200).json(secureOutputValues);
}

async function patchHandler(request, response) {
  const username = request.query.username;
  const userInputValues = request.body;

  const userTryingToPatch = request.context.user;
  const targetUser = await user.findOneByUsername(username);

  if (!authorization.can(userTryingToPatch, "update:user", targetUser)) {
    throw new ForbiddenError({
      message: "Você não possui permissão para atualizar outro usuário.",
      action:
        "Verifique se você possui a feature necessária para atualizar outros usuários.",
    });
  }

  const updatedUser = await user.update(username, userInputValues);

  const secureOutputValues = authorization.filterOutput(
    userTryingToPatch,
    "read:user",
    updatedUser,
  );

  return response.status(200).json(secureOutputValues);
}
