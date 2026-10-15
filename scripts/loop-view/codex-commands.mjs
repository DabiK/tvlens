// Lecture statique, sans exécution : commandes shell et enveloppes sh/bash/zsh -c, avec segments cités concaténés.
// Dans les heredocs python/python3 : chaînes simples, triples ou brutes ; listes littérales passées à subprocess.run,
// affectées par = ou += puis exécutées directement ou via for (nom ou enumerate(nom)), ou écrites dans le for lui-même.
// Sont aussi lues les chaînes littérales passées à subprocess.run avec shell=True et les écritures de verdict par
// Path('…verdict.json').write_text ou (nom / 'verdict.json').write_text. Toute autre forme Python n'est pas lue.
import { commandPhase } from "./commands.mjs";
import { PHASES } from "./phases.mjs";

const SHELL = /^(?:[^\s]*\/)?(?:bash|zsh|sh)\s+-[a-z]*c[a-z]*\s+([\s\S]+)$/;
const PYTHON = /\bpython(?:3)?\s+-\s+<<-?\s*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2(?=\n|$)/g;
const VERDICT_WRITE = /^\s*(?:Path\(['"][^'"\n]*verdict\.json['"]\)|\(\w+\s*\/\s*['"]verdict\.json['"]\))\.write_text\(/m;
const SINGLE_STRING = String.raw`'(?:\\[^\n]|[^'\\\n])*'|"(?:\\[^\n]|[^"\\\n])*"`;
const TRIPLE_STRING = String.raw`'''(?:\\[\s\S]|(?!''')[^\\])*'''|"""(?:\\[\s\S]|(?!""")[^\\])*"""`;
const STRING_SOURCE = `[rR]?(?:${TRIPLE_STRING}|${SINGLE_STRING})`;
const STRING = new RegExp(STRING_SOURCE, "g");
const STRING_AT = new RegExp(`^${STRING_SOURCE}`);
const LITERAL_LIST = new RegExp(String.raw`\[(\s*${STRING_SOURCE}\s*(?:,\s*${STRING_SOURCE}\s*)*),?\s*\]`, "g");
const ASSIGNMENT = /^\s*(\w+)\s*(?:=|\+=)\s*(?=\[)/gm;
const SHELL_OPTION = /\bshell\s*=\s*True\b/;

/** Retire les guillemets d'un mot shell, sans évaluer ses substitutions. */
function shellWord(source) {
  let quote = null;
  let text = "";
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === quote) quote = null;
    else if (!quote && (char === "'" || char === '"')) quote = char;
    else if (char === "\\" && quote !== "'") {
      const next = source[index + 1];
      if (next === undefined) return null;
      if (!quote || '\\"$`\n'.includes(next)) {
        if (next !== "\n") text += next;
        index++;
      } else text += char;
    } else if (!quote && /\s/.test(char)) return null;
    else text += char;
  }
  return quote ? null : text;
}

/** Bloc délimité équilibré ; les délimiteurs dans les chaînes ne le terminent pas. */
function blockAt(text, start, open = "[", close = "]") {
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (char === "'" || char === '"') {
      const literal = STRING_AT.exec(text.slice(index));
      if (!literal) return "";
      index += literal[0].length - 1;
    } else if (char === open) depth++;
    else if (char === close && --depth === 0) return text.slice(start, index + 1);
  }
  return "";
}

function subprocessArguments(body, name) {
  const call = new RegExp(String.raw`\bsubprocess\.run\(\s*${name}\s*(?=[,)])`).exec(body);
  return call && blockAt(body, body.indexOf("(", call.index), "(", ")");
}

function executedLists(body) {
  const lists = [];
  const sources = [...body.matchAll(ASSIGNMENT)].map((assignment) => ({
    name: assignment[1], text: blockAt(body, assignment.index + assignment[0].length),
  }));
  for (const loop of body.matchAll(/\bfor\s+(\w+)\s+in\s+(?=\[)/g)) {
    const start = loop.index + loop[0].length;
    const text = blockAt(body, start);
    if (text && /^\s*:/.test(body.slice(start + text.length))) sources.push({ name: loop[1], text });
  }
  for (const { name, text } of sources) {
    const source = String.raw`(?:${name}|enumerate\(\s*${name}\s*\))`;
    const loop = new RegExp(String.raw`\bfor\s+(?:\w+\s*,\s*)?(\w+)\s+in\s+${source}\s*:`).exec(body);
    const calls = [subprocessArguments(body, name), loop && subprocessArguments(body, loop[1])];
    for (const call of calls.filter(Boolean)) {
      lists.push({ text, arguments: call });
    }
  }
  for (const call of body.matchAll(/\bsubprocess\.run\(\s*/g)) {
    const start = call.index + call[0].length;
    const literal = STRING_AT.exec(body.slice(start));
    let text = literal?.[0] ?? "";
    if (body[start] === "[") text = blockAt(body, start);
    if (!text || !/^\s*[,)]/.test(body.slice(start + text.length))) continue;
    const open = body.indexOf("(", call.index);
    const args = blockAt(body, open, "(", ")").slice(start - open + text.length);
    if (literal && !SHELL_OPTION.test(args)) continue;
    lists.push({ text: literal ? `[${text}]` : text, arguments: args });
  }
  return lists;
}

function pythonPhase(body) {
  if (VERDICT_WRITE.test(body)) return PHASES.verdict;
  for (const list of executedLists(body)) {
    const shell = SHELL_OPTION.test(list.arguments);
    for (const literal of list.text.matchAll(LITERAL_LIST)) {
      const strings = [...literal[1].matchAll(STRING)].map(([source]) => {
        const text = source.replace(/^[rR]/, "");
        const width = text.startsWith("'''") || text.startsWith('"""') ? 3 : 1;
        return text.slice(width, -width);
      });
      const commands = shell ? strings : [strings.join(" ")];
      for (const command of commands) {
        const phase = commandPhase(command);
        if (phase) return phase;
      }
    }
  }
  return null;
}

export function codexCommandPhase(command) {
  const wrapper = SHELL.exec(command);
  const text = wrapper ? shellWord(wrapper[1]) ?? command : command;
  for (const heredoc of text.matchAll(PYTHON)) {
    const phase = pythonPhase(heredoc[3]);
    if (phase) return phase;
  }
  return commandPhase(text);
}
