// Conserta o buraco entre 1790700000003 e a criação automática de
// preferências em `models/user.js`.
//
// Aquela migration foi um retrato: deu preferências a quem existia naquele
// momento. Todo usuário cadastrado depois dela nasceu sem nenhuma linha em
// `notification_preferences` — e o agendador faz JOIN com essa tabela, não
// LEFT JOIN. Resultado: essas pessoas nunca receberiam aviso nenhum,
// enquanto a tela de configuração mostrava os padrões como se estivessem
// valendo. Falha silenciosa, do tipo de que ninguém reclama.
//
// Como em 1790700000003, os valores estão em SQL e não importados do
// catálogo: migration precisa continuar produzindo amanhã o que produziu
// hoje, mesmo que os padrões do catálogo mudem.
//
// Diferença deliberada em relação àquela: aqui **não** há filtro por
// feature de módulo. A feature é conferida pelo agendador na hora da
// apuração, e gravar a linha para todo mundo faz com que conceder
// `use:agenda` meses depois já comece a avisar, sem visita à tela.
exports.up = (pgm) => {
  for (const type of ["TASK_DUE", "TASK_ASSIGNED", "VISIT_UPCOMING"]) {
    pgm.sql(`
      INSERT INTO notification_preferences (user_id, type)
      SELECT id, '${type}'::notification_type
        FROM users
      ON CONFLICT (user_id, type) DO NOTHING;
    `);
  }

  // Os lembretes só entram em preferência que ficou sem nenhum. Quem já
  // configurou — inclusive quem apagou lembretes de propósito — não pode
  // ver a própria escolha desfeita por uma migration.
  pgm.sql(`
    INSERT INTO notification_reminders (preference_id, offset_minutes)
    SELECT p.id, o.offset_minutes
      FROM notification_preferences p
      CROSS JOIN (VALUES (4320), (1440)) AS o(offset_minutes)
     WHERE p.type = 'TASK_DUE'
       AND NOT EXISTS (
         SELECT 1 FROM notification_reminders r WHERE r.preference_id = p.id
       )
    ON CONFLICT (preference_id, offset_minutes) DO NOTHING;
  `);

  pgm.sql(`
    INSERT INTO notification_reminders (preference_id, offset_minutes)
    SELECT p.id, o.offset_minutes
      FROM notification_preferences p
      CROSS JOIN (VALUES (1440), (120)) AS o(offset_minutes)
     WHERE p.type = 'VISIT_UPCOMING'
       AND NOT EXISTS (
         SELECT 1 FROM notification_reminders r WHERE r.preference_id = p.id
       )
    ON CONFLICT (preference_id, offset_minutes) DO NOTHING;
  `);
};

exports.down = false;
