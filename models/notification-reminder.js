// Tradução entre a unidade da API e a unidade da tela.
//
// A API fala em minutos, e só em minutos — duas unidades no contrato seriam
// duas chances de divergir. A tela fala em dias e horas, porque ninguém
// configura "4320 minutos antes". A conversão mora aqui, num lugar só: é
// onde nasceria o bug de "coloquei 3 dias e chegou em 3 horas".
//
// Módulo puro, sem banco nem rede, para carregar no cliente e ser testado
// sem infraestrutura.

const MINUTES_IN_HOUR = 60;
const MINUTES_IN_DAY = 1440;

export const DAYS = "days";
export const HOURS = "hours";

export function humanizeOffset(minutes) {
  if (minutes % MINUTES_IN_DAY === 0) {
    const days = minutes / MINUTES_IN_DAY;
    return days === 1 ? "1 dia" : `${days} dias`;
  }

  if (minutes % MINUTES_IN_HOUR === 0) {
    const hours = minutes / MINUTES_IN_HOUR;
    return hours === 1 ? "1 hora" : `${hours} horas`;
  }

  return `${minutes} minutos`;
}

// Escolhe a maior unidade que representa o valor sem resto, que é como uma
// pessoa leria: 2880 é "2 dias", não "48 horas".
export function minutesToParts(minutes) {
  if (minutes % MINUTES_IN_DAY === 0) {
    return { value: minutes / MINUTES_IN_DAY, unit: DAYS };
  }

  return { value: Math.round(minutes / MINUTES_IN_HOUR), unit: HOURS };
}

export function partsToMinutes(value, unit) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return unit === DAYS ? amount * MINUTES_IN_DAY : amount * MINUTES_IN_HOUR;
}

function joinInPortuguese(parts) {
  if (parts.length === 1) {
    return parts[0];
  }

  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

// A frase que o usuário lê antes de salvar. Não é enfeite: é como ele
// confere que entendeu a própria configuração — vale mais que qualquer
// ícone na tela.
export function describeSchedule({
  enabled,
  reminders = [],
  sendAtTime,
  immediate = false,
}) {
  if (!enabled) {
    return "Você não receberá este aviso.";
  }

  if (immediate) {
    return "Você receberá este aviso assim que acontecer.";
  }

  if (reminders.length === 0) {
    return "Escolha pelo menos um aviso ou desligue este tipo.";
  }

  const ordered = [...reminders].sort((a, b) => b - a);
  const quantidade =
    ordered.length === 1 ? "1 aviso" : `${ordered.length} avisos`;
  const antecedencias = joinInPortuguese(ordered.map(humanizeOffset));

  return `Você receberá ${quantidade}: ${antecedencias} antes, às ${sendAtTime}.`;
}
