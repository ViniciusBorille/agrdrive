import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "@/infra/controller.js";
import validator from "@/infra/validator.js";
import task from "@/models/task.js";
import { ForbiddenError } from "@/infra/errors.js";

const updateTaskSchema = z
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
      .nullable(),
    status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
    assigned_to: validator.uuidSchema
      .or(
        z
          .array(validator.uuidSchema, {
            invalid_type_error: "O campo responsáveis deve ser uma lista.",
          })
          .min(1),
      )
      .nullable(),
    due_date: z.iso.datetime({ offset: true }).nullable(),
  })
  .partial()
  .strict("Campos não permitidos foram enviados na requisição.")
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
  const taskId = validator.validate(
    validator.uuidSchema,
    request.query.task_id,
  );

  const taskFound = await task.findOneById(taskId);

  const isCreator = taskFound.created_by === userTryingToGet.id;
  const isAssignee = taskFound.assignees?.some(
    (a) => a.id === userTryingToGet.id,
  );

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
  const taskId = validator.validate(
    validator.uuidSchema,
    request.query.task_id,
  );

  const taskInputValues = validator.validate(updateTaskSchema, request.body);

  const taskFound = await task.findOneById(taskId);

  const isCreator = taskFound.created_by === userTryingToPatch.id;
  const isAssignee = taskFound.assignees?.some(
    (a) => a.id === userTryingToPatch.id,
  );

  if (!isCreator && !isAssignee) {
    throw new ForbiddenError({
      message: "Você não tem acesso a esta tarefa.",
      action:
        "Somente o criador ou o usuário atribuído pode atualizar a tarefa.",
    });
  }

  if ("assigned_to" in taskInputValues && !isCreator) {
    throw new ForbiddenError({
      message: "Somente o criador pode reatribuir a tarefa.",
      action:
        "Remova o campo 'assigned_to' da requisição ou contate o criador da tarefa.",
    });
  }

  const updatedTask = await task.update(taskId, taskInputValues);
  return response.status(200).json(updatedTask);
}

async function deleteHandler(request, response) {
  const userTryingToDelete = request.context.user;
  const taskId = validator.validate(
    validator.uuidSchema,
    request.query.task_id,
  );

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
