import orchestrator from "@/tests/orchestrator.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

async function activatedSessionWithAgenda() {
  const createdUser = await orchestrator.createUser();
  const activatedUser = await orchestrator.activateUser(createdUser);
  const withAgenda = await orchestrator.addFeaturesToUser(activatedUser, [
    "use:agenda",
  ]);
  const sessionObject = await orchestrator.createSession(withAgenda);
  return { user: withAgenda, sessionObject };
}

// `redirect: "manual"` mantém o 302 na resposta em vez de seguir para o
// Google de verdade, que é o que permite inspecionar Location e cookies.
function callback(query, cookies) {
  return fetch(
    `http://localhost:3000/api/v1/google-calendar/callback?${new URLSearchParams(query)}`,
    {
      redirect: "manual",
      headers: cookies ? { Cookie: cookies } : {},
    },
  );
}

function startConnect(sessionToken) {
  return fetch("http://localhost:3000/api/v1/google-calendar/connect", {
    redirect: "manual",
    headers: { Cookie: `session_id=${sessionToken}` },
  });
}

function readStateCookie(response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  return setCookie.match(/google_oauth_state=([^;]+)/)?.[1] ?? null;
}

describe("GET /api/v1/google-calendar/connect", () => {
  test("The state sent to Google is the same stored in an httpOnly cookie", async () => {
    const { sessionObject } = await activatedSessionWithAgenda();

    const response = await startConnect(sessionObject.token);
    const location = new URL(response.headers.get("location"));
    const setCookie = response.headers.get("set-cookie");

    expect(response.status).toBe(302);
    expect(location.searchParams.get("state")).toBe(readStateCookie(response));
    expect(location.searchParams.get("state")).not.toBeNull();
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
  });

  test("Two different users never share the same state", async () => {
    const first = await activatedSessionWithAgenda();
    const second = await activatedSessionWithAgenda();

    const firstState = readStateCookie(
      await startConnect(first.sessionObject.token),
    );
    const secondState = readStateCookie(
      await startConnect(second.sessionObject.token),
    );

    expect(firstState).not.toBe(secondState);
  });
});

describe("GET /api/v1/google-calendar/callback", () => {
  describe("Anonymous user", () => {
    test("Should return 401", async () => {
      const response = await callback({ code: "any", state: "any" });

      expect(response.status).toBe(401);
    });
  });

  describe("Authenticated user", () => {
    test("Without the 'use:agenda' feature should return 403", async () => {
      const createdUser = await orchestrator.createUser();
      const activatedUser = await orchestrator.activateUser(createdUser);
      const sessionObject = await orchestrator.createSession(activatedUser);

      const response = await callback(
        { code: "any", state: "any" },
        `session_id=${sessionObject.token}`,
      );

      expect(response.status).toBe(403);
    });

    test("Rejects a state that does not match the cookie (CSRF)", async () => {
      const { sessionObject } = await activatedSessionWithAgenda();

      const response = await callback(
        { code: "codigo-do-atacante", state: "state-do-atacante" },
        `session_id=${sessionObject.token}; google_oauth_state=state-legitimo`,
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/agenda?google=error");
    });

    test("Rejects a callback with no state cookie at all", async () => {
      const { sessionObject } = await activatedSessionWithAgenda();

      const response = await callback(
        { code: "algum-codigo", state: "algum-state" },
        `session_id=${sessionObject.token}`,
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/agenda?google=error");
    });

    test("Rejects a callback without the 'code' returned by Google", async () => {
      const { sessionObject } = await activatedSessionWithAgenda();
      const connectResponse = await startConnect(sessionObject.token);
      const state = readStateCookie(connectResponse);

      const response = await callback(
        { state },
        `session_id=${sessionObject.token}; google_oauth_state=${state}`,
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/agenda?google=error");
    });

    test("Rejects a callback without the 'state' parameter", async () => {
      const { sessionObject } = await activatedSessionWithAgenda();

      const response = await callback(
        { code: "algum-codigo" },
        `session_id=${sessionObject.token}; google_oauth_state=state-legitimo`,
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/agenda?google=error");
    });

    test("Clears the state cookie after a rejected callback", async () => {
      const { sessionObject } = await activatedSessionWithAgenda();

      const response = await callback(
        { code: "algum-codigo", state: "nao-bate" },
        `session_id=${sessionObject.token}; google_oauth_state=state-legitimo`,
      );

      const setCookie = response.headers.get("set-cookie");

      expect(setCookie).toContain("google_oauth_state=invalid");
      expect(setCookie).toContain("Max-Age=-1");
    });

    test("A rejected callback does not store any credential", async () => {
      const { user, sessionObject } = await activatedSessionWithAgenda();

      await callback(
        { code: "algum-codigo", state: "nao-bate" },
        `session_id=${sessionObject.token}; google_oauth_state=state-legitimo`,
      );

      const statusResponse = await fetch(
        "http://localhost:3000/api/v1/google-calendar",
        { headers: { Cookie: `session_id=${sessionObject.token}` } },
      );
      const statusBody = await statusResponse.json();

      expect(user.id).toBeDefined();
      expect(statusBody).toEqual({ connected: false, expires_at: null });
    });
  });
});
