// Status da tarefa. Vive num módulo sem dependência de banco de
// propósito: a tela e o servidor leem a mesma lista, então não há como
// uma oferecer o que a outra recusa.
//
// Não existe ordem obrigatória entre eles: a tarefa vai para qualquer
// status a qualquer momento. Quem está em campo corrige o que clicou
// errado, e uma tabela de transições só transformava isso em erro depois
// do clique.
//
// A única exceção é `COMPLETED`, logo abaixo.
//
// A ordem da lista é de apresentação — é nela que os menus e filtros
// aparecem, do começo ao fim do fluxo comum.

export const TASK_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "FINISHING",
  "COMPLETED",
  "CANCELLED",
];

export const TASK_STATUS_LABELS = {
  PENDING: "Pendente",
  IN_PROGRESS: "Em andamento",
  FINISHING: "Em finalização",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

// Status em que a tarefa deixou de ter prazo a cumprir. Encerrada não é
// atrasada. Precisa casar com a expressão de `is_overdue` em
// `models/task.js` e com o `fmtDue` de `components/Shell.js`.
//
// Isto é sobre prazo, não sobre permissão: uma tarefa cancelada não
// atrasa mais, mas continua podendo voltar para qualquer status.
export const CLOSED_TASK_STATUSES = ["COMPLETED", "CANCELLED"];

// Concluir é definitivo. É a única transição barrada, e é o que separa
// "concluída" de "cancelada": cancelar é reversível, concluir declara
// que o trabalho acabou. Se o trabalho voltar, a tarefa nova é barata —
// o registro de que esta foi dada por encerrada, não.
export function isTaskStatusFinal(status) {
  return status === "COMPLETED";
}

// Continuar no mesmo status é aceito mesmo em concluída: mantém o PATCH
// idempotente, então reenviar a mesma requisição não vira erro.
export function canTransitionTaskStatus(from, to) {
  if (from === to) {
    return true;
  }

  return !isTaskStatusFinal(from);
}
