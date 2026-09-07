// Usuários que já existem ganham as preferências padrão, no mesmo espírito
// de 1784073700000_add-module-features-to-users.js: quem já usava o módulo
// não precisa visitar a tela de configuração para começar a ser avisado.
//
// Os valores padrão estão escritos aqui em SQL, e não importados do
// catálogo em JavaScript, de propósito: migration é um retrato de um
// momento. Se o catálogo mudar os defaults amanhã, esta migration precisa
// continuar produzindo exatamente o que produziu quando rodou.
exports.up = (pgm) => {
  // Só quem tem a feature do módulo — e só quem pode iniciar sessão, que
  // é como o projeto marca usuário ativado.
  pgm.sql(`
    INSERT INTO notification_preferences (user_id, type)
    SELECT id, 'TASK_DUE'::notification_type
      FROM users
     WHERE 'create:session' = ANY(features)
       AND 'use:tasks' = ANY(features)
    ON CONFLICT (user_id, type) DO NOTHING;
  `);

  pgm.sql(`
    INSERT INTO notification_preferences (user_id, type)
    SELECT id, 'TASK_ASSIGNED'::notification_type
      FROM users
     WHERE 'create:session' = ANY(features)
       AND 'use:tasks' = ANY(features)
    ON CONFLICT (user_id, type) DO NOTHING;
  `);

  pgm.sql(`
    INSERT INTO notification_preferences (user_id, type)
    SELECT id, 'VISIT_UPCOMING'::notification_type
      FROM users
     WHERE 'create:session' = ANY(features)
       AND 'use:agenda' = ANY(features)
    ON CONFLICT (user_id, type) DO NOTHING;
  `);

  // Tarefa: avisa 3 dias e 1 dia antes do prazo.
  pgm.sql(`
    INSERT INTO notification_reminders (preference_id, offset_minutes)
    SELECT p.id, o.offset_minutes
      FROM notification_preferences p
      CROSS JOIN (VALUES (4320), (1440)) AS o(offset_minutes)
     WHERE p.type = 'TASK_DUE'
    ON CONFLICT (preference_id, offset_minutes) DO NOTHING;
  `);

  // Visita: 1 dia antes e 2 horas antes — a segunda serve para o
  // deslocamento até a propriedade.
  pgm.sql(`
    INSERT INTO notification_reminders (preference_id, offset_minutes)
    SELECT p.id, o.offset_minutes
      FROM notification_preferences p
      CROSS JOIN (VALUES (1440), (120)) AS o(offset_minutes)
     WHERE p.type = 'VISIT_UPCOMING'
    ON CONFLICT (preference_id, offset_minutes) DO NOTHING;
  `);

  // TASK_ASSIGNED é imediata: dispara quando a atribuição acontece, então
  // não tem antecedência para configurar.
};

exports.down = false;
