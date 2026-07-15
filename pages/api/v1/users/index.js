import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "@/infra/controller.js";
import validator from "@/infra/validator.js";
import user from "@/models/user.js";
import activation from "@/models/activation.js";
import authorization from "@/models/authorization";

const createUserSchema = z
  .object({
    username: validator.usernameSchema,
    email: validator.emailSchema,
    password: validator.passwordSchema,
  })
  .strict("Campos não permitidos foram enviados na requisição.");

// Anti-abuso no cadastro (A06/A07): limita criação de contas e o
// disparo de e-mails de ativação — 10 cadastros por IP por hora.
const signupRateLimit = controller.rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
});

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .get(controller.requireAuthentication, getHandler)
  .post(signupRateLimit, controller.canRequest("create:user"), postHandler)
  .handler(controller.errorHandlers);

async function getHandler(request, response) {
  const users = await user.findAll();
  return response.status(200).json(users);
}

async function postHandler(request, response) {
  const userTryingToPost = request.context.user;
  const userInputValues = validator.validate(createUserSchema, request.body);
  const newUser = await user.create(userInputValues);

  const activationToken = await activation.create(newUser.id);
  await activation.sendEmailToUser(newUser, activationToken);

  const secureOutputValues = authorization.filterOutput(
    userTryingToPost,
    "create:user",
    newUser,
  );

  return response.status(201).json(secureOutputValues);
}
