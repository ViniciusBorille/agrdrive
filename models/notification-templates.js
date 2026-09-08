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
};

const TYPE_LABELS = {
  TASK_DUE: { singular: "tarefa", plural: "tarefas", verb: "vence" },
  VISIT_UPCOMING: {
    singular: "compromisso",
    plural: "compromissos",
    verb: "acontece",
  },
};

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

function buildText(user, items, settingsUrl) {
  const lines = [`${user.username}, você tem avisos no AgrDrive:`, ""];

  for (const [type, groupItems] of groupByType(items)) {
    const labels = TYPE_LABELS[type];
    lines.push(`${labels.plural.toUpperCase()}:`);

    for (const item of groupItems) {
      lines.push(
        `- ${item.title} — ${formatEventAt(item.eventAt, user.timezone)} (em ${humanizeOffset(item.offsetMinutes)})`,
      );
      lines.push(`  ${itemUrl(item)}`);
    }

    lines.push("");
  }

  lines.push("Para escolher o que recebe e quando, acesse:");
  lines.push(settingsUrl);
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

function buildHtml(user, items, settingsUrl) {
  const sections = [];

  for (const [type, groupItems] of groupByType(items)) {
    const labels = TYPE_LABELS[type];
    const rows = groupItems
      .map(
        (item) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef1ef;">
              <a href="${itemUrl(item)}" style="color:#1c6856;font-weight:600;text-decoration:none;">${escapeHtml(item.title)}</a>
              <div style="color:#5a635e;font-size:13px;margin-top:3px;">
                ${escapeHtml(formatEventAt(item.eventAt, user.timezone))} — em ${escapeHtml(humanizeOffset(item.offsetMinutes))}
              </div>
            </td>
          </tr>`,
      )
      .join("");

    sections.push(`
      <p style="color:#8a938e;font-size:12px;letter-spacing:.6px;text-transform:uppercase;margin:22px 0 0;">
        ${escapeHtml(labels.plural)}
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`);
  }

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#2c3330;">
      <h1 style="font-size:18px;margin:0 0 4px;">AgrDrive</h1>
      <p style="margin:0 0 8px;">${escapeHtml(user.username)}, você tem avisos:</p>
      ${sections.join("")}
      <p style="color:#8a938e;font-size:12px;margin-top:28px;border-top:1px solid #eef1ef;padding-top:14px;">
        <a href="${settingsUrl}" style="color:#8a938e;">Escolher o que você recebe e quando</a>
      </p>
    </div>`;
}

// Um e-mail por usuário, agrupando tudo o que venceu naquela execução. Três
// avisos viram três itens numa mensagem, não três mensagens — a diferença
// entre uma funcionalidade útil e um motivo para marcar o remetente como
// spam.
export function buildNotificationEmail({ user, items }) {
  const settingsUrl = `${webserver.origin}/configuracoes/notificacoes`;

  return {
    subject: buildSubject(items),
    text: buildText(user, items, settingsUrl),
    html: buildHtml(user, items, settingsUrl),
  };
}
