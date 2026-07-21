import database from "@/infra/database.js";

jest.mock("../../../infra/database.js", () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import googleCalendar from "@/models/google-calendar.js";

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetAllMocks();
  process.env = {
    ...ORIGINAL_ENV,
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_OAUTH_REDIRECT_URI:
      "http://localhost:3000/api/v1/google-calendar/callback",
  };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("models/google-calendar.js", () => {
  describe(".getAuthUrl()", () => {
    test("builds a consent URL with the expected query params", () => {
      const url = new URL(googleCalendar.getAuthUrl("some-state"));

      expect(url.origin + url.pathname).toBe(
        "https://accounts.google.com/o/oauth2/v2/auth",
      );
      expect(url.searchParams.get("client_id")).toBe("test-client-id");
      expect(url.searchParams.get("redirect_uri")).toBe(
        "http://localhost:3000/api/v1/google-calendar/callback",
      );
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("access_type")).toBe("offline");
      expect(url.searchParams.get("prompt")).toBe("consent");
      expect(url.searchParams.get("state")).toBe("some-state");
      expect(url.searchParams.get("scope")).toBe(
        "https://www.googleapis.com/auth/calendar.events",
      );
    });
  });

  describe(".ensureFreshAccessToken()", () => {
    test("throws ServiceError when the user has no stored credentials", async () => {
      database.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        googleCalendar.ensureFreshAccessToken("user-1"),
      ).rejects.toMatchObject({ name: "ServiceError" });
    });

    test("reuses the stored access token when it has not expired yet", async () => {
      const futureExpiry = new Date(Date.now() + 60 * 60 * 1000);
      database.query.mockResolvedValueOnce({
        rows: [
          {
            user_id: "user-1",
            access_token: "still-valid-token",
            refresh_token: "refresh-token",
            expires_at: futureExpiry,
          },
        ],
      });
      global.fetch = jest.fn();

      const accessToken = await googleCalendar.ensureFreshAccessToken("user-1");

      expect(accessToken).toBe("still-valid-token");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("refreshes and persists a new access token when expired", async () => {
      const pastExpiry = new Date(Date.now() - 60 * 60 * 1000);
      database.query
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: "user-1",
              access_token: "expired-token",
              refresh_token: "refresh-token",
              expires_at: pastExpiry,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: "user-1",
              access_token: "brand-new-token",
              refresh_token: "refresh-token",
              expires_at: new Date(Date.now() + 3600 * 1000),
            },
          ],
        });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "brand-new-token",
          expires_in: 3600,
        }),
      });

      const accessToken = await googleCalendar.ensureFreshAccessToken("user-1");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://oauth2.googleapis.com/token",
        expect.objectContaining({ method: "POST" }),
      );
      expect(accessToken).toBe("brand-new-token");
    });
  });
});
