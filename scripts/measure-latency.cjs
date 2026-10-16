const { createScenario, CASES } = require("./latency-scenario.cjs");
const { report, formatTable } = require("./latency-trace.cjs");

async function measureLatency(options = {}) {
  const cases = [];
  for (const id of CASES) {
    const scenario = await createScenario({ id, ...options });
    cases.push(await scenario.run());
  }
  return report(cases);
}

if (require.main === module) {
  measureLatency()
    .then((result) => {
      process.stdout.write(
        process.argv.includes("--json")
          ? JSON.stringify(result) + "\n"
          : formatTable(result),
      );
    })
    .catch((error) => {
      process.stderr.write(error.message + "\n");
      process.exitCode = 1;
    });
}
module.exports = { createScenario, measureLatency, formatTable };
