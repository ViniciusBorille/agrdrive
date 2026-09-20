// "Em finalização" é a tarefa que já foi executada em campo mas ainda
// espera conferência antes de virar concluída. Sem esse degrau, quem
// terminou o serviço só tinha duas saídas: deixar em "Em andamento" — e
// perder de vista o que falta conferir — ou concluir cedo demais, que é
// irreversível.
//
// `BEFORE 'COMPLETED'` importa: a ordem do enum é o que o Postgres usa
// para comparar e ordenar valores de `task_status`, e um `FINISHING`
// jogado no fim ordenaria depois de "Cancelada".
//
// `ALTER TYPE ... ADD VALUE` dentro de transação é aceito desde o
// Postgres 12 (aqui roda o 16) contanto que o valor novo não seja usado
// na mesma transação — esta migration só o declara.
exports.up = (pgm) => {
  pgm.addTypeValue("task_status", "FINISHING", { before: "COMPLETED" });
};

exports.down = false;
