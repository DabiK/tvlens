// Technical confinement shared by every Codex child process. A prompt is never the control: what a
// role can reach is decided here (launch flags, child environment, private directories, the thread
// parameters checked against the App Server's own answer, host-side allow-lists). What it achieves
// with a given Codex and model version is established by scripts/probe-confinement.cjs, not by
// reading this file.
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

// One list for the App Server roles and `codex exec`. The model catalog decides most of the tool
// surface: `unified_exec` and `multi_agent` stay exposed whatever is passed here. These flags only
// remove what they were observed to remove; they are not the proof of anything.
const DISABLED_FEATURES = [
  "shell_tool",
  "unified_exec",
  "shell_snapshot",
  "apps",
  "plugins",
  "hooks",
  "computer_use",
  "browser_use",
  "view_image",
  "image_generation",
  "multi_agent",
  "multi_agent_v2",
  "memories",
  "skill_search",
  "goals",
  "sleep_tool",
  "tool_suggest",
];
const ENABLED_FEATURES = ["skip_host_skill_discovery"];
// Settings that keep a thread from creating a sub-agent. The model catalog forces the multi-agent
// tools on whatever `--disable multi_agent*` says, so these are configuration keys, not features.
// Measured on codex 0.160.1 against a scripted provider and a real model (SECURITY.md): the first
// removes the six collaboration tools from what the model is given, and an undeclared call is
// answered "unsupported call"; the second leaves one thread slot, the root's own, and a creation is
// answered "agent thread limit reached". Either is enough; both are passed.
const SUB_AGENT_CONTROLS = [
  ["agents.enabled", false],
  ["features.multi_agent_v2.max_concurrent_threads_per_session", 1],
];
const controlArg = ([key, value]) => ["-c", `${key}=${value}`];

function parseFeatures(text) {
  const names = new Set();
  for (const line of String(text).split("\n")) {
    const match = line.match(/^([a-z][a-z0-9_.]*)\s.*\s(?:true|false)\s*$/);
    if (match) names.add(match[1]);
  }
  // Not a feature table (another program, an error text): answer "unknown" rather than an empty set
  // that would silently drop every flag.
  return names.size >= 5 ? names : null;
}

