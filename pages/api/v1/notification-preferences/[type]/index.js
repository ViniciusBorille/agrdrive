import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "@/infra/controller.js";
import validator from "@/infra/validator.js";
import notificationPreference from "@/models/notification-preference.js";
import {
  IMMEDIATE,
  canUserReceive,
  findNotificationType,
} from "@/models/notification-catalog.js";
import { ForbiddenError, NotFoundError } from "@/infra/errors.js";

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .put(putHandler)
  .handler(controller.errorHandlers);

const timeSchema = z
  .string("O horário deve ser um texto.")
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "O horário deve estar no formato HH:MM.");

// Minutos são a unidade da API, mas ninguém lê "43200" como "30 dias".
// A mensagem de erro precisa falar a língua de quem preencheu a tela.
function humanize(minutes) {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "1 dia" : `${days} dias`;
  }

  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hora" : `${hours} horas`;
  }

  return `${minutes} minutos`;
}

// O schema sai do catálogo em vez de ser escrito à mão por tipo: mudar um
// limite lá passa a valer aqui sem ninguém lembrar de vir editar.
function buildSchema(definition) {
  if (definition.schedule === IMMEDIATE) {
    return z
      .object({
        enabled: z.boolean("O campo 'enabled' deve ser verdadeiro ou falso."),
        send_at_time: timeSchema.optional(),
        reminders: z
          .array(z.number())
          .max(0, "Este aviso é imediato e não aceita antecedências.")
          .optional(),
      })
      .strict("Campos não permitidos foram enviados na requisição.");
  }

  return (
    z
      .object({
        enabled: z.boolean("O campo 'enabled' deve ser verdadeiro ou falso."),
        send_at_time: timeSchema,
        reminders: z
          .array(
            z
              .number("A antecedência deve ser um número de minutos.")
              .int("A antecedência deve ser um número inteiro de minutos.")
              .min(
                definition.minOffsetMinutes,
                `A antecedência mínima é de ${humanize(definition.minOffsetMinutes)}.`,
              )
              .max(
                definition.maxOffsetMinutes,
                `A antecedência máxima é de ${humanize(definition.maxOffsetMinutes)}.`,
              ),
            "A lista de antecedências deve ser uma lista de números.",
          )
          .max(
            definition.maxReminders,
            `São permitidos no máximo ${definition.maxReminders} avisos por tipo.`,
          ),
      })
      .strict("Campos não permitidos foram enviados na requisição.")
      .refine(
        (data) => new Set(data.reminders).size === data.reminders.length,
        "Há antecedências repetidas: cada aviso precisa de um horário diferente.",
      )
      // Ligado e sem nenhuma antecedência seria um aviso que nunca dispara —
      // o usuário acharia que configurou e não receberia nada. Para não
      // receber, o caminho é desligar.
      .refine(
        (data) => !data.enabled || data.reminders.length > 0,
        "Escolha pelo menos um aviso ou desligue este tipo de notificação.",
      )
  );
}

async function putHandler(request, response) {
  const userTryingToPut = request.context.user;
  const type = request.query.type;

  const definition = findNotificationType(type);

  if (!definition) {
    throw new NotFoundError({
      message: "Este tipo de notificação não existe.",
      action: "Consulte GET /api/v1/notification-preferences.",
    });
  }

  if (!canUserReceive(userTryingToPut, type)) {
    throw new ForbiddenError({
      message: "Você não tem acesso ao módulo deste tipo de notificação.",
      action: `Verifique se o seu usuário possui a feature "${definition.feature}".`,
    });
  }

  const inputValues = validator.validate(buildSchema(definition), request.body);

  const saved = await notificationPreference.replace(userTryingToPut.id, type, {
    enabled: inputValues.enabled,
    send_at_time: inputValues.send_at_time ?? "08:00",
    reminders: inputValues.reminders ?? [],
  });

  return response.status(200).json(saved);
}
