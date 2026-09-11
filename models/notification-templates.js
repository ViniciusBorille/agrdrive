import webserver from "@/infra/webserver.js";
import { humanizeOffset } from "@/models/notification-reminder.js";

// Composição do e-mail de notificação. Módulo puro: recebe dados, devolve
// texto. Não fala com banco nem com SMTP, então dá para conferir o que o
// usuário vai receber sem mandar nada.
//
// Nada de motor de template: função que devolve string resolve, e mantém o
// teste trivial. HTML de e-mail também é hostil — cliente de e-mail não
// tem flexbox confiável nem CSS externo —, então o layout é deliberadamente
// simples: cabeçalho, lista, rodapé, tudo com estilo em linha.

const MODULE_PATHS = {
  TASK_DUE: "/tarefas",
  VISIT_UPCOMING: "/agenda",
  TASK_ASSIGNED: "/tarefas",
};

// `section` existe porque `TASK_DUE` e `TASK_ASSIGNED` compartilham o
// plural "tarefas": num e-mail que traga os dois, dois blocos com o mesmo
// título não diriam qual é qual.
const TYPE_LABELS = {
  TASK_DUE: { singular: "tarefa", plural: "tarefas", verb: "vence" },
  VISIT_UPCOMING: {
    singular: "compromisso",
    plural: "compromissos",
    verb: "acontece",
  },
  TASK_ASSIGNED: {
    singular: "tarefa",
    plural: "tarefas",
    section: "tarefas atribuídas a você",
  },
};

// Aviso sem antecedência: o fato já aconteceu quando o e-mail é composto.
const IMMEDIATE_TYPES = new Set(["TASK_ASSIGNED"]);

function isImmediate(item) {
  return IMMEDIATE_TYPES.has(item.type);
}

function sectionTitle(type) {
  const labels = TYPE_LABELS[type];

  return labels.section ?? labels.plural;
}

// O que vai depois do título do item. Para aviso agendado, a data do
// evento e quanto falta; para aviso imediato, o prazo — que é a única
// informação útil de uma tarefa que você acabou de receber, e pode não
// existir.
function describeItem(item, timezone) {
  if (isImmediate(item)) {
    return item.eventAt
      ? `prazo ${formatEventAt(item.eventAt, timezone)}`
      : "sem prazo definido";
  }

  return `${formatEventAt(item.eventAt, timezone)} — em ${humanizeOffset(item.offsetMinutes)}`;
}

// A data precisa aparecer no fuso de quem lê, senão o e-mail contradiz o
// que a pessoa vê na tela.
export function formatEventAt(eventAt, timezone) {
  if (!eventAt) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone || "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(eventAt));
}

// Assunto que já resolve sem abrir. Quando tudo no e-mail é do mesmo tipo e
// da mesma antecedência dá para ser específico ("3 tarefas vencem em 3
// dias"); misturando tipos, só o total honesto.
function buildSubject(items) {
  const sameType = items.every((item) => item.type === items[0].type);

  // Aviso imediato não tem antecedência: "vence em 0 minutos" não quer
  // dizer nada.
  if (sameType && isImmediate(items[0])) {
    return items.length === 1
      ? "Você recebeu uma nova tarefa"
      : `Você recebeu ${items.length} novas tarefas`;
  }

  const sameOffset = items.every(
    (item) => item.offsetMinutes === items[0].offsetMinutes,
  );

  if (!sameType || !sameOffset) {
    return `Você tem ${items.length} avisos do AgrDrive`;
  }

  const labels = TYPE_LABELS[items[0].type];
  const when = humanizeOffset(items[0].offsetMinutes);

  if (items.length === 1) {
    return `1 ${labels.singular} ${labels.verb} em ${when}`;
  }

  return `${items.length} ${labels.plural} ${labels.verb}m em ${when}`;
}

function itemUrl(item) {
  return `${webserver.origin}${MODULE_PATHS[item.type] ?? "/"}`;
}

function groupByType(items) {
  const groups = new Map();

  for (const item of items) {
    if (!groups.has(item.type)) {
      groups.set(item.type, []);
    }
    groups.get(item.type).push(item);
  }

  return groups;
}