// Runs the installed binary on a throw-away directory and resolves to what it prints. Never the real
// CODEX_HOME: these commands write there.
async function runCodex(binary, args, timeout = 5000) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tvlens-codex-probe-"));
  try {
    const env = childEnvironment(process.env, { codexHome: dir, home: dir });
    return await new Promise((resolve, reject) => {
      const child = execFile(
        binary,
        args,
        { cwd: dir, env, timeout, maxBuffer: 1000000 },
        (error, stdout) => (error ? reject(error) : resolve(stdout)),
      );
      child.stdin?.end();
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
// `overrides`: launch arguments to load the configuration with. The command loads and validates it
// like the App Server does, and exits on a key it cannot place.
const listFeatures = (binary, overrides = []) => runCodex(binary, ["features", "list", ...overrides]);

const versionCache = new Map();
// What is installed, for the message of a refused connection only: never asked on a connection that
// succeeds. Resolves to a short label ("codex-cli 0.160.1") or to null; a failure is not remembered.
function codexVersion(binary = "codex", run = runCodex) {
  if (versionCache.has(binary)) return versionCache.get(binary);
  const pending = Promise.resolve()
    .then(() => run(binary, ["--version"], 2000))
    // Goes into a message the viewer reads: one line, a plain label, or nothing.
    .then((text) => String(text).trim().split("\n")[0].match(/^[\w .+-]{1,60}$/)?.[0] || null, () => null);
  versionCache.set(binary, pending);
  pending.then((version) => {
    if (!version) versionCache.delete(binary);
  });
  return pending;
}

const featureCache = new Map();
// How long an answer that comes from an incident, not from the binary, is kept before the binary is
// asked again. Short: while it lasts every connection is refused (see subAgentRefusal).
const FEATURE_RETRY_MS = 10000;
// A program that ends by itself with a status has answered: that is how Codex refuses a key it
// cannot place. A timeout, a signal or a spawn that fails says nothing about the binary.
const answeredNo = (error) => typeof error?.code === "number" && !error.killed && !error.signal;
// A key Codex cannot place stops it at start too (measured: 0.139.0 to 0.144.5 read `agents.enabled`
// as an agent role and refuse to load): each setting is tried apart, with the flags the launch will
// carry, and kept only if the installed binary loads its configuration with it. `untried`: the
// settings whose trial ended without an answer of the binary; they are not taken for refused.
async function acceptedControls(binary, run, names) {
  const flags = featureArgs(names);
  const outcome = await Promise.all(
    SUB_AGENT_CONTROLS.map((control) =>
      Promise.resolve()
        .then(() => run(binary, [...flags, ...controlArg(control)]))
        .then(
          (text) => (parseFeatures(text) ? "accepted" : "untried"),
          (error) => (answeredNo(error) ? "refused" : "untried"),
        ),
    ),
  );
  const keys = (state) => new Set(SUB_AGENT_CONTROLS.filter((_, index) => outcome[index] === state).map(([key]) => key));
  return { controls: keys("accepted"), untried: keys("untried") };
}
// Codex exits at start on a flag name it does not know, and its stderr is discarded: ask the
// installed binary which names exist. Resolves to a Set, or to null when it cannot be asked. The
// Set carries `controls`, the sub-agent settings this binary accepts (see subAgentArgs), and
// `untried`, those it could not be asked about.
function knownFeatures(binary = "codex", run = listFeatures, now = Date.now) {
  const cached = featureCache.get(binary);
  if (cached && !(cached.retryAt !== undefined && now() >= cached.retryAt)) return cached.pending;
  const entry = {
    pending: Promise.resolve()
      .then(() => run(binary))
      .then(parseFeatures, () => null)
      .then(async (names) => (names ? Object.assign(names, await acceptedControls(binary, run, names)) : names)),
  };
  featureCache.set(binary, entry);
  // An answer of the binary is kept for the life of the host. An incident (the listing, or the
  // trial of one setting) is kept FEATURE_RETRY_MS only: asking again on every connection would add
  // up to five seconds to each of them on a host where the command hangs, and keeping it for good
  // would turn one passing failure into a refusal that lasts until the host restarts.
  entry.pending.then((known) => {
    if (!known || known.untried.size) entry.retryAt = now() + FEATURE_RETRY_MS;
  });
  return entry.pending;
}

// `known` null means "could not ask": every flag is passed, so an incompatible binary fails at
// start instead of running with a wider surface than intended.
function featureArgs(known = null) {
  const keep = (name) => !known || known.has(name);
  return [
    ...DISABLED_FEATURES.filter(keep).flatMap((name) => ["--disable", name]),
    ...ENABLED_FEATURES.filter(keep).flatMap((name) => ["--enable", name]),
  ];
}
function skippedFeatures(known = null) {
  return known
    ? [...DISABLED_FEATURES, ...ENABLED_FEATURES].filter(
        (name) => !known.has(name),
      )
    : [];
}
// Unlike the flags, nothing is passed when the binary could not be asked or accepts no setting: a
// key Codex cannot place would only stop it at start, with a discarded stderr for all explanation.
// The client then refuses the connection itself, with a reason (subAgentRefusal). What is passed is
// not what is applied: see inspectSubAgents.
function subAgentArgs(known = null) {
  return SUB_AGENT_CONTROLS.filter(([key]) => known?.controls?.has(key)).flatMap(controlArg);
}
// Reads the effective configuration the App Server reports (config/read). "blocked": Codex itself
// states at least one setting that forbids a creation (named in `subAgentControls`). "not-blocked":
// it states none, or none was passed. "unknown": settings were passed and Codex did not say what it
// applies. That a stated setting does prevent a creation is measured per Codex version, not here.
// Never throws.
function inspectSubAgents(config, passed = true) {
  if (!passed) return { subAgents: "not-blocked", subAgentControls: [] };
  if (!config || typeof config !== "object") return { subAgents: "unknown", subAgentControls: [] };
  const read = (key) => key.split(".").reduce((value, part) => (value && typeof value === "object" ? value[part] : undefined), config);
  const controls = SUB_AGENT_CONTROLS.filter(([key, value]) => read(key) === value).map(([key]) => key);
  return { subAgents: controls.length ? "blocked" : "not-blocked", subAgentControls: controls };
}
// The only Codex version on which the two settings were measured to prevent a creation (SECURITY.md).
const SUB_AGENT_MEASURED_VERSION = "0.160.1";
// Why the block is not confirmed. Before any process exists: the binary answered no to both
// settings ("refused"), or it could not be asked ("unreachable"). Once Codex runs: it did not answer
// config/read ("silent"), or its answer states none of the settings it was given ("unstated").
const SUB_AGENT_CAUSES = {
  refused: "n’accepte aucun des deux réglages qui interdisent la création de sous-agents",
  unreachable: `n’a pas pu être interrogé sur les réglages qui interdisent la création de sous-agents (« codex features list » en échec ; nouvel essai dans ${FEATURE_RETRY_MS / 1000} s)`,
  silent: "n’a pas répondu à config/read : les réglages qui interdisent la création de sous-agents ne sont pas relus",
  unstated: "ne déclare pas, dans la configuration qu’il relit (config/read), les réglages qui interdisent la création de sous-agents",
};
const unconfirmedCause = (known) => (!known || known.untried?.size ? "unreachable" : "refused");
// One sentence: what is not confirmed, and on which Codex. Shared by the refusal and by the line the
// diagnostic mode writes. `version`: codexVersion, null when unknown.
function subAgentFinding({ version, cause }) {
  return `le Codex installé (${version || "version inconnue"}) ${SUB_AGENT_CAUSES[cause] || SUB_AGENT_CAUSES.unstated}`;
}
// What the viewer or the operator reads when a connection is refused: the finding, where the block
// was measured, and the two ways out. The diagnostic mode is named for what it is.
function subAgentRefusal(finding) {
  const sentence = subAgentFinding(finding);
  return `Confinement Codex non confirmé (sous-agents) : connexion refusée. ${sentence[0].toUpperCase()}${sentence.slice(1)}. Ce blocage a été mesuré sur codex-cli ${SUB_AGENT_MEASURED_VERSION}. Mets Codex à jour puis relance TVLens ; à défaut, le mode diagnostic se demande explicitement et n’est pas confiné : TVLENS_CODEX_CONFINEMENT=report.`;
}

const ENVIRONMENT_KEYS = [
  "PATH",
  "HOME",
  "CODEX_HOME",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
];
// Allow-list: no provider key, device token or TVLENS_* setting ever reaches a Codex child.
// `home` points HOME away from the user's files (host skills, dotfiles). TVLENS_CODEX_REAL_HOME=1
// keeps the real one, should Codex authentication need it on some platform.
function childEnvironment(parent = process.env, { codexHome, home } = {}) {
  const env = Object.fromEntries(
    ENVIRONMENT_KEYS.filter((key) => parent[key]).map((key) => [
      key,
      parent[key],
    ]),
  );
  if (codexHome) env.CODEX_HOME = codexHome;
  if (home && parent.TVLENS_CODEX_REAL_HOME !== "1") env.HOME = home;
  return env;
}

const CONTEXT_PREFIXES = [
  "tvlens-codex-session-",
  "tvlens-verify-",
  "tvlens-codex-probe-",
];
// One private tree per Codex process. The model's working directory (`context`) stays empty and is
// neither the credential directory (`codexHome`, links to the real auth files) nor HOME (`home`).
async function createContext(prefix, authHome, root = os.tmpdir()) {
  const dir = await fs.mkdtemp(path.join(root, prefix));
  try {
    const tree = {
      dir,
      context: path.join(dir, "context"),
      codexHome: path.join(dir, "home"),
      home: path.join(dir, "user"),
    };
    for (const sub of [tree.context, tree.codexHome, tree.home])
      await fs.mkdir(sub, { mode: 0o700 });
    // Lets a later sweep tell a crashed owner from a live one.
    await fs.writeFile(path.join(dir, "owner"), String(process.pid), {
      mode: 0o600,
    });
    const source =
      authHome || process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    for (const name of ["auth.json", "models_cache.json"]) {
      try {
        await fs.access(path.join(source, name));
        await fs.symlink(
          path.join(source, name),
          path.join(tree.codexHome, name),
        );
      } catch {
        // Le démarrage accepte l'absence de ces fichiers hors du contexte de travail ;
        // Codex peut ensuite refuser l'authentification sans auth.json utilisable.
        // Limite conservée : un refus d'accès ou de lien est aussi toléré, sans diagnostic
        // distinct d'une absence ; aucun accès de remplacement n'est accordé ici.
      }
    }
    return tree;
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true });
    throw error;
  }
}

async function ownerAlive(dir) {
  try {
    const pid = Number(await fs.readFile(path.join(dir, "owner"), "utf8"));
    if (!Number.isInteger(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return error?.code === "EPERM";
  }
}
// A crash leaves private trees behind, each holding links to the credentials. Hosts call this once
// at start. A tree whose owner process is alive is never touched, whatever its age. Never throws;
// resolves to the names removed.
async function sweepStaleContexts(
  root = os.tmpdir(),
  maxAgeMs = 24 * 60 * 60 * 1000,
  now = Date.now(),
) {
  const removed = [];
  let names = [];
  try {
    names = await fs.readdir(root);
  } catch {
    return removed;
  }
  for (const name of names) {
    if (!CONTEXT_PREFIXES.some((prefix) => name.startsWith(prefix))) continue;
    const dir = path.join(root, name);
    try {
      const stat = await fs.lstat(dir);
      if (!stat.isDirectory() || now - stat.mtimeMs < maxAgeMs) continue;
      if (await ownerAlive(dir)) continue;
      // Removes the links, never the credential files they point to.
      await fs.rm(dir, { recursive: true, force: true });
      removed.push(name);
    } catch {
      // Un candidat disparu ou non supprimable ne doit pas empêcher le balayage des suivants.
      // Seules les suppressions réussies sont rendues dans removed ; un résidu peut rester,
      // avec ses liens privés, jusqu'à un autre balayage. Le refus n'est pas diagnostiqué ici.
    }
  }
  return removed;
}

// Reads the App Server's answer to thread/start. `confined` is false when Codex states something
// else than what was asked; `verified` is false when it does not state it at all (another version,
// a test double). A field that is merely absent is never a contradiction. Never throws.
function inspectThread(result, { environmentAccess = false } = {}) {
  const reasons = [];
  if (result?.approvalPolicy !== undefined && result.approvalPolicy !== "never")
    reasons.push("approbation");
  const sandbox = result?.sandbox;
  if (
    sandbox &&
    ((sandbox.type != null && sandbox.type !== "readOnly") ||
      (sandbox.networkAccess != null && sandbox.networkAccess !== false))
  )
    reasons.push("bac à sable");
  const environments = result?.thread?.environments;
  if (!environmentAccess) {
    if (Array.isArray(environments) && environments.length)
      reasons.push("environnement");
    if (
      Array.isArray(result?.runtimeWorkspaceRoots) &&
      result.runtimeWorkspaceRoots.length
    )
      reasons.push("racines de travail");
  }
  if (
    Array.isArray(result?.instructionSources) &&
    result.instructionSources.length
  )
    reasons.push("instructions de projet");
  // Every field the host relies on must be stated: a sandbox without `networkAccess` (another
  // Codex version) confirms nothing about the network, and is not a refusal either.
  const verified =
    result?.approvalPolicy !== undefined &&
    sandbox?.type != null &&
    sandbox.networkAccess != null &&
    (environmentAccess || Array.isArray(environments));
  return { confined: reasons.length === 0, verified, reasons };
}

// What a role may ever be given; the client's own settings can only narrow it.
const ROLES = {
  chat: { web: true, tools: true },
  surveillance: { web: true, tools: false },
  // Manual fact check: the web is its only instrument, it is never handed a video tool.
  verifier: { web: true, tools: false },
  analysis: { web: false, tools: false },
};
function assertRole({ role, webSearch = false, toolDefinitions = [] }) {
  const ceiling = ROLES[role];
  if (!ceiling) throw Error(`Rôle Codex inconnu : ${String(role).slice(0, 40)}.`);
  if ((webSearch && !ceiling.web) || (toolDefinitions.length && !ceiling.tools))
    throw Error(`Rôle Codex ${role} : web ou outils non permis.`);
}
// Item types that carry no capability. Everything else must be earned below.
const BASE_ITEMS = [
  "userMessage",
  "reasoning",
  "agentMessage",
  "plan",
  "contextCompaction",
  "functionCallOutput",
];
// Allow-list of thread items. The host cannot prevent what the runtime does; it refuses to continue
// a turn in which anything outside the role appears. Blind to calls made inside the model's code
// tool: it complements the environment-less thread, it does not replace it.
function itemAllowed({ role, webSearch = false, toolDefinitions = [] }, item) {
  const type = item?.type;
  const ceiling = ROLES[role] || ROLES.analysis;
  if (BASE_ITEMS.includes(type)) return true;
  if (type === "webSearch") return Boolean(webSearch) && ceiling.web;
  if (type === "dynamicToolCall")
    return (
      ceiling.tools &&
      item.namespace == null &&
      toolDefinitions.some((tool) => tool.name === item.tool)
    );
  return false;
}
// Items Codex publishes on the parent thread when a sub-agent exists. Measured against a scripted
// provider: `subAgentActivity` can reach the host before any notification of the new thread does.
const SUB_AGENT_ITEMS = ["subAgentActivity", "collabAgentToolCall"];
// Former deny-list, kept only as the TVLENS_CODEX_ITEM_GUARD=legacy fallback.
const LEGACY_BLOCKED_ITEMS = [
  "commandExecution",
  "fileChange",
  "collabAgentToolCall",
  "mcpToolCall",
];
// Server requests that only exist because the runtime attempted something outside every role.
const APPROVAL_REQUESTS = [
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
  "mcpServer/elicitation/request",
  "applyPatchApproval",
  "execCommandApproval",
];
const MAX_TOOL_ARGUMENTS = 4096;
function toolArgumentsAllowed(value) {
  try {
    return (JSON.stringify(value ?? null) || "").length <= MAX_TOOL_ARGUMENTS;
  } catch {
    return false;
  }
}

const IMAGE_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
// The protocol also accepts local paths (localImage, localAudio), remote URLs, skills and mentions:
// each would let a caller make the runtime read a file or fetch a page. Inline images only.
function validMediaInput(items) {
  return (
    Array.isArray(items) &&
    items.every(
      (item) =>
        item &&
        typeof item === "object" &&
        item.type === "image" &&
        typeof item.url === "string" &&
        IMAGE_DATA_URL.test(item.url) &&
        Object.keys(item).every((key) => ["type", "url", "detail"].includes(key)),
    )
  );
}

// Pages a completed web-search item really opened. One open may render several pages: `action.url`
// names the first, `results` lists them all (references `turn1view0`, `turn1view1`, …), and the
// model cites any of them. Counting `action.url` alone discards sources that were read. What a
// search lists (`turn0search3`) is a snippet, never an opened page: a search action opens nothing,
// whatever it carries. Shape measured on codex 0.160.1: `open_page` in the `codex exec` events,
// `openPage` from the App Server. A reference format this does not recognise falls back to the
// first page only.
function openedPages(item) {
  const action = item?.action;
  const urls = new Set();
  // Without a stated action nothing is credited; a search lists results and opens nothing.
  if (!action || typeof action !== "object" || action.type === "search") return [];
  if (typeof action.url === "string" && action.url) urls.add(action.url);
  // A page really rendered is referenced `turnNviewM`; a search listing is `turnNsearchM`. The App Server
  // (0.160.1, measured on a real turn) reports a grouped open by reference as an action of type "other",
  // without any address: the views are then the only trace of what was opened. The reference decides,
  // not the name of the action; a search never opens anything.
  if (Array.isArray(item.results))
    for (const result of item.results)
      if (
        typeof result?.url === "string" &&
        result.url &&
        /^turn\d+view\d+$/.test(result.ref_id)
      )
        urls.add(result.url);
  return [...urls];
}

module.exports = {
  DISABLED_FEATURES,
  ENABLED_FEATURES,
  SUB_AGENT_CONTROLS,
  SUB_AGENT_MEASURED_VERSION,
  FEATURE_RETRY_MS,
  parseFeatures,
  knownFeatures,
  codexVersion,
  featureArgs,
  skippedFeatures,
  subAgentArgs,
  inspectSubAgents,
  unconfirmedCause,
  subAgentFinding,
  subAgentRefusal,
  childEnvironment,
  createContext,
  sweepStaleContexts,
  inspectThread,
  ROLES,
  assertRole,
  itemAllowed,
  SUB_AGENT_ITEMS,
  LEGACY_BLOCKED_ITEMS,
  APPROVAL_REQUESTS,
  toolArgumentsAllowed,
  validMediaInput,
  openedPages,
};
