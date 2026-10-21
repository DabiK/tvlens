// Lit les appels à ssh, scp et rsync d'une commande pour dire s'ils ne visent que des machines de confiance.
// Comme le reste des gardes, c'est une lecture du texte : une cible qu'elle ne sait pas lire (variable,
// sous-commande, option qui redirige vers une autre machine ou lance un autre programme) n'est pas de confiance.

/** Début d'un appel à ssh, scp ou rsync : en tête de commande ou après un séparateur. */
export const REMOTE_ACCESS = /(^|[;&|]\s*)(ssh|scp|rsync)\s/;

// Options qui prennent une valeur, et celles qui peuvent mener ailleurs que la cible écrite.
const SSH = { values: "BbcDEeFIiJLlmOoPpQRSWw", redirects: "FJW" };
const SCP = { values: "cDFiJloPSX", redirects: "DFJS" };
const REDIRECTING_OPTION = /^\s*(hostname|proxycommand|proxyjump|localcommand)\b/i;

/** Mots de la commande à partir de `start`, guillemets retirés, jusqu'au premier séparateur hors guillemets. */
function words(text, start) {
  const found = [];
  let word = null;
  let quote = null;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = null;
      else word += char;
    } else if (char === "\\") {
      word = (word ?? "") + (text[++i] ?? "");
    } else if (char === "'" || char === '"') {
      quote = char;
      word ??= "";
    } else if (/[;&|()`\n]/.test(char)) {
      break;
    } else if (/\s/.test(char)) {
      if (word !== null) found.push(word);
      word = null;
    } else {
      word = (word ?? "") + char;
    }
  }
  if (word !== null) found.push(word);
  return found;
}

/** Opérandes qui suivent les options d'un client ssh ou scp, ou null si une option peut viser une autre machine. */
function operands(args, client) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") return args.slice(i + 1);
    if (!/^-./.test(arg)) return args.slice(i);
    for (let j = 1; j < arg.length; j++) {
      const flag = arg[j];
      if (!client.values.includes(flag)) continue;
      const value = j + 1 < arg.length ? arg.slice(j + 1) : (args[++i] ?? "");
      if (client.redirects.includes(flag) || (flag === "o" && REDIRECTING_OPTION.test(value))) return null;
      break;
    }
  }
  return [];
}

/** Machine d'un opérande distant de scp ou rsync (`hôte:chemin`, `hôte::module`, `scp://hôte/…`), sinon null. */
function operandHost(arg) {
  const url = arg.match(/^(?:scp|rsync|ssh):\/\/(?:[^@/]*@)?([^/:]+)/);
  if (url) return url[1];
  return arg.match(/^(?:[^@/:]*@)?([^/:]+):/)?.[1] ?? null;
}

function sshHosts(args) {
  const rest = operands(args, SSH);
  if (!rest?.length) return null;
  return [rest[0].replace(/^ssh:\/\//, "").replace(/^.*@/, "").replace(/:\d*$/, "")];
}

function scpHosts(args) {
  const hosts = operands(args, SCP)?.map(operandHost).filter(Boolean);
  return hosts?.length ? hosts : null;
}

/** Machines visées par rsync, ou null si son transport n'est pas un ssh sans redirection. */
function rsyncHosts(args) {
  const hosts = [];
  for (let i = 0; i < args.length; i++) {
    const shell = args[i] === "-e" || args[i] === "--rsh" ? (args[++i] ?? "") : args[i].match(/^(?:-e|--rsh=)(.+)$/)?.[1];
    if (shell !== undefined) {
      const [program, ...options] = shell.trim().split(/\s+/);
      if (program !== "ssh" || operands(options, SSH)?.length !== 0) return null;
    } else if (!args[i].startsWith("-")) {
      const host = operandHost(args[i]);
      if (host) hosts.push(host);
    }
  }
  return hosts.length ? hosts : null;
}

const HOSTS = { ssh: sshHosts, scp: scpHosts, rsync: rsyncHosts };

/** Vrai si chaque appel à ssh, scp ou rsync de la commande ne vise que des machines de `trusted`. */
export function onlyTrustedHosts(command, trusted) {
  for (const match of command.matchAll(new RegExp(REMOTE_ACCESS.source, "g"))) {
    const [program, ...args] = words(command, match.index + match[1].length);
    const hosts = HOSTS[program](args);
    if (!hosts?.every((host) => trusted.has(host))) return false;
  }
  return true;
}
