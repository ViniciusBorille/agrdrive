import { randomUUID } from "node:crypto";
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
  const state = randomUUID();

  response.setHeader(
    "Set-Cookie",
    cookie.serialize(STATE_COOKIE, state, {
      path: "/",
      maxAge: 600,
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
    }),
  );

  response.setHeader("Location", googleCalendar.getAuthUrl(state));
  return response.status(302).end();
}
