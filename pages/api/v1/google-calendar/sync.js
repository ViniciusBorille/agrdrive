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
  const importedCount = await pullNewGoogleEvents(userTryingToSync);

  const visitsAfterSync = await visit.findAll({ userId: userTryingToSync.id });
  const pendingCount = visitsAfterSync.filter((v) => !v.synced).length;

  return response.status(200).json({
    synced: syncedCount,
    imported: importedCount,
    pending: pendingCount,
  });
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
async function pullNewGoogleEvents(user) {
  const visits = await visit.findAll({ userId: user.id });
  const knownGoogleEventIds = new Set(
    visits.filter((v) => v.google_event_id).map((v) => v.google_event_id),
  );

  const now = Date.now();
  const timeMin = new Date(
    now - IMPORT_WINDOW_PAST_DAYS * DAY_IN_MILISECONDS,
  ).toISOString();
  const timeMax = new Date(
    now + IMPORT_WINDOW_FUTURE_DAYS * DAY_IN_MILISECONDS,
  ).toISOString();

  let googleEvents;
  try {
    googleEvents = await googleCalendar.listEvents(user.id, {
      timeMin,
      timeMax,
    });
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
    return 0;
  }

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
