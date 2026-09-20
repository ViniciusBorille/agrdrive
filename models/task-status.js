// Status da tarefa. Vive num módulo sem dependência de banco de
// propósito: a tela e o servidor leem a mesma lista, então não há como
// uma oferecer o que a outra recusa.
//
// Não existe ordem obrigatória entre eles: a tarefa vai para qualquer
// status a qualquer momento. Quem está em campo corrige o que clicou
// errado, e uma tabela de transições só transformava isso em erro depois
// do clique.
//
// As exceções são `COMPLETED` e `CANCELLED`, logo abaixo.
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
export const CLOSED_TASK_STATUSES = ["COMPLETED", "CANCELLED"];

// Encerrar é definitivo, e vale para as duas portas de saída: concluída
// e cancelada. É a única transição barrada — o registro de que a tarefa
// foi encerrada vale mais do que desfazer o clique, e abrir outra tarefa
// é barato.
//
// Derivado de `CLOSED_TASK_STATUSES` em vez de repetir a lista: hoje as
// duas leituras coincidem, e duas listas iguais lado a lado divergem na
// primeira vez que alguém mexe numa só. Se algum dia existir um status
// que não conta prazo mas ainda muda, é aqui que elas se separam.
export function isTaskStatusFinal(status) {
  return CLOSED_TASK_STATUSES.includes(status);
}

// Continuar no mesmo status é aceito mesmo nas encerradas: mantém o
// PATCH idempotente, então reenviar a mesma requisição não vira erro.
export function canTransitionTaskStatus(from, to) {
  if (from === to) {
    return true;
  }

  return !isTaskStatusFinal(from);
}
