import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "@/infra/controller.js";
import task from "@/models/task.js";
import { ForbiddenError, ValidationError } from "@/infra/errors.js";

const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(150).optional(),
    description: z.string().max(2000).nullable().optional(),
    status: z
      .enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
      .optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
    assigned_to: z.string().uuid().nullable().optional(),
    due_date: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Pelo menos um campo deve ser fornecido para atualização.",
  });

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .get(getHandler)
  .patch(patchHandler)
  .delete(deleteHandler)
  .handler(controller.errorHandlers);

async function getHandler(request, response) {
  const userTryingToGet = request.context.user;
  const taskId = request.query.task_id;

  const taskFound = await task.findOneById(taskId);

  const isCreator = taskFound.created_by === userTryingToGet.id;
  const isAssignee = taskFound.assigned_to === userTryingToGet.id;

  if (!isCreator && !isAssignee) {
    throw new ForbiddenError({
      message: "Você não tem acesso a esta tarefa.",
      action:
        "Somente o criador ou o usuário atribuído pode visualizar a tarefa.",
    });
  }

  return response.status(200).json(taskFound);
}

async function patchHandler(request, response) {
  const userTryingToPatch = request.context.user;
  const taskId = request.query.task_id;

  const parsed = updateTaskSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ValidationError({
      message: parsed.error.issues[0].message,
      action: "Verifique os dados enviados e tente novamente.",
    });
  }

  const taskFound = await task.findOneById(taskId);

  const isCreator = taskFound.created_by === userTryingToPatch.id;
  const isAssignee = taskFound.assigned_to === userTryingToPatch.id;

  if (!isCreator && !isAssignee) {
    throw new ForbiddenError({
      message: "Você não tem acesso a esta tarefa.",
      action:
        "Somente o criador ou o usuário atribuído pode atualizar a tarefa.",
    });
  }

  if ("assigned_to" in parsed.data && !isCreator) {
    throw new ForbiddenError({
      message: "Somente o criador pode reatribuir a tarefa.",
      action:
        "Remova o campo 'assigned_to' da requisição ou contate o criador da tarefa.",
    });
  }

  const updatedTask = await task.update(taskId, parsed.data);
  return response.status(200).json(updatedTask);
}

async function deleteHandler(request, response) {
  const userTryingToDelete = request.context.user;
  const taskId = request.query.task_id;

  const taskFound = await task.findOneById(taskId);

  if (taskFound.created_by !== userTryingToDelete.id) {
    throw new ForbiddenError({
      message: "Somente o criador pode excluir a tarefa.",
      action: "Contate o criador da tarefa para excluí-la.",
    });
  }

  const removedTask = await task.remove(taskId);
  return response.status(200).json(removedTask);
}
