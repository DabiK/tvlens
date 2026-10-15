import { PHASES } from "./phases.mjs";

// Le corps d'un heredoc est du texte écrit dans un fichier (le journal du ticket cite souvent les commandes) : il ne s'exécute pas.
const HEREDOC = /<<-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g;
const withoutHeredocs = (command) => command.replace(HEREDOC, (match, quote, tag, rest) => `<<${tag}${rest}`);

// Une commande qui lance le script : `node` au début d'un segment, pas un `grep` ou un `cat` qui nomme le fichier.
const COMMAND_START = String.raw`(?:^|[\s;&|(])`;
const RECORD_COMMAND = new RegExp(String.raw`${COMMAND_START}node\s+(?:[^\s;&|]+\s+)*?[^\s;&|]*reviewed-state\.mjs\s+record\b`);
const CHECK_COMMAND = new RegExp(String.raw`${COMMAND_START}(?:node\s+(?:[^\s;&|]+\s+)*?[^\s;&|]*scripts/check\.mjs|npm\s+run\s+check)\b([^\n;&|)]*)`, "g");
const PARTIAL_CHECK = /--no-tests|--changed|--file|--help|(^|\s)-h(\s|$)/;
const VERDICT_REDIRECTION = /(?:>>?|\btee\s+(?:-a\s+)?)\s*["']?\S*verdict\.json/;

export function commandPhase(command) {
  const text = withoutHeredocs(command);
  if (VERDICT_REDIRECTION.test(text)) return PHASES.verdict;
  if (RECORD_COMMAND.test(text)) return PHASES.record;
  for (const check of text.matchAll(CHECK_COMMAND)) {
    if (!PARTIAL_CHECK.test(check[1])) return PHASES.check;
  }
  return null;
}

