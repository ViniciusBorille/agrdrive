// Conserta as tarefas gravadas pelo formulário antigo.
//
// O seletor de data devolve "AAAA-MM-DD" e o formulário concatenava
// "T00:00:00.000Z", ou seja, meia-noite UTC. Em qualquer fuso negativo
// isso cai no dia anterior: quem escolheu 29/09 ficou com uma tarefa que,
// no Brasil, vence 28/09 às 21:00.
//
// O estrago não era só cosmético. O prazo aparecia um dia adiantado na
// lista, a tarefa virava "Atrasada" um dia antes da hora, e o aviso de
// "1 dia antes" sairia dois dias cedo.
//
// A partir de agora o formulário grava o fim do dia no fuso do usuário.
// Esta migration traz as linhas antigas para a mesma convenção: pega a
// data que a pessoa escolheu (a parte de data do instante em UTC) e
// regrava como 23:59:59.999 no fuso de quem criou a tarefa.
//
// O filtro por meia-noite exata delimita o alvo: só linhas com essa marca
// vieram do formulário. A interface nunca ofereceu escolher hora, então
// não há prazo legítimo à meia-noite UTC para ser deslocado por engano.
exports.up = (pgm) => {
  pgm.sql(`
    UPDATE tasks t
    SET
      due_date = (
        ((t.due_date AT TIME ZONE 'UTC')::date + time '23:59:59.999')
        AT TIME ZONE u.timezone
      ),
      updated_at = timezone('utc', now())
    FROM users u
    WHERE
      u.id = t.created_by
      AND t.due_date IS NOT NULL
      AND (t.due_date AT TIME ZONE 'UTC')::time = time '00:00:00';
  `);
};

exports.down = false;
