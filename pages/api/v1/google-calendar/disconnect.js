import { createRouter } from "next-connect";
import controller from "@/infra/controller.js";
import googleCalendar from "@/models/google-calendar.js";

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .use(controller.canRequest("use:agenda"))
  .post(postHandler)
  .handler(controller.errorHandlers);

async function postHandler(request, response) {
  const userTryingToDisconnect = request.context.user;

  await googleCalendar.revokeAccess(userTryingToDisconnect.id);

  return response.status(200).json({ connected: false });
}
