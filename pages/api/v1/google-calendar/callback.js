import * as cookie from "cookie";
import { createRouter } from "next-connect";
import controller from "@/infra/controller.js";
import googleCalendar from "@/models/google-calendar.js";

const STATE_COOKIE = "google_oauth_state";

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .use(controller.canRequest("use:agenda"))
  .get(getHandler)
  .handler(controller.errorHandlers);

async function getHandler(request, response) {
  const userTryingToConnect = request.context.user;
  const { code, state } = request.query;

  const clearStateCookie = cookie.serialize(STATE_COOKIE, "invalid", {
    path: "/",
    maxAge: -1,
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  });

  const expectedState = request.cookies[STATE_COOKIE];
  if (!code || !state || !expectedState || state !== expectedState) {
    response.setHeader("Set-Cookie", clearStateCookie);
    response.setHeader("Location", "/agenda?google=error");
    return response.status(302).end();
  }

  const tokens = await googleCalendar
    .exchangeCodeForTokens(code)
    .catch(() => null);

  response.setHeader("Set-Cookie", clearStateCookie);

  if (!tokens) {
    response.setHeader("Location", "/agenda?google=error");
    return response.status(302).end();
  }

  await googleCalendar.saveCredentials(userTryingToConnect.id, tokens);

  response.setHeader("Location", "/agenda?google=connected");
  return response.status(302).end();
}
