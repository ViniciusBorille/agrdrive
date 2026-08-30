import database from "@/infra/database.js";
import cryptography from "@/infra/crypto.js";
import { ServiceError } from "@/infra/errors.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new ServiceError({
      message: "Não foi possível concluir a conexão com o Google Calendar.",
      action: "Tente conectar novamente.",
      cause: await response.text(),
    });
  }

  return response.json();
}

async function refreshAccessToken(refreshToken) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new ServiceError({
      message: "Não foi possível renovar o acesso ao Google Calendar.",
      action: "Reconecte sua conta do Google Calendar.",
      cause: await response.text(),
    });
  }

  return response.json();
}

// Os tokens ficam cifrados em repouso: um dump do banco não pode ser
// usado para acessar o Google Calendar de ninguém. Toda linha que sai
// do banco passa por aqui antes de chegar em quem chamou.
function decryptRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    access_token: cryptography.decrypt(row.access_token),
    refresh_token: cryptography.decrypt(row.refresh_token),
  };
}

async function getCredentials(userId) {
  const results = await database.query({
    text: `SELECT * FROM google_calendar_credentials WHERE user_id = $1 LIMIT 1;`,
    values: [userId],
  });

  return decryptRow(results.rows[0] ?? null);
}

async function saveCredentials(userId, tokens) {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  const results = await database.query({
    text: `
      INSERT INTO
        google_calendar_credentials (user_id, access_token, refresh_token, expires_at)
      VALUES
        ($1, $2, $3, $4)
      ON CONFLICT (user_id) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, google_calendar_credentials.refresh_token),
        expires_at = EXCLUDED.expires_at,
        updated_at = timezone('utc', now())
      RETURNING
        *
    ;`,
    values: [
      userId,
      cryptography.encrypt(tokens.access_token),
      cryptography.encrypt(tokens.refresh_token ?? null),
      expiresAt,
    ],
  });

  return decryptRow(results.rows[0]);
}

async function deleteCredentials(userId) {
  await database.query({
    text: `DELETE FROM google_calendar_credentials WHERE user_id = $1;`,
    values: [userId],
  });
}

async function ensureFreshAccessToken(userId) {
  const credentials = await getCredentials(userId);

  if (!credentials) {
    throw new ServiceError({
      message: "Usuário não possui o Google Calendar conectado.",
      action: "Conecte sua conta do Google Calendar antes de sincronizar.",
    });
  }

  if (new Date(credentials.expires_at).getTime() > Date.now()) {
    return credentials.access_token;
  }

  // O Google só devolve `refresh_token` no primeiro consentimento. Sem
  // ele não há como renovar: o usuário precisa autorizar de novo.
  if (!credentials.refresh_token) {
    throw new ServiceError({
      message: "O acesso ao Google Calendar expirou.",
      action: "Reconecte sua conta do Google Calendar.",
      cause: "Credencial sem `refresh_token` armazenado.",
    });
  }

  const refreshedTokens = await refreshAccessToken(credentials.refresh_token);
  const updatedCredentials = await saveCredentials(userId, {
    access_token: refreshedTokens.access_token,
    refresh_token: credentials.refresh_token,
    expires_in: refreshedTokens.expires_in,
  });

  return updatedCredentials.access_token;
}

const EVENT_TIME_ZONE = "America/Sao_Paulo";

function toGoogleEvent(visitInputValues) {
  // `start_time`/`end_time` vêm como "HH:MM" no cadastro, mas como
  // "HH:MM:SS" quando lidos de volta da coluna `time` do Postgres (ex:
  // reenvio pelo endpoint de sync). Truncar garante "HH:MM" nos dois casos.
  const startTime = visitInputValues.start_time.slice(0, 5);
  const endTime = visitInputValues.end_time.slice(0, 5);

  return {
    summary: visitInputValues.title,
    description: visitInputValues.client
      ? `Cliente/Fazenda: ${visitInputValues.client}`
      : undefined,
    start: {
      dateTime: `${visitInputValues.event_date}T${startTime}:00`,
      timeZone: EVENT_TIME_ZONE,
    },
    end: {
      dateTime: `${visitInputValues.event_date}T${endTime}:00`,
      timeZone: EVENT_TIME_ZONE,
    },
  };
}

async function createEvent(userId, visitInputValues) {
  const accessToken = await ensureFreshAccessToken(userId);

  const response = await fetch(EVENTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(toGoogleEvent(visitInputValues)),
  });

  if (!response.ok) {
    throw new ServiceError({
      message: "Não foi possível criar o evento no Google Calendar.",
      action: "Tente sincronizar novamente.",
      cause: await response.text(),
    });
  }

  return response.json();
}

