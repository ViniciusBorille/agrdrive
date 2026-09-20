// Máquina de estados da tarefa. Vive num módulo sem dependência de banco
// de propósito: o model usa para barrar a transição no servidor e a tela
// usa para só oferecer o que é aceito. Duas listas separadas divergiriam,
// e o usuário descobriria isso na forma de um erro depois do clique.
//
// `COMPLETED` e `CANCELLED` são terminais. Uma tarefa encerrada não volta
// atrás: o registro do que aconteceu vale mais do que desfazer um clique
// errado, e criar uma tarefa nova é barato.
//
// `FINISHING` fica entre "Em andamento" e "Concluída": o serviço acabou,
// falta conferir. Não é terminal — a tarefa ainda tem prazo a cumprir,
// ainda pode atrasar e ainda recebe lembrete de vencimento.

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

// Só para frente, como já era de PENDING para IN_PROGRESS: uma tarefa em
// finalização não volta para "Em andamento". Voltar apagaria o registro
// de que o serviço chegou a ser dado por encerrado, e o caso real —
// apareceu trabalho novo — se resolve concluindo e abrindo outra tarefa.
export const TASK_STATUS_TRANSITIONS = {
  PENDING: ["IN_PROGRESS", "FINISHING", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["FINISHING", "COMPLETED", "CANCELLED"],
  FINISHING: ["COMPLETED", "CANCELLED"],
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
