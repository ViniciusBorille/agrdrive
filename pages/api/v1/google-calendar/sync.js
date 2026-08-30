import { createRouter } from "next-connect";
import controller from "@/infra/controller.js";
import visit from "@/models/visit.js";
import googleCalendar from "@/models/google-calendar.js";
import { ServiceError } from "@/infra/errors.js";

const IMPORT_WINDOW_PAST_DAYS = 30;
const IMPORT_WINDOW_FUTURE_DAYS = 180;
const DAY_IN_MILISECONDS = 24 * 60 * 60 * 1000;

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .use(controller.canRequest("use:agenda"))
  .post(postHandler)
  .handler(controller.errorHandlers);

async function postHandler(request, response) {
  const userTryingToSync = request.context.user;

  const syncedCount = await pushPendingVisits(userTryingToSync);

  const syncWindow = buildSyncWindow();
  const googleEvents = await listEventsInWindow(userTryingToSync, syncWindow);

  const importedCount = googleEvents
    ? await pullNewGoogleEvents(userTryingToSync, googleEvents)
    : 0;
  const removedCount = googleEvents
    ? await pruneDeletedGoogleEvents(userTryingToSync, googleEvents, syncWindow)
    : 0;

  const visitsAfterSync = await visit.findAll({ userId: userTryingToSync.id });
  const pendingCount = visitsAfterSync.filter((v) => !v.synced).length;

  return response.status(200).json({
    synced: syncedCount,
    imported: importedCount,
    removed: removedCount,
    pending: pendingCount,
  });
}

// A mesma janela serve para os dois lados: `timeMin`/`timeMax` no formato
// que a API do Google espera e `from`/`to` como data pura para filtrar as
// visitas locais que serão confrontadas com ela.
function buildSyncWindow() {
  const now = Date.now();
  const start = new Date(now - IMPORT_WINDOW_PAST_DAYS * DAY_IN_MILISECONDS);
  const end = new Date(now + IMPORT_WINDOW_FUTURE_DAYS * DAY_IN_MILISECONDS);

  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

// Devolve `null` (e não uma lista vazia) quando não deu para falar com o
// Google: uma lista vazia significaria "a agenda está vazia" e faria o
// passo de remoção apagar tudo que existe localmente.
async function listEventsInWindow(user, { timeMin, timeMax }) {
  try {
    return await googleCalendar.listEvents(user.id, { timeMin, timeMax });
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
    return null;
  }
}

// AgrDrive -> Google Calendar: cria no Google as visitas locais que
// ainda não foram sincronizadas.
async function pushPendingVisits(user) {
  const visits = await visit.findAll({ userId: user.id });
  const pendingVisits = visits.filter((v) => !v.synced);

  let syncedCount = 0;
  for (const pendingVisit of pendingVisits) {
    try {
      const googleEvent = await googleCalendar.createEvent(
        user.id,
        pendingVisit,
      );
      await visit.update(pendingVisit.id, {
        synced: true,
        google_event_id: googleEvent.id,
      });
      syncedCount++;
    } catch (error) {
      if (!(error instanceof ServiceError)) throw error;
      // Melhor esforço: segue tentando sincronizar as demais visitas.
    }
  }
  return syncedCount;
}

// Google Calendar -> AgrDrive: traz como visitas os eventos criados
// direto no Google que ainda não têm uma visita local correspondente.
async function pullNewGoogleEvents(user, googleEvents) {
  const visits = await visit.findAll({ userId: user.id });
  const knownGoogleEventIds = new Set(
    visits.filter((v) => v.google_event_id).map((v) => v.google_event_id),
  );

  let importedCount = 0;
  for (const googleEvent of googleEvents) {
    if (googleEvent.status === "cancelled") continue;
    if (knownGoogleEventIds.has(googleEvent.id)) continue;

    const newVisit = await visit.create({
      ...googleCalendar.fromGoogleEvent(googleEvent),
      created_by: user.id,
    });
    await visit.update(newVisit.id, {
      synced: true,
      google_event_id: googleEvent.id,
    });
    importedCount++;
  }
  return importedCount;
}

// Google Calendar -> AgrDrive: apagar o evento no Google apaga a visita
// aqui. Só olhamos as visitas dentro da janela sincronizada, e sumir da
// listagem não basta como prova — um evento movido para fora da janela
// também some dela. Por isso cada candidata é confirmada evento a evento
// antes de ser removida.
async function pruneDeletedGoogleEvents(user, googleEvents, { from, to }) {
  const liveGoogleEventIds = new Set(googleEvents.map((event) => event.id));
  const visitsInWindow = await visit.findAll({ userId: user.id, from, to });

  let removedCount = 0;
  for (const visitInWindow of visitsInWindow) {
    if (!visitInWindow.google_event_id) continue;
    if (liveGoogleEventIds.has(visitInWindow.google_event_id)) continue;

    try {
      const googleEvent = await googleCalendar.getEvent(
        user.id,
        visitInWindow.google_event_id,
      );
      if (googleEvent && googleEvent.status !== "cancelled") continue;
    } catch (error) {
      if (!(error instanceof ServiceError)) throw error;
      // Melhor esforço: sem confirmação, a visita local é preservada.
      continue;
    }

    await visit.remove(visitInWindow.id);
    removedCount++;
  }
  return removedCount;
}
