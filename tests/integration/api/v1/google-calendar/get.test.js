import http from "node:http";
import orchestrator from "@/tests/orchestrator.js";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

async function activatedSession() {
  const createdUser = await orchestrator.createUser();
  const activatedUser = await orchestrator.activateUser(createdUser);
  const withAgenda = await orchestrator.addFeaturesToUser(activatedUser, [
    "use:agenda",
  ]);
  const sessionObject = await orchestrator.createSession(withAgenda);
  return { user: withAgenda, sessionObject };
}

// Requisição HTTP crua para inspecionar o redirect (status/Location) sem que
// o fetch siga automaticamente para o accounts.google.com real.
function getWithoutFollowingRedirects(path, cookie) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      { host: "localhost", port: 3000, path, headers: { Cookie: cookie } },
      (response) => {
        response.resume();
        resolve(response);
      },
    );
    request.on("error", reject);
  });
}

describe("GET /api/v1/google-calendar", () => {
  describe("Anonymous user", () => {
    test("Should return 401", async () => {
      const response = await fetch(
        "http:localhost:3000/api/v1/google-calendar",
      );

      expect(response.status).toBe(401);
    });
  });

  describe("Authenticated user", () => {
    test("Without the 'use:agenda' feature", async () => {
      const createdUser = await orchestrator.createUser();
      const activatedUser = await orchestrator.activateUser(createdUser);
      const sessionObject = await orchestrator.createSession(activatedUser);

      const response = await fetch(
        "http:localhost:3000/api/v1/google-calendar",
        { headers: { Cookie: `session_id=${sessionObject.token}` } },
      );

      expect(response.status).toBe(403);
    });

    test("Returns 'connected: false' for a user who never connected", async () => {
      const { sessionObject } = await activatedSession();

      const response = await fetch(
        "http:localhost:3000/api/v1/google-calendar",
        { headers: { Cookie: `session_id=${sessionObject.token}` } },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({ connected: false, expires_at: null });
    });
  });
});

describe("GET /api/v1/google-calendar/connect", () => {
  test("Anonymous user should return 401", async () => {
    const response = await fetch(
      "http:localhost:3000/api/v1/google-calendar/connect",
    );

    expect(response.status).toBe(401);
  });

  test("Redirects to Google's OAuth consent screen", async () => {
    const { sessionObject } = await activatedSession();

    const response = await getWithoutFollowingRedirects(
      "/api/v1/google-calendar/connect",
      `session_id=${sessionObject.token}`,
    );

    expect(response.statusCode).toBe(302);

    const location = response.headers.location;
    expect(location).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location).toContain("scope=");
    expect(location).toContain(
      `redirect_uri=${encodeURIComponent(process.env.GOOGLE_OAUTH_REDIRECT_URI)}`,
    );

    expect(response.headers["set-cookie"]?.[0]).toContain(
      "google_oauth_state=",
    );
  });
});

describe("POST /api/v1/google-calendar/disconnect", () => {
  test("Anonymous user should return 401", async () => {
    const response = await fetch(
      "http:localhost:3000/api/v1/google-calendar/disconnect",
      { method: "POST" },
    );

    expect(response.status).toBe(401);
  });

  test("A never-connected user can still call disconnect", async () => {
    const { sessionObject } = await activatedSession();

    const response = await fetch(
      "http:localhost:3000/api/v1/google-calendar/disconnect",
      {
        method: "POST",
        headers: { Cookie: `session_id=${sessionObject.token}` },
      },
    );

    expect(response.status).toBe(200);
  });
});

describe("POST /api/v1/google-calendar/sync", () => {
  test("Anonymous user should return 401", async () => {
    const response = await fetch(
      "http:localhost:3000/api/v1/google-calendar/sync",
      { method: "POST" },
    );

    expect(response.status).toBe(401);
  });

  test("With no pending visits returns zero synced", async () => {
    const { sessionObject } = await activatedSession();

    const response = await fetch(
      "http:localhost:3000/api/v1/google-calendar/sync",
      {
        method: "POST",
        headers: { Cookie: `session_id=${sessionObject.token}` },
      },
    );

    expect(response.status).toBe(200);

    const responseBody = await response.json();
    expect(responseBody).toEqual({ synced: 0, pending: 0 });
  });
});
