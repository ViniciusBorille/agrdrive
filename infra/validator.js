import { z } from "zod";
import { ValidationError } from "@/infra/errors.js";

// O zod monta a mensagem de `unrecognized_keys` internamente e ignora o
// texto passado para `.strict()`, então esse caso chegava ao usuário em
// inglês ("Unrecognized key: ...") em todos os endpoints. Traduzir aqui
// conserta os dez de uma vez, em vez de cada rota inventar a sua.
function messageFor(issue) {
  if (issue.code === "unrecognized_keys") {
    const keys = (issue.keys ?? []).join(", ");
    return `Campos não permitidos foram enviados na requisição: ${keys}.`;
  }

  return issue.message;
}

function validate(schema, data) {
  const parsed = schema.safeParse(data);

  if (!parsed.success) {
    throw new ValidationError({
      message: messageFor(parsed.error.issues[0]),
      action: "Verifique os dados enviados e tente novamente.",
    });
  }

  return parsed.data;
}

const uuidSchema = z.uuid("O id informado não possui um formato válido.");

const usernameSchema = z
  .string("O username deve ser um texto.")
  .trim()
  .min(3, "O username deve ter no mínimo 3 caracteres.")
  .max(30, "O username deve ter no máximo 30 caracteres.")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "O username deve conter apenas letras, números e underscore.",
  );

const emailSchema = z
  .email("O email informado não possui um formato válido.")
  .max(254, "O email deve ter no máximo 254 caracteres.");

const passwordSchema = z
  .string("A senha deve ser um texto.")
  .min(8, "A senha deve ter no mínimo 8 caracteres.")
  .max(72, "A senha deve ter no máximo 72 caracteres.");

const validator = {
  validate,
  uuidSchema,
  usernameSchema,
  emailSchema,
  passwordSchema,
};

export default validator;
