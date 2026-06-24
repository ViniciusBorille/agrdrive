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

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .get(controller.requireAuthentication, getHandler)
  .post(controller.canRequest("create:user"), postHandler)
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
