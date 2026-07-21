import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "@/infra/controller.js";
import validator from "@/infra/validator.js";
import visit from "@/models/visit.js";
import googleCalendar from "@/models/google-calendar.js";
import { ServiceError } from "@/infra/errors.js";

const timeSchema = z
  .string("O horário deve ser um texto.")
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "O horário deve estar no formato HH:MM.");

const createVisitSchema = z
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
      .optional(),
    event_date: z.iso.date("A data deve estar no formato AAAA-MM-DD."),
    start_time: timeSchema,
    end_time: timeSchema,
    type: z
      .enum([
        "MONITORAMENTO",
        "APLICACAO",
        "COMERCIAL",
        "PROSPECCAO",
        "COLETA",
        "OUTRO",
      ])
      .optional(),
    sync: z.boolean().optional(),
  })
  .strict("Campos não permitidos foram enviados na requisição.");

const rangeQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .use(controller.canRequest("use:agenda"))
  .post(postHandler)
  .get(getHandler)
  .handler(controller.errorHandlers);

async function postHandler(request, response) {
  const userTryingToPost = request.context.user;

  const { sync, ...visitInputValues } = validator.validate(
    createVisitSchema,
    request.body,
  );

  let newVisit = await visit.create({
    ...visitInputValues,
    created_by: userTryingToPost.id,
  });

  if (sync) {
    try {
      const googleEvent = await googleCalendar.createEvent(
        userTryingToPost.id,
        visitInputValues,
      );
      newVisit = await visit.update(newVisit.id, {
        synced: true,
        google_event_id: googleEvent.id,
      });
    } catch (error) {
      if (!(error instanceof ServiceError)) throw error;
      // Melhor esforço: a visita fica salva localmente mesmo se a
      // sincronização com o Google Calendar falhar.
    }
  }

  return response.status(201).json(newVisit);
}

async function getHandler(request, response) {
  const userTryingToGet = request.context.user;

  const { from, to } = validator.validate(rangeQuerySchema, request.query);

  const visits = await visit.findAll({ userId: userTryingToGet.id, from, to });

  return response.status(200).json(visits);
}
