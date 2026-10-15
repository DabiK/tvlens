// Formes de commandes observées dans les flux Codex : shell enveloppant, subprocess et Path.write_text en Python.
// Cette lecture statique ne cherche pas à interpréter du code arbitraire et n'exécute rien.
import { commandPhase } from "./commands.mjs";
import { PHASES } from "./phases.mjs";

const SHELL = /^(?:[^\s]*\/)?(?:bash|zsh|sh)\s+-[a-z]*c[a-z]*\s+(['"])([\s\S]*)\1$/;
const PYTHON = /\bpython(?:3)?\s+-\s+<<-?\s*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2(?=\n|$)/g;
const VERDICT_WRITE = /^\s*(?:Path\(['"][^'"\n]*verdict\.json['"]\)|\(\w+\s*\/\s*['"]verdict\.json['"]\))\.write_text\(/m;
const LITERAL_LIST = /\[(\s*(?:'[^'\n]*'|"[^"\n]*")\s*(?:,\s*(?:'[^'\n]*'|"[^"\n]*")\s*)*)\]/g;
const STRING = /'([^'\n]*)'|"([^"\n]*)"/g;
const ASSIGNMENT = /^\s*(\w+)\s*=\s*(?=\[)/gm;

/** La liste affectée, jusqu'au crochet fermant ; les crochets dans les chaînes ne la terminent pas. */
function arrayAt(text, start) {
  let depth = 0;
  let quote = null;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = null;
    } else if (char === "'" || char === '"') quote = char;
    else if (char === "[") depth++;
    else if (char === "]" && --depth === 0) return text.slice(start, index + 1);
  }
  return "";
}

function passedToSubprocess(body, name) {
  return new RegExp(String.raw`\bsubprocess\.run\(\s*${name}\s*[,)]`).test(body);
}

function executedLists(body) {
  const lists = [];
  for (const assignment of body.matchAll(ASSIGNMENT)) {
    const name = assignment[1];
    const loop = new RegExp(String.raw`\bfor\s+(\w+)\s+in\s+${name}\s*:`).exec(body);
    if (passedToSubprocess(body, name) || (loop && passedToSubprocess(body, loop[1]))) {
      lists.push(arrayAt(body, assignment.index + assignment[0].length));
    }
  }
  for (const call of body.matchAll(/\bsubprocess\.run\(\s*(?=\[)/g)) lists.push(arrayAt(body, call.index + call[0].length));
  return lists;
}

function pythonPhase(body) {
  if (VERDICT_WRITE.test(body)) return PHASES.verdict;
  for (const list of executedLists(body)) {
    for (const literal of list.matchAll(LITERAL_LIST)) {
      const command = [...literal[1].matchAll(STRING)].map((part) => part[1] ?? part[2]).join(" ");
      const phase = commandPhase(command);
      if (phase) return phase;
    }
  }
  return null;
}

export function codexCommandPhase(command) {
  const wrapper = SHELL.exec(command);
  const text = wrapper ? wrapper[2] : command;
  for (const heredoc of text.matchAll(PYTHON)) {
    const phase = pythonPhase(heredoc[3]);
    if (phase) return phase;
  }
  return commandPhase(text);
}
