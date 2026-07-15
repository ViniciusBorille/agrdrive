import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "@/infra/controller.js";
import validator from "@/infra/validator.js";
import { NotFoundError } from "@/infra/errors.js";
import user from "@/models/user.js";
import recovery from "@/models/recovery.js";

const createRecoverySchema = z
  .object({
    email: validator.emailSchema,
  })
  .strict("Campos não permitidos foram enviados na requisição.");

// Anti-abuso na recuperação de senha (A07): limita o disparo de
// e-mails de recuperação — 10 solicitações por IP por hora.
const recoveryRateLimit = controller.rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
});

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .post(
    recoveryRateLimit,
    controller.canRequest("create:recovery_token"),
    postHandler,
  )
  .handler(controller.errorHandlers);

async function postHandler(request, response) {
  const { email } = validator.validate(createRecoverySchema, request.body);

  // Resposta sempre genérica para não revelar se o e-mail está cadastrado.
  try {
    const userFound = await user.findOneByEmail(email);
    const recoveryToken = await recovery.create(userFound.id);
    await recovery.sendEmailToUser(userFound, recoveryToken);
  } catch (error) {
    if (!(error instanceof NotFoundError)) {
      throw error;
    }
  }

  return response.status(201).json({
    message:
      "Se o e-mail estiver cadastrado, você receberá um link de recuperação.",
  });
}