function buildText(user, items, settingsUrl, unsubscribeUrl) {
  const lines = [`${user.username}, você tem avisos no AgrDrive:`, ""];

  for (const [type, groupItems] of groupByType(items)) {
    lines.push(`${sectionTitle(type).toUpperCase()}:`);

    for (const item of groupItems) {
      lines.push(`- ${item.title} — ${describeItem(item, user.timezone)}`);
      lines.push(`  ${itemUrl(item)}`);
    }

    lines.push("");
  }

  lines.push("Para escolher o que recebe e quando, acesse:");
  lines.push(settingsUrl);

  // Sem saída visível, o caminho que sobra para quem se incomodou é o
  // botão de spam — e isso derruba a entrega de todo o domínio, inclusive
  // do e-mail de recuperação de senha.
  if (unsubscribeUrl) {
    lines.push("");
    lines.push("Para parar de receber estes avisos, acesse:");
    lines.push(unsubscribeUrl);
  }

  lines.push("");
  lines.push("Equipe AgrDrive");

  return lines.join("\n");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(user, items, settingsUrl, unsubscribeUrl) {
  const sections = [];

  for (const [type, groupItems] of groupByType(items)) {
    const rows = groupItems
      .map(
        (item) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef1ef;">
              <a href="${itemUrl(item)}" style="color:#1c6856;font-weight:600;text-decoration:none;">${escapeHtml(item.title)}</a>
              <div style="color:#5a635e;font-size:13px;margin-top:3px;">
                ${escapeHtml(describeItem(item, user.timezone))}
              </div>
            </td>
          </tr>`,
      )
      .join("");

    sections.push(`
      <p style="color:#8a938e;font-size:12px;letter-spacing:.6px;text-transform:uppercase;margin:22px 0 0;">
        ${escapeHtml(sectionTitle(type))}
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`);
  }

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#2c3330;">
      <h1 style="font-size:18px;margin:0 0 4px;">AgrDrive</h1>
      <p style="margin:0 0 8px;">${escapeHtml(user.username)}, você tem avisos:</p>
      ${sections.join("")}
      <p style="color:#8a938e;font-size:12px;margin-top:28px;border-top:1px solid #eef1ef;padding-top:14px;">
        <a href="${settingsUrl}" style="color:#8a938e;">Escolher o que você recebe e quando</a>${
          unsubscribeUrl
            ? `
        &nbsp;·&nbsp;
        <a href="${unsubscribeUrl}" style="color:#8a938e;">Parar de receber</a>`
            : ""
        }
      </p>
    </div>`;
}

// Um e-mail por usuário, agrupando tudo o que venceu naquela execução. Três
// avisos viram três itens numa mensagem, não três mensagens — a diferença
// entre uma funcionalidade útil e um motivo para marcar o remetente como
// spam.
export function buildNotificationEmail({ user, items, unsubscribeToken }) {
  const settingsUrl = `${webserver.origin}/configuracoes/notificacoes`;
  const unsubscribeUrl = unsubscribeToken
    ? `${webserver.origin}/descadastro/${unsubscribeToken}`
    : null;

  return {
    subject: buildSubject(items),
    text: buildText(user, items, settingsUrl, unsubscribeUrl),
    html: buildHtml(user, items, settingsUrl, unsubscribeUrl),
    headers: buildUnsubscribeHeaders(unsubscribeToken),
  };
}

// RFC 8058. É o que faz o Gmail mostrar o botão nativo de cancelar
// inscrição, ao lado do remetente — quem usa esse botão não usa o de spam,
// e é a diferença entre perder um destinatário e perder o domínio.
//
// O `One-Click` é um POST do provedor, não um GET: pré-carregamento de
// link do cliente de e-mail não dispara. Por isso ele pode aplicar direto,
// enquanto o link humano leva para uma página que confirma antes.
function buildUnsubscribeHeaders(unsubscribeToken) {
  if (!unsubscribeToken) {
    return {};
  }

  const oneClickUrl = `${webserver.origin}/api/v1/notifications/unsubscribe/${unsubscribeToken}`;

  return {
    "List-Unsubscribe": `<${oneClickUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
