import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "@/infra/controller.js";
import validator from "@/infra/validator.js";
import task from "@/models/task.js";
import { ValidationError } from "@/infra/errors.js";

const createTaskSchema = z
  .object({
    title: z
      .string("O título deve ser um texto.")
      .trim()
      .min(1, "O título é obrigatório.")
      .max(150, "O título deve ter no máximo 150 caracteres."),
    description: z
      .string("A descrição deve ser um texto.")
      .trim()
      .max(2000, "A descrição deve ter no máximo 2000 caracteres.")
      .optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
    assigned_to: validator.uuidSchema.optional(),
    due_date: z.iso.datetime({ offset: true }).optional(),
  })
  .strict("Campos não permitidos foram enviados na requisição.");

const viewQuerySchema = z.enum(["assigned", "created", "all"]);

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .post(postHandler)
  .get(getHandler)
  .handler(controller.errorHandlers);

async function postHandler(request, response) {
  const userTryingToPost = request.context.user;

  const taskInputValues = validator.validate(createTaskSchema, request.body);

  const newTask = await task.create({
    ...taskInputValues,
    created_by: userTryingToPost.id,
  });

  return response.status(201).json(newTask);
}

async function getHandler(request, response) {
  const userTryingToGet = request.context.user;
  const rawView = request.query.view ?? "all";

  const parsedView = viewQuerySchema.safeParse(rawView);
  if (!parsedView.success) {
    throw new ValidationError({
      message: "O parâmetro 'view' deve ser 'assigned', 'created' ou 'all'.",
      action: "Verifique os parâmetros da requisição.",
    });
  }

  const tasks = await task.findAll({
    userId: userTryingToGet.id,
    view: parsedView.data,
  });

  return response.status(200).json(tasks);
}
