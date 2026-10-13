/** Pure wording helpers shared by the Mac view models. No DOM, no Electron: importable from Node tests. */

const finite = value => (Number.isFinite(value) ? value : null);
const two = value => String(value).padStart(2, '0');

/** French agreement: 0 and 1 are singular. The word alone, for what follows a count written elsewhere. */
export function agree(count, one, many = `${one}s`) {
  return count > 1 ? many : one;
}

/** A count and its word, agreed: "0 passage", "1 passage", "2 passages". */
export function plural(count, one, many) {
  return `${count} ${agree(count, one, many)}`;
}

// The sentences of the core that still carry "(s)", each with the words that identify it.
const CORE_COUNT = /(\d+) ((?:interruption\(s\) (?:sans passage consultable|de capture)|passage\(s\) (?:encore en analyse|sans analyse exploitable|avec une analyse partielle|récent\(s\) en attente|pas encore indexé\(s\))|résumé\(s\) plus ancien\(s\) non inclus|image\(s\) sur \d))/g;

/**
 * Limits of an answer, of the recap or of a search mix sentences of the core, some still written
 * "3 passage(s) récent(s)", with sentences of the agent. Only the known sentences of the core are agreed, with
 * the count written just before them. Whatever the agent wrote, "(s)" included, stays as it was written.
 */
export function agreeText(text) {
  return String(text ?? '').replace(CORE_COUNT, (whole, count, words) => `${count} ${words.replace(/\(s\)/g, Number(count) > 1 ? 's' : '')}`);
}

/** Position in a video or elapsed time: "01:01", and "1:30:00" past the hour (a film is longer than 60 minutes). */
export function formatClock(ms) {
  const total = Math.max(0, Math.floor((finite(ms) ?? 0) / 1000));
  const hours = Math.floor(total / 3600), minutes = Math.floor(total / 60) % 60, seconds = total % 60;
  return hours ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}

/** A ceiling in words, derived from the value really enforced: whole minutes when exact, otherwise seconds rounded up. */
export function formatLimit(ms) {
  if (!(finite(ms) > 0)) return '';
  if (ms >= 3600000 && ms % 3600000 === 0) return `${ms / 3600000} h`;
  if (ms >= 60000 && ms % 60000 === 0) return `${ms / 60000} min`;
  return `${Math.max(1, Math.ceil(ms / 1000))} s`;
}

/** Length of a session: "45 s", "4 min", "1 h 32". */
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor((finite(ms) ?? 0) / 1000));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${two(minutes % 60)}`;
}

/** Same wording from a number of minutes (the disk guard estimates in minutes). */
export function formatMinutes(minutes) {
  return formatDuration((finite(minutes) ?? 0) * 60000);
}

/** Disk volume in French units, decimal comma: "1,2 Go". Unknown stays empty rather than "0 o". */
export function formatBytes(bytes) {
  // null and NaN are "not measured", not zero: `null >= 0` would say otherwise.
  if (finite(bytes) === null || bytes < 0) return '';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let value = bytes, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  const text = unit >= 3 && value < 100 ? value.toFixed(1).replace('.', ',').replace(/,0$/, '') : String(Math.round(value));
  return `${text} ${units[unit]}`;
}

/** "12 oct. 21:04". The time zone is an option so that tests do not depend on the machine. */
export function formatDay(at, { timeZone } = {}) {
  const date = new Date(at);
  if (at == null || Number.isNaN(date.getTime())) return '';
  const part = options => new Intl.DateTimeFormat('fr-FR', { timeZone, ...options }).format(date);
  return `${part({ day: 'numeric', month: 'short' })} ${part({ hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

/**
 * Electron rewrites a rejected IPC call as "Error invoking remote method '<channel>': Error: <message>".
 * Only that exact prefix is removed: a business message that contains "Error:" further on stays intact.
 */
export function cleanError(error) {
  const text = typeof error === 'string' ? error : error?.message || String(error ?? '');
  return text.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '').trim() || 'Erreur inattendue.';
}
