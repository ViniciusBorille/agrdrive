import { createRouter } from "next-connect";
import controller from "@/infra/controller.js";
import googleCalendar from "@/models/google-calendar.js";

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .use(controller.canRequest("use:agenda"))
  .get(getHandler)
  .handler(controller.errorHandlers);

async function getHandler(request, response) {
  const userTryingToGet = request.context.user;

  const credentials = await googleCalendar.getCredentials(userTryingToGet.id);

  return response.status(200).json({
    connected: Boolean(credentials),
    expires_at: credentials?.expires_at ?? null,
  });
}
