import { createRouter } from "next-connect";
import controller from "infra/controller.js";
import activation from "models/activation.js";

const router = createRouter();

router.patch(patchHandler);

export default router.handler(controller.errorHandlers);

async function patchHandler(request, response) {
  const activationtokenId = request.query.token_id;

  const validActivationToken =
    await activation.findOneByValidId(activationtokenId);
  const usedActivationToken =
    await activation.markTokenAsUsed(activationtokenId);

  await activation.activateUserByUserId(validActivationToken.user_id);

  return response.status(200).json(usedActivationToken);
}
