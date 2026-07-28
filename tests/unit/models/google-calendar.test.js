import nodeCrypto from "node:crypto";
import database from "@/infra/database.js";
import cryptography from "@/infra/crypto.js";

jest.mock("../../../infra/database.js", () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import googleCalendar from "@/models/google-calendar.js";

const ORIGINAL_ENV = process.env;
const TEST_ENCRYPTION_KEY = nodeCrypto.randomBytes(32).toString("base64");

beforeEach(() => {
  jest.resetAllMocks();
  process.env = {
    ...ORIGINAL_ENV,
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_OAUTH_REDIRECT_URI:
      "http://localhost:3000/api/v1/google-calendar/callback",
    ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

// As credenciais ficam cifradas no banco, então as linhas simuladas
// precisam vir cifradas para exercitar o mesmo caminho do código real.
function storedCredentials({ accessToken, refreshToken, expiresAt }) {
  return {
    user_id: "user-1",
    access_token: cryptography.encrypt(accessToken),
    refresh_token: cryptography.encrypt(refreshToken),
    expires_at: expiresAt,
  };
}

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

  describe(".getCredentials()", () => {
    test("decrypts the tokens coming from the database", async () => {
      database.query.mockResolvedValueOnce({
        rows: [
          storedCredentials({
            accessToken: "access-token-puro",
            refreshToken: "refresh-token-puro",
            expiresAt: new Date(),
          }),
        ],
      });

      const credentials = await googleCalendar.getCredentials("user-1");

      expect(credentials.access_token).toBe("access-token-puro");
      expect(credentials.refresh_token).toBe("refresh-token-puro");
    });

    test("returns null when the user has no credentials", async () => {
      database.query.mockResolvedValueOnce({ rows: [] });

      await expect(googleCalendar.getCredentials("user-1")).resolves.toBeNull();
    });
  });

  describe(".saveCredentials()", () => {
    test("never sends the raw tokens to the database", async () => {
      database.query.mockResolvedValueOnce({
        rows: [
          storedCredentials({
            accessToken: "novo-access-token",
            refreshToken: "novo-refresh-token",
            expiresAt: new Date(),
          }),
        ],
      });

      await googleCalendar.saveCredentials("user-1", {
        access_token: "novo-access-token",
        refresh_token: "novo-refresh-token",
        expires_in: 3600,
      });

      const [{ values }] = database.query.mock.calls[0];
      const [, storedAccessToken, storedRefreshToken] = values;

      expect(storedAccessToken).not.toBe("novo-access-token");
      expect(storedRefreshToken).not.toBe("novo-refresh-token");
      expect(cryptography.isEncrypted(storedAccessToken)).toBe(true);
      expect(cryptography.isEncrypted(storedRefreshToken)).toBe(true);
      expect(cryptography.decrypt(storedAccessToken)).toBe("novo-access-token");
    });

    test("stores null when Google does not return a refresh token", async () => {
      database.query.mockResolvedValueOnce({
        rows: [
          storedCredentials({
            accessToken: "novo-access-token",
            refreshToken: null,
            expiresAt: new Date(),
          }),
        ],
      });

      await googleCalendar.saveCredentials("user-1", {
        access_token: "novo-access-token",
        expires_in: 3600,
      });

      const [{ values }] = database.query.mock.calls[0];

      expect(values[2]).toBeNull();
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
      database.query.mockResolvedValueOnce({
        rows: [
          storedCredentials({
            accessToken: "still-valid-token",
            refreshToken: "refresh-token",
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          }),
        ],
      });
      global.fetch = jest.fn();

      const accessToken = await googleCalendar.ensureFreshAccessToken("user-1");

      expect(accessToken).toBe("still-valid-token");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("refreshes and persists a new access token when expired", async () => {
      database.query
        .mockResolvedValueOnce({
          rows: [
            storedCredentials({
              accessToken: "expired-token",
              refreshToken: "refresh-token",
              expiresAt: new Date(Date.now() - 60 * 60 * 1000),
            }),
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            storedCredentials({
              accessToken: "brand-new-token",
              refreshToken: "refresh-token",
              expiresAt: new Date(Date.now() + 3600 * 1000),
            }),
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

    test("asks for a reconnection when expired and there is no refresh token", async () => {
      database.query.mockResolvedValueOnce({
        rows: [
          storedCredentials({
            accessToken: "expired-token",
            refreshToken: null,
            expiresAt: new Date(Date.now() - 60 * 60 * 1000),
          }),
        ],
      });
      global.fetch = jest.fn();

      await expect(
        googleCalendar.ensureFreshAccessToken("user-1"),
      ).rejects.toMatchObject({
        name: "ServiceError",
        action: "Reconecte sua conta do Google Calendar.",
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe(".fromGoogleEvent()", () => {
    test("converts a timed event into a visit", () => {
      const visit = googleCalendar.fromGoogleEvent({
        id: "evento-1",
        summary: "Visita técnica",
        description: "Cliente/Fazenda: Fazenda Santa Rita",
        start: { dateTime: "2026-08-12T09:30:00-03:00" },
        end: { dateTime: "2026-08-12T11:00:00-03:00" },
      });

      expect(visit).toEqual({
        title: "Visita técnica",
        client: "Fazenda Santa Rita",
        event_date: "2026-08-12",
        start_time: "09:30",
        end_time: "11:00",
        type: "OUTRO",
      });
    });

    test("converts an all-day event into a full-day visit", () => {
      const visit = googleCalendar.fromGoogleEvent({
        id: "evento-2",
        summary: "Feira agrícola",
        start: { date: "2026-08-20" },
        end: { date: "2026-08-21" },
      });

      expect(visit).toMatchObject({
        title: "Feira agrícola",
        event_date: "2026-08-20",
        start_time: "00:00",
        end_time: "23:59",
      });
    });

    test("falls back to a placeholder title when the event has no summary", () => {
      const visit = googleCalendar.fromGoogleEvent({
        id: "evento-3",
        start: { date: "2026-08-20" },
        end: { date: "2026-08-21" },
      });

      expect(visit.title).toBe("(Sem título)");
    });

    test("leaves client null when the description has another format", () => {
      const visit = googleCalendar.fromGoogleEvent({
        id: "evento-4",
        summary: "Reunião",
        description: "Pauta livre",
        start: { dateTime: "2026-08-12T09:00:00-03:00" },
        end: { dateTime: "2026-08-12T10:00:00-03:00" },
      });

      expect(visit.client).toBeNull();
    });

    test("truncates title and client to the 150 characters the column accepts", () => {
      const visit = googleCalendar.fromGoogleEvent({
        id: "evento-5",
        summary: "t".repeat(200),
        description: `Cliente/Fazenda: ${"c".repeat(200)}`,
        start: { dateTime: "2026-08-12T09:00:00-03:00" },
        end: { dateTime: "2026-08-12T10:00:00-03:00" },
      });

      expect(visit.title).toHaveLength(150);
      expect(visit.client).toHaveLength(150);
    });

    test("is the inverse of the event created by the AgrDrive itself", () => {
      const originalVisit = {
        title: "Monitoramento de pragas",
        client: "Fazenda Boa Vista",
        event_date: "2026-09-01",
        start_time: "14:00",
        end_time: "15:30",
      };

      const roundTripped = googleCalendar.fromGoogleEvent({
        id: "evento-6",
        summary: originalVisit.title,
        description: `Cliente/Fazenda: ${originalVisit.client}`,
        start: { dateTime: `${originalVisit.event_date}T14:00:00-03:00` },
        end: { dateTime: `${originalVisit.event_date}T15:30:00-03:00` },
      });

      expect(roundTripped).toMatchObject(originalVisit);
    });
  });
});
