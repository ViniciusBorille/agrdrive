import authorization from "@/models/authorization.js";

// Fonte única do que pode virar notificação: a API valida contra este
// catálogo, a tela se desenha a partir dele e o agendador itera sobre ele.
// Três listas separadas divergiriam, e a divergência apareceria como aviso
// que nunca chega ou opção que a API recusa depois do clique.
//
// Acrescentar um tipo aqui exige acrescentar o mesmo valor ao enum
// `notification_type` no banco. Há um teste de integração comparando os
// dois, que falha se um andar sem o outro.

// Agendado: dispara antes de uma data que pertence ao próprio item.
export const BEFORE_EVENT = "BEFORE_EVENT";
// Imediato: dispara no momento em que o fato acontece, sem antecedência.
export const IMMEDIATE = "IMMEDIATE";

// Tetos que existem para proteger o agendador, não para limitar o usuário
// por limitar: sem eles, alguém pede duzentos lembretes numa tarefa só e o
// job vira um gerador de spam contra o próprio domínio.
const SCHEDULED_LIMITS = {
  maxReminders: 5,
  minOffsetMinutes: 60,
  maxOffsetMinutes: 43200, // 30 dias
};

// Um tipo imediato não tem antecedência para configurar — só liga e
// desliga.
const IMMEDIATE_LIMITS = {
  maxReminders: 0,
  minOffsetMinutes: null,
  maxOffsetMinutes: null,
};

const NOTIFICATION_TYPES = [
  {
    type: "TASK_DUE",
    label: "Tarefa com prazo se aproximando",
    description: "Avisa antes do prazo das tarefas atribuídas a você.",
    feature: "use:tasks",
    schedule: BEFORE_EVENT,
    defaultOffsets: [4320, 1440], // 3 dias e 1 dia
    ...SCHEDULED_LIMITS,
  },
  {
    type: "VISIT_UPCOMING",
    label: "Compromisso da agenda se aproximando",
    description: "Avisa antes dos compromissos da sua agenda de campo.",
    feature: "use:agenda",
    schedule: BEFORE_EVENT,
    defaultOffsets: [1440, 120], // 1 dia e 2 horas
    ...SCHEDULED_LIMITS,
  },
  {
    type: "TASK_ASSIGNED",
    label: "Tarefa atribuída a você",
    description: "Avisa assim que alguém coloca você como responsável.",
    feature: "use:tasks",
    schedule: IMMEDIATE,
    defaultOffsets: [],
    ...IMMEDIATE_LIMITS,
  },
];

// Cópias em vez do objeto interno: quem consome não deve conseguir alterar
// o catálogo sem querer, e o bug disso seria silencioso.
function copyOf(typeDefinition) {
  return {
    ...typeDefinition,
    defaultOffsets: [...typeDefinition.defaultOffsets],
  };
}

export function listNotificationTypes() {
  return NOTIFICATION_TYPES.map(copyOf);
}

export function findNotificationType(type) {
  const found = NOTIFICATION_TYPES.find(
    (definition) => definition.type === type,
  );

  return found ? copyOf(found) : undefined;
}

export function isKnownNotificationType(type) {
  return NOTIFICATION_TYPES.some((definition) => definition.type === type);
}

export function isScheduled(type) {
  return findNotificationType(type)?.schedule === BEFORE_EVENT;
}

// Quem não tem a feature do módulo não vê o tipo: sem `use:agenda`, não
// faz sentido oferecer aviso de compromisso que a pessoa não consegue
// sequer abrir.
export function listNotificationTypesForUser(user) {
  return listNotificationTypes().filter((definition) =>
    authorization.can(user, definition.feature),
  );
}

export function canUserReceive(user, type) {
  const definition = findNotificationType(type);

  if (!definition) {
    return false;
  }

  return authorization.can(user, definition.feature);
}
