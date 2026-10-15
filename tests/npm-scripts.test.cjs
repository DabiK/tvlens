const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const payingScriptFiles = new Set([
  "probe-live.cjs",
  "probe-verify.cjs",
  "evaluate-actions.cjs",
  "probe-retrieval.cjs",
  "compare-inspection-strategies.cjs",
  "probe-codex-speed.cjs",
  "capture-showcase.mjs",
]);

function scriptSuffixViolations(scripts) {
  const violations = [];
  for (const [name, command] of Object.entries(scripts)) {
    const paying = command.split(/\s+/).some((argument) => {
      return (
        payingScriptFiles.has(path.basename(argument)) ||
        argument.startsWith("--live-")
      );
    });
    if (paying && !name.endsWith(":live")) {
      violations.push(`${name} : ajouter le suffixe :live (commande payante).`);
    } else if (!paying && name.endsWith(":live")) {
      violations.push(`${name} : retirer le suffixe :live (commande hors ligne).`);
    }
  }
  return violations;
}

test("npm probe names end with :live if and only if their commands use real providers", () => {
  const { scripts } = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
  );
  const violations = scriptSuffixViolations(scripts);

  assert.deepEqual(violations, [], violations.join("\n"));
});

test("invented scripts report missing and unnecessary suffixes and allow local inspection", () => {
  const violations = scriptSuffixViolations({
    "probe:x": "node scripts/probe-verify.cjs",
    "x:live": "node scripts/smoke-electron.mjs",
    "test:electron:sheets": "node scripts/smoke-electron.mjs --local-inspection",
    "new:offline": "node scripts/new-offline.cjs --some-option",
  });

  assert.equal(violations.length, 2);
  assert.match(violations[0], /^probe:x : ajouter le suffixe :live/);
  assert.match(violations[1], /^x:live : retirer le suffixe :live/);
});

test("live options require the suffix even for an unknown script and option", () => {
  const violations = scriptSuffixViolations({
    "probe:custom": "node scripts/new-probe.cjs --live-custom=value",
    "probe:custom:live": "node scripts/new-probe.cjs --live-custom=value",
  });

  assert.equal(violations.length, 1);
  assert.match(violations[0], /^probe:custom : ajouter le suffixe :live/);
});

test("similarly named files and local flags do not count as paid commands", () => {
  assert.deepEqual(
    scriptSuffixViolations({
      "probe:backup": "node scripts/probe-verify.cjs.bak",
      "probe:local": "node scripts/smoke-electron.mjs --local-inspection --inspection-strategy=sheets-crop",
      "probe:report": "node scripts/report-live.cjs",
    }),
    [],
  );
});
