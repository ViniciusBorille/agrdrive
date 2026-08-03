// Usuários ativos antes do módulo de Agenda de campo ganham acesso a ele
// automaticamente, seguindo o mesmo padrão usado para Tarefas e Indicadores
// em 1784073700000_add-module-features-to-users.js.
exports.up = (pgm) => {
  pgm.sql(`
    UPDATE users
    SET features = features || '{use:agenda}'::varchar[]
    WHERE 'create:session' = ANY(features);
  `);
};

exports.down = false;
