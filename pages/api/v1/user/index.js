import { createRouter } from "next-connect";
import controller from "@/infra/controller.js";
import user from "@/models/user.js";
import session from "@/models/session.js";
import authorization from "@/models/authorization.js";

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:session"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(request, response) {
  const userTryingToGet = request.context.user;
  const sessionToken = request.cookies.session_id;

  const sessionObject = await session.findOneValidByToken(sessionToken);
  await session.renew(sessionObject.id);
  // A renovação estende o prazo sem trocar o token; o cookie é reemitido
  // com o valor cru original (no banco existe apenas o hash).
  controller.setSessionCookie(sessionToken, response);

  const userFound = await user.findOneById(sessionObject.user_id);

  response.setHeader(
    "Cache-Control",
    "no-store, no-cache, max-age=0, must-revalidate",
  );

  const secureOutputValues = authorization.filterOutput(
    userTryingToGet,
    "read:user:self",
    userFound,
  );

  return response.status(200).json(secureOutputValues);
}
