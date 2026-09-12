import crypto from "node:crypto";
import { createRouter } from "next-connect";
import controller from "@/infra/controller.js";
import logger from "@/infra/logger.js";
import notificationScheduler from "@/models/notification-scheduler.js";
import notificationSender from "@/models/notification-sender.js";
import { UnauthorizedError } from "@/infra/errors.js";

// Ponto de entrada do agendador. Não usa sessão de usuário: quem chama é o
// workflow do GitHub Actions, de hora em hora, com um segredo no header.
//
// Só `POST` está registrado de propósito. Um `GET` cai no
// `onNoMatchHandler` e devolve 405 sem revelar nada além de que a rota
// existe.
export default createRouter()
  .post(postHandler)
  .handler(controller.errorHandlers);

// Compara em tempo constante. O hash dos dois lados antes da comparação
// iguala o tamanho — que o `timingSafeEqual` exige — sem precisar de um
// `if` no comprimento, que vazaria o tamanho do segredo.
function matchesSecret(provided, expected) {
  const left = crypto.createHash("sha256").update(String(provided)).digest();
  const right = crypto.createHash("sha256").update(String(expected)).digest();

  return crypto.timingSafeEqual(left, right);
}

function assertAuthorized(request) {
  const expected = process.env.NOTIFICATIONS_DISPATCH_SECRET;
  const header = request.headers.authorization ?? "";
  const provided = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : "";

  // Sem segredo configurado o endpoint fica fechado, e não aberto: um
  // deploy sem a variável não pode virar uma porta destrancada.
  const authorized = Boolean(expected) && matchesSecret(provided, expected);

  if (!authorized) {
    throw new UnauthorizedError({
      message: "Credencial inválida para esta operação.",
      action: "Verifique o segredo enviado pelo agendador.",
    });
  }
}

// Modo seco: apura e responde o que faria, sem reservar e sem enviar.
// Existe para depurar em produção sem transformar a investigação em e-mail
// na caixa do cliente.
async function runDryRun(startedAt) {
  const preview = await notificationScheduler.reserveDue({ dryRun: true });
  const queued = await notificationSender.findPending();

  return {
    dry_run: true,
    would_reserve: preview.pending.length,
    would_skip: preview.skipped.length,
    already_queued: queued.length,
    duration_ms: Date.now() - startedAt,
  };
}

async function postHandler(request, response) {
  assertAuthorized(request);

  const startedAt = Date.now();

  if (request.query.dry_run === "true") {
    return response.status(200).json(await runDryRun(startedAt));
  }

  // Primeiro descarta o que envelheceu entre a apuração anterior e agora,
  // para não gastar envio com tarefa que já foi concluída.
  const obsolete = await notificationScheduler.skipObsolete();
  const reserved = await notificationScheduler.reserveDue();
  const delivery = await notificationSender.sendPending();

  const summary = {
    reserved: reserved.pending.length,
    skipped: reserved.skipped.length + obsolete.length,
    sent: delivery.sent,
    retrying: delivery.retrying,
    failed: delivery.failed,
    recipients: delivery.recipients,
    duration_ms: Date.now() - startedAt,
  };

  logger.info("notifications_dispatch", summary);

  // 200 mesmo com `failed` maior que zero: o disparo funcionou, foram as
  // entregas que não. Quem transforma isso em alerta é o workflow, que lê
  // o corpo e falha alto — é o que faz a notificação chegar a um humano.
  return response.status(200).json(summary);
}
