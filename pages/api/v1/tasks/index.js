import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "@/infra/controller.js";
import task from "@/models/task.js";
import { ValidationError } from "@/infra/errors.js";

const createTaskSchema = z.object({
  title: z.string().min(1).max(150),
  description: z.string().max(2000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assigned_to: z.string().uuid().optional(),
  due_date: z.iso.datetime({ offset: true }).optional(),
});

const viewQuerySchema = z.enum(["assigned", "created", "all"]);

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .post(postHandler)
  .get(getHandler)
  .handler(controller.errorHandlers);

async function postHandler(request, response) {
  const userTryingToPost = request.context.user;

  const parsed = createTaskSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ValidationError({
      message: parsed.error.issues[0].message,
      action: "Verifique os dados enviados e tente novamente.",
    });
  }

  const newTask = await task.create({
    ...parsed.data,
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
