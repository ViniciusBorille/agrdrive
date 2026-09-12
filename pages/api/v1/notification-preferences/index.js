import { createRouter } from "next-connect";
import controller from "@/infra/controller.js";
import notificationPreference from "@/models/notification-preference.js";
import { listNotificationTypesForUser } from "@/models/notification-catalog.js";

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .get(getHandler)
  .handler(controller.errorHandlers);

// Devolve o catálogo já cruzado com o que o usuário tem gravado. A tela
// consome uma fonte só: juntar catálogo e preferências no cliente daria a
// ele a chance de discordar do servidor sobre os limites.
async function getHandler(request, response) {
  const userTryingToGet = request.context.user;

  const saved = await notificationPreference.findAllByUserId(
    userTryingToGet.id,
  );
  const savedByType = new Map(
    saved.map((preference) => [preference.type, preference]),
  );

  const body = listNotificationTypesForUser(userTryingToGet).map(
    (definition) => {
      // Quem nunca configurou recebe o padrão do catálogo, sem precisar de
      // uma escrita antes.
      const current =
        savedByType.get(definition.type) ??
        notificationPreference.defaultsFor(definition.type);

      return {
        type: definition.type,
        label: definition.label,
        description: definition.description,
        schedule: definition.schedule,
        enabled: current.enabled,
        send_at_time: current.send_at_time,
        reminders: current.reminders,
        limits: {
          max_reminders: definition.maxReminders,
          min_offset_minutes: definition.minOffsetMinutes,
          max_offset_minutes: definition.maxOffsetMinutes,
        },
      };
    },
  );

  return response.status(200).json(body);
}
