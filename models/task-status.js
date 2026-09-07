// Máquina de estados da tarefa. Vive num módulo sem dependência de banco
// de propósito: o model usa para barrar a transição no servidor e a tela
// usa para só oferecer o que é aceito. Duas listas separadas divergiriam,
// e o usuário descobriria isso na forma de um erro depois do clique.
//
// `COMPLETED` e `CANCELLED` são terminais. Uma tarefa encerrada não volta
// atrás: o registro do que aconteceu vale mais do que desfazer um clique
// errado, e criar uma tarefa nova é barato.

export const TASK_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

export const TASK_STATUS_LABELS = {
  PENDING: "Pendente",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

export const TASK_STATUS_TRANSITIONS = {
  PENDING: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

// Status em que a tarefa deixou de ter prazo a cumprir. Encerrada não é
// atrasada. Precisa casar com a expressão de `is_overdue` em
// `models/task.js` e com o `fmtDue` de `components/Shell.js`.
export const CLOSED_TASK_STATUSES = ["COMPLETED", "CANCELLED"];

// Continuar no mesmo status é aceito: mantém o PATCH idempotente, então
// reenviar a mesma requisição não vira erro.
export function canTransitionTaskStatus(from, to) {
  if (from === to) {
    return true;
  }

  return (TASK_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

// Inclui o status atual para a tela conseguir marcá-lo como selecionado.
// Lista de um elemento só significa estado terminal.
export function allowedTaskStatusTransitions(from) {
  const nextStatuses = TASK_STATUS_TRANSITIONS[from] ?? [];

  return TASK_STATUSES.filter(
    (status) => status === from || nextStatuses.includes(status),
  );
}