async function updateEvent(userId, googleEventId, visitInputValues) {
  const accessToken = await ensureFreshAccessToken(userId);

  const response = await fetch(`${EVENTS_URL}/${googleEventId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(toGoogleEvent(visitInputValues)),
  });

  if (!response.ok) {
    throw new ServiceError({
      message: "Não foi possível atualizar o evento no Google Calendar.",
      action: "Tente sincronizar novamente.",
      cause: await response.text(),
    });
  }

  return response.json();
}

async function listEvents(userId, { timeMin, timeMax } = {}) {
  const accessToken = await ensureFreshAccessToken(userId);

  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
  });
  if (timeMin) params.set("timeMin", timeMin);
  if (timeMax) params.set("timeMax", timeMax);

  const response = await fetch(`${EVENTS_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new ServiceError({
      message: "Não foi possível buscar os eventos do Google Calendar.",
      action: "Tente sincronizar novamente.",
      cause: await response.text(),
    });
  }

  const { items } = await response.json();
  return items ?? [];
}

const CLIENT_DESCRIPTION_PREFIX = "Cliente/Fazenda: ";

// Inverso de `toGoogleEvent`: usado para trazer pro AgrDrive eventos
// criados diretamente no Google Calendar. Eventos de dia inteiro (só
// `date`, sem `dateTime`) viram uma visita com horário padrão 00:00–23:59.
function fromGoogleEvent(googleEvent) {
  const start = googleEvent.start ?? {};
  const end = googleEvent.end ?? {};
  const isAllDay = !start.dateTime;

  const client = googleEvent.description?.startsWith(CLIENT_DESCRIPTION_PREFIX)
    ? googleEvent.description.slice(CLIENT_DESCRIPTION_PREFIX.length)
    : null;

  return {
    title: (googleEvent.summary || "(Sem título)").slice(0, 150),
    client: client ? client.slice(0, 150) : null,
    event_date: isAllDay ? start.date : start.dateTime.slice(0, 10),
    start_time: isAllDay ? "00:00" : start.dateTime.slice(11, 16),
    end_time: isAllDay ? "23:59" : end.dateTime.slice(11, 16),
    type: "OUTRO",
  };
}

// Devolve `null` quando o evento não existe mais no Google (apagado ou
// já expurgado da lixeira). Eventos apagados que ainda estão na lixeira
// respondem 200 com `status: "cancelled"` — quem chama precisa olhar os
// dois casos.
async function getEvent(userId, googleEventId) {
  const accessToken = await ensureFreshAccessToken(userId);

  const response = await fetch(`${EVENTS_URL}/${googleEventId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 404 || response.status === 410) {
    return null;
  }

  if (!response.ok) {
    throw new ServiceError({
      message: "Não foi possível consultar o evento no Google Calendar.",
      action: "Tente sincronizar novamente.",
      cause: await response.text(),
    });
  }

  return response.json();
}

// Só o `cancelled` explícito prova que o evento existiu neste calendário
// e foi apagado. Um 404 diz apenas "não existe aqui", o que também
// acontece quando o evento pertence ao calendário de outra conta Google:
// como `saveCredentials` é um upsert por usuário, basta reconectar com
// outra conta para que todos os ids antigos passem a responder 404. Se
// isso contasse como exclusão, uma troca de conta apagaria a agenda
// inteira. O preço de ser conservador é não remover eventos que o Google
// já expurgou da lixeira — a visita fica, que é a falha segura.
async function wasEventDeleted(userId, googleEventId) {
  const googleEvent = await getEvent(userId, googleEventId);

  return googleEvent?.status === "cancelled";
}

async function deleteEvent(userId, googleEventId) {
  const accessToken = await ensureFreshAccessToken(userId);

  const response = await fetch(`${EVENTS_URL}/${googleEventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new ServiceError({
      message: "Não foi possível remover o evento no Google Calendar.",
      action: "Tente sincronizar novamente.",
      cause: await response.text(),
    });
  }
}

async function revokeAccess(userId) {
  const credentials = await getCredentials(userId);

  if (credentials) {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: credentials.access_token }),
    }).catch(() => {
      // melhor esforço: se a revogação no Google falhar, ainda assim
      // removemos as credenciais localmente para desconectar o usuário.
    });
  }

  await deleteCredentials(userId);
}

const googleCalendar = {
  getAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getCredentials,
  saveCredentials,
  deleteCredentials,
  ensureFreshAccessToken,
  createEvent,
  updateEvent,
  getEvent,
  wasEventDeleted,
  deleteEvent,
  listEvents,
  fromGoogleEvent,
  revokeAccess,
};

export default googleCalendar;
