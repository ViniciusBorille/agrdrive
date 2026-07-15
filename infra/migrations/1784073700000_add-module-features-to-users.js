// Usuários ativados antes das permissões por módulo continuam com
// acesso aos módulos que já usavam (Tarefas e Indicadores).
exports.up = (pgm) => {
  pgm.sql(`
    UPDATE users
    SET features = features || '{use:tasks,read:indicators}'::varchar[]
    WHERE 'create:session' = ANY(features);
  `);
};

exports.down = false;
