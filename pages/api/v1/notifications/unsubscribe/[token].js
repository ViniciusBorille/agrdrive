import { createRouter } from "next-connect";
import controller from "@/infra/controller.js";
import notificationUnsubscribe from "@/models/notification-unsubscribe.js";
import { findNotificationType } from "@/models/notification-catalog.js";
import { ValidationError } from "@/infra/errors.js";

// Descadastro sem sessão. Quem está incomodado com o e-mail não vai
// lembrar a senha para pedir para parar de receber — exigir login aqui é o
// mesmo que não oferecer saída, e a saída que sobra é o botão de spam.
//
// A autorização é a posse do token, como na recuperação de senha: o link
// só chega a quem tem acesso à caixa de entrada do usuário.
export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:unsubscribe_token"), getHandler)
  .post(controller.canRequest("read:unsubscribe_token"), postHandler)
  .handler(controller.errorHandlers);

function describe(type) {
  const definition = findNotificationType(type);

  return {
    type,
    label: definition?.label ?? type,
    description: definition?.description ?? null,
  };
}

// Só lê. Cliente de e-mail pré-carrega link, e um GET que desligasse
// notificação seria disparado sem o usuário ter clicado em nada.
async function getHandler(request, response) {
  const unsubscribeToken = await notificationUnsubscribe.findOneValidByToken(
    request.query.token,
  );

  return response.status(200).json({
    username: unsubscribeToken.username,
    // Os tipos que estavam naquele e-mail, para oferecer "desligar só
    // este"; e o catálogo inteiro, para o "desligar todos".
    types: unsubscribeToken.types.map(describe),
    all_types: notificationUnsubscribe.allTypes().map(describe),
  });
}

// Aplica. Atende tanto o botão da página quanto o `One-Click` do RFC 8058,
// que os provedores disparam como POST — sem `type`, desliga tudo, que é o
// que "cancelar inscrição" significa no botão nativo do Gmail.
//
// O corpo não passa por schema estrito de propósito: o provedor manda
// `List-Unsubscribe=One-Click` e recusar esse campo transformaria o botão
// nativo em erro.
async function postHandler(request, response) {
  const requestedType = request.body?.type ?? null;

  if (requestedType && !findNotificationType(requestedType)) {
    throw new ValidationError({
      message: "O tipo de notificação informado não existe.",
      action: "Use um dos tipos devolvidos por este mesmo endereço.",
    });
  }

  const unsubscribeToken = await notificationUnsubscribe.findOneValidByToken(
    request.query.token,
  );

  const disabled = await notificationUnsubscribe.apply(unsubscribeToken, {
    type: requestedType,
  });

  return response.status(200).json({
    username: unsubscribeToken.username,
    disabled: disabled.map(describe),
    // O que continua chegando, porque é transacional e não depende de
    // preferência: quem descadastra precisa saber que ainda recebe o
    // e-mail de recuperação de senha.
    transactional_kept: true,
  });
}
