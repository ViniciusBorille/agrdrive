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

  describe(".getEvent()", () => {
    function validCredentials() {
      database.query.mockResolvedValueOnce({
        rows: [
          storedCredentials({
            accessToken: "valid-token",
            refreshToken: "refresh-token",
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          }),
        ],
      });
    }

    test("returns the event when it still exists", async () => {
      validCredentials();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "evento-1", status: "confirmed" }),
      });

      const googleEvent = await googleCalendar.getEvent("user-1", "evento-1");

      expect(googleEvent).toMatchObject({ id: "evento-1" });
      expect(global.fetch).toHaveBeenCalledWith(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/evento-1",
        expect.objectContaining({
          headers: { Authorization: "Bearer valid-token" },
        }),
      );
    });

    test("returns null when the event was deleted", async () => {
      validCredentials();
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      });

      await expect(
        googleCalendar.getEvent("user-1", "evento-apagado"),
      ).resolves.toBeNull();
    });

    test("returns null when the event was already purged", async () => {
      validCredentials();
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 410,
        text: async () => "Gone",
      });

      await expect(
        googleCalendar.getEvent("user-1", "evento-expurgado"),
      ).resolves.toBeNull();
    });

    // Distinguir "apagado" de "não deu para saber" é o que impede a
    // sincronização de apagar visitas locais por causa de uma falha
    // temporária do Google.
    test("throws ServiceError when Google fails for another reason", async () => {
      validCredentials();
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      await expect(
        googleCalendar.getEvent("user-1", "evento-1"),
      ).rejects.toMatchObject({ name: "ServiceError" });
    });
  });

  // Esta é a única prova que autoriza apagar uma visita local, então o
  // conservadorismo dela é o que separa "sincronizar" de "perder dados".
  describe(".wasEventDeleted()", () => {
    function validCredentials() {
      database.query.mockResolvedValueOnce({
        rows: [
          storedCredentials({
            accessToken: "valid-token",
            refreshToken: "refresh-token",
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          }),
        ],
      });
    }

    test("confirma a exclusão quando o Google devolve status cancelled", async () => {
      validCredentials();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "evento-1", status: "cancelled" }),
      });

      await expect(
        googleCalendar.wasEventDeleted("user-1", "evento-1"),
      ).resolves.toBe(true);
    });

    test("não confirma quando o evento continua ativo", async () => {
      validCredentials();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "evento-1", status: "confirmed" }),
      });

      await expect(
        googleCalendar.wasEventDeleted("user-1", "evento-1"),
      ).resolves.toBe(false);
    });

    // 404/410 significam "não existe neste calendário", e é exatamente o
    // que o Google responde para os eventos da conta anterior depois de
    // reconectar com outra conta. Tratar isso como exclusão apagaria a
    // agenda inteira do usuário numa troca de conta.
    test.each([404, 410])(
      "não confirma quando o Google responde %i",
      async (status) => {
        validCredentials();
        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status,
          text: async () => "Not Found",
        });

        await expect(
          googleCalendar.wasEventDeleted("user-1", "evento-de-outra-conta"),
        ).resolves.toBe(false);
      },
    );

    test("propaga ServiceError quando o Google falha por outro motivo", async () => {
      validCredentials();
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      await expect(
        googleCalendar.wasEventDeleted("user-1", "evento-1"),
      ).rejects.toMatchObject({ name: "ServiceError" });
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

    // A API do Google sempre manda start/end, mas um evento malformado
    // não pode derrubar a sincronização inteira com um TypeError.
    test("não quebra com um evento sem start nem end", () => {
      expect(() =>
        googleCalendar.fromGoogleEvent({ id: "evento-7", summary: "Sem data" }),
      ).not.toThrow();
    });
  });

  // Daqui pra baixo, tudo depende de credenciais válidas no banco. O
  // helper injeta a linha cifrada que `ensureFreshAccessToken` espera.
  function mockValidCredentials() {
    database.query.mockResolvedValueOnce({
      rows: [
        storedCredentials({
          accessToken: "valid-token",
          refreshToken: "refresh-token",
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        }),
      ],
    });
  }

  const visitInputValues = {
    title: "Visita técnica",
    client: "Fazenda Boa Vista",
    event_date: "2026-09-01",
    start_time: "08:00",
    end_time: "09:30",
  };

  describe(".exchangeCodeForTokens()", () => {
    test("envia o code e os segredos no formato de formulário", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "novo-token" }),
      });

      const tokens = await googleCalendar.exchangeCodeForTokens("codigo-oauth");

      expect(tokens).toEqual({ access_token: "novo-token" });

      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe("https://oauth2.googleapis.com/token");
      expect(options.method).toBe("POST");

      const body = new URLSearchParams(options.body);
      expect(body.get("code")).toBe("codigo-oauth");
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("client_secret")).toBe("test-client-secret");
    });

    test("lança ServiceError quando o Google recusa o code", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        text: async () => "invalid_grant",
      });

      await expect(
        googleCalendar.exchangeCodeForTokens("codigo-expirado"),
      ).rejects.toThrow(
        expect.objectContaining({
          name: "ServiceError",
          message: "Não foi possível concluir a conexão com o Google Calendar.",
        }),
      );
    });
  });

  describe(".refreshAccessToken()", () => {
    test("troca o refresh token por um access token novo", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "token-renovado",
          expires_in: 3600,
        }),
      });

      const tokens = await googleCalendar.refreshAccessToken("refresh-token");

      expect(tokens.access_token).toBe("token-renovado");

      const body = new URLSearchParams(global.fetch.mock.calls[0][1].body);
      expect(body.get("refresh_token")).toBe("refresh-token");
      expect(body.get("grant_type")).toBe("refresh_token");
    });

    test("pede reconexão quando o refresh token foi revogado", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        text: async () => "invalid_grant",
      });

      await expect(
        googleCalendar.refreshAccessToken("refresh-revogado"),
      ).rejects.toThrow(
        expect.objectContaining({
          name: "ServiceError",
          action: "Reconecte sua conta do Google Calendar.",
        }),
      );
    });
  });

  describe(".toGoogleEvent() (via createEvent)", () => {
    test("monta o evento com fuso fixo e descrição do cliente", async () => {
      mockValidCredentials();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "evento-1" }),
      });

      await googleCalendar.createEvent("user-1", visitInputValues);

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body).toEqual({
        summary: "Visita técnica",
        description: "Cliente/Fazenda: Fazenda Boa Vista",
        start: {
          dateTime: "2026-09-01T08:00:00",
          timeZone: "America/Sao_Paulo",
        },
        end: {
          dateTime: "2026-09-01T09:30:00",
          timeZone: "America/Sao_Paulo",
        },
      });
    });

    // A coluna `time` do Postgres devolve "HH:MM:SS"; sem o corte, o
    // dateTime sairia com segundos duplicados e o Google recusaria.
    test("aceita horários que voltam do banco como HH:MM:SS", async () => {
      mockValidCredentials();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "evento-1" }),
      });

      await googleCalendar.createEvent("user-1", {
        ...visitInputValues,
        start_time: "08:00:00",
        end_time: "09:30:00",
      });

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.start.dateTime).toBe("2026-09-01T08:00:00");
      expect(body.end.dateTime).toBe("2026-09-01T09:30:00");
    });

    test("omite a descrição quando a visita não tem cliente", async () => {
      mockValidCredentials();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "evento-1" }),
      });

      await googleCalendar.createEvent("user-1", {
        ...visitInputValues,
        client: null,
      });

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body).not.toHaveProperty("description");
    });
  });

  describe(".createEvent()", () => {
    test("devolve o evento criado pelo Google", async () => {
      mockValidCredentials();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "evento-novo" }),
      });

      const googleEvent = await googleCalendar.createEvent(
        "user-1",
        visitInputValues,
      );

      expect(googleEvent).toEqual({ id: "evento-novo" });
      expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe(
        "Bearer valid-token",
      );
    });

    test("lança ServiceError quando o Google recusa a criação", async () => {
      mockValidCredentials();
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, text: async () => "quota exceeded" });

      await expect(
        googleCalendar.createEvent("user-1", visitInputValues),
      ).rejects.toThrow(
        expect.objectContaining({
          message: "Não foi possível criar o evento no Google Calendar.",
        }),
      );
    });
  });

  describe(".updateEvent()", () => {
    test("faz PATCH no evento informado", async () => {
      mockValidCredentials();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "evento-1" }),
      });

      await googleCalendar.updateEvent("user-1", "evento-1", visitInputValues);

      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/evento-1",
      );
      expect(options.method).toBe("PATCH");
    });

    test("lança ServiceError quando o Google recusa a atualização", async () => {
      mockValidCredentials();
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, text: async () => "not found" });

      await expect(
        googleCalendar.updateEvent("user-1", "evento-1", visitInputValues),
      ).rejects.toThrow(
        expect.objectContaining({
          message: "Não foi possível atualizar o evento no Google Calendar.",
        }),
      );
    });
  });

  describe(".listEvents()", () => {
    test("expande recorrências e ordena por início", async () => {
      mockValidCredentials();
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });

      await googleCalendar.listEvents("user-1");

      const url = new URL(global.fetch.mock.calls[0][0]);
      // `singleEvents` transforma série recorrente em ocorrências, que é
      // o que vira visita individual no AgrDrive.
      expect(url.searchParams.get("singleEvents")).toBe("true");
      expect(url.searchParams.get("orderBy")).toBe("startTime");
      expect(url.searchParams.has("timeMin")).toBe(false);
      expect(url.searchParams.has("timeMax")).toBe(false);
    });

    test("repassa a janela quando timeMin e timeMax são informados", async () => {
      mockValidCredentials();
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });

      await googleCalendar.listEvents("user-1", {
        timeMin: "2026-08-01T00:00:00.000Z",
        timeMax: "2026-09-01T00:00:00.000Z",
      });

      const url = new URL(global.fetch.mock.calls[0][0]);
      expect(url.searchParams.get("timeMin")).toBe("2026-08-01T00:00:00.000Z");
      expect(url.searchParams.get("timeMax")).toBe("2026-09-01T00:00:00.000Z");
    });

    test("devolve os eventos retornados pelo Google", async () => {
      mockValidCredentials();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [{ id: "evento-1" }, { id: "evento-2" }] }),
      });

      const events = await googleCalendar.listEvents("user-1");

      expect(events).toHaveLength(2);
    });

    // Uma agenda vazia devolve a resposta sem a chave `items`. Sem o
    // fallback, quem consome receberia `undefined` e quebraria no laço.
    test("devolve lista vazia quando a resposta não traz items", async () => {
      mockValidCredentials();
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({}) });

      await expect(googleCalendar.listEvents("user-1")).resolves.toEqual([]);
    });

    test("lança ServiceError quando o Google recusa a listagem", async () => {
      mockValidCredentials();
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, text: async () => "rate limited" });

      await expect(googleCalendar.listEvents("user-1")).rejects.toThrow(
        expect.objectContaining({
          message: "Não foi possível buscar os eventos do Google Calendar.",
        }),
      );
    });
  });

  describe(".deleteEvent()", () => {
    test("faz DELETE no evento informado", async () => {
      mockValidCredentials();
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });

      await googleCalendar.deleteEvent("user-1", "evento-1");

      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/evento-1",
      );
      expect(options.method).toBe("DELETE");
    });

    // Apagar algo que já não existe é o resultado desejado, não um erro.
    test.each([404, 410])("trata %i como sucesso", async (status) => {
      mockValidCredentials();
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status, text: async () => "gone" });

      await expect(
        googleCalendar.deleteEvent("user-1", "evento-1"),
      ).resolves.toBeUndefined();
    });

    test("lança ServiceError nos demais erros", async () => {
      mockValidCredentials();
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "internal",
      });

      await expect(
        googleCalendar.deleteEvent("user-1", "evento-1"),
      ).rejects.toThrow(
        expect.objectContaining({
          message: "Não foi possível remover o evento no Google Calendar.",
        }),
      );
    });
  });

  describe(".revokeAccess()", () => {
    test("revoga no Google e apaga as credenciais locais", async () => {
      mockValidCredentials();
      database.query.mockResolvedValueOnce({ rows: [] });
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      await googleCalendar.revokeAccess("user-1");

      const body = new URLSearchParams(global.fetch.mock.calls[0][1].body);
      expect(body.get("token")).toBe("valid-token");

      const deleteQuery = database.query.mock.calls.at(-1)[0];
      expect(deleteQuery.text).toContain(
        "DELETE FROM google_calendar_credentials",
      );
      expect(deleteQuery.values).toEqual(["user-1"]);
    });

    // Desconectar não pode depender do Google estar no ar: o usuário
    // ficaria preso a uma conta que não consegue remover.
    test("apaga as credenciais mesmo se a revogação falhar", async () => {
      mockValidCredentials();
      database.query.mockResolvedValueOnce({ rows: [] });
      global.fetch = jest.fn().mockRejectedValue(new Error("rede fora"));

      await expect(
        googleCalendar.revokeAccess("user-1"),
      ).resolves.toBeUndefined();

      expect(database.query.mock.calls.at(-1)[0].text).toContain(
        "DELETE FROM google_calendar_credentials",
      );
    });

    test("apaga as credenciais sem chamar o Google quando não há conexão", async () => {
      database.query.mockResolvedValueOnce({ rows: [] });
      database.query.mockResolvedValueOnce({ rows: [] });
      global.fetch = jest.fn();

      await googleCalendar.revokeAccess("user-1");

      expect(global.fetch).not.toHaveBeenCalled();
      expect(database.query.mock.calls.at(-1)[0].text).toContain(
        "DELETE FROM google_calendar_credentials",
      );
    });
  });
});
