import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "@/infra/controller.js";
import validator from "@/infra/validator.js";
import visit from "@/models/visit.js";
import googleCalendar from "@/models/google-calendar.js";
import { ForbiddenError, ServiceError } from "@/infra/errors.js";

const timeSchema = z
  .string("O horário deve ser um texto.")
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "O horário deve estar no formato HH:MM.");

const updateVisitSchema = z
  .object({
    title: z
      .string("O título deve ser um texto.")
      .trim()
      .min(1, "O título é obrigatório.")
      .max(150, "O título deve ter no máximo 150 caracteres."),
    client: z
      .string("O cliente/fazenda deve ser um texto.")
      .trim()
      .max(150, "O cliente/fazenda deve ter no máximo 150 caracteres.")
      .nullable(),
    event_date: z.iso.date("A data deve estar no formato AAAA-MM-DD."),
    start_time: timeSchema,
    end_time: timeSchema,
    type: z.enum([
      "MONITORAMENTO",
      "APLICACAO",
      "COMERCIAL",
      "PROSPECCAO",
      "COLETA",
      "OUTRO",
    ]),
    sync: z.boolean(),
  })
  .partial()
  .strict("Campos não permitidos foram enviados na requisição.")
  .refine((data) => Object.keys(data).length > 0, {
    message: "Pelo menos um campo deve ser fornecido para atualização.",
  });

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .use(controller.canRequest("use:agenda"))
  .get(getHandler)
  .patch(patchHandler)
  .delete(deleteHandler)
  .handler(controller.errorHandlers);

async function getHandler(request, response) {
  const userTryingToGet = request.context.user;
  const visitId = validator.validate(
    validator.uuidSchema,
    request.query.visit_id,
  );

  const visitFound = await visit.findOneById(visitId);
  ensureOwnership(visitFound, userTryingToGet, "visualizar");

  return response.status(200).json(visitFound);
}

async function patchHandler(request, response) {
  const userTryingToPatch = request.context.user;
  const visitId = validator.validate(
    validator.uuidSchema,
    request.query.visit_id,
  );

  const { sync, ...visitInputValues } = validator.validate(
    updateVisitSchema,
    request.body,
  );

  const visitFound = await visit.findOneById(visitId);
  ensureOwnership(visitFound, userTryingToPatch, "atualizar");

  let updatedVisit = await visit.update(visitId, visitInputValues);
  const desiredSync = sync ?? updatedVisit.synced;

  updatedVisit = await syncVisitWithGoogle(
    userTryingToPatch.id,
    updatedVisit,
    desiredSync,
  );

  return response.status(200).json(updatedVisit);
}

async function deleteHandler(request, response) {
  const userTryingToDelete = request.context.user;
  const visitId = validator.validate(
    validator.uuidSchema,
    request.query.visit_id,
  );

  const visitFound = await visit.findOneById(visitId);
  ensureOwnership(visitFound, userTryingToDelete, "excluir");

  if (visitFound.synced && visitFound.google_event_id) {
    await googleCalendar
      .deleteEvent(userTryingToDelete.id, visitFound.google_event_id)
      .catch((error) => {
        if (!(error instanceof ServiceError)) throw error;
      });
  }

  const removedVisit = await visit.remove(visitId);
  return response.status(200).json(removedVisit);
}

function ensureOwnership(visitFound, user, action) {
  if (visitFound.created_by !== user.id) {
    throw new ForbiddenError({
      message: "Você não tem acesso a esta visita.",
      action: `Somente o criador pode ${action} a visita.`,
    });
  }
}

async function syncVisitWithGoogle(userId, currentVisit, desiredSync) {
  try {
    if (desiredSync && !currentVisit.google_event_id) {
      const googleEvent = await googleCalendar.createEvent(
        userId,
        currentVisit,
      );
      return visit.update(currentVisit.id, {
        synced: true,
        google_event_id: googleEvent.id,
      });
    }

    if (desiredSync && currentVisit.google_event_id) {
      await googleCalendar.updateEvent(
        userId,
        currentVisit.google_event_id,
        currentVisit,
      );
      return visit.update(currentVisit.id, { synced: true });
    }

    if (!desiredSync && currentVisit.google_event_id) {
      await googleCalendar.deleteEvent(userId, currentVisit.google_event_id);
      return visit.update(currentVisit.id, {
        synced: false,
        google_event_id: null,
      });
    }
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
    // Melhor esforço: mantém a visita salva localmente mesmo se a
    // sincronização com o Google Calendar falhar.
  }

  return currentVisit;
}
