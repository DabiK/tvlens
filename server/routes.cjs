const { createStateRoutes } = require("./state-routes.cjs");
const { createSurveillanceRoutes } = require("./surveillance-routes.cjs");
const { createSessionRoutes } = require("./session-routes.cjs");
const { createQuestionRoutes } = require("./question-routes.cjs");
const { createIngestRoutes } = require("./ingest-routes.cjs");

function createRoutes(dependencies) {
  return [
    ...createStateRoutes(dependencies),
    ...createSurveillanceRoutes(dependencies),
    ...createSessionRoutes(dependencies),
    ...createQuestionRoutes(dependencies),
    ...createIngestRoutes(dependencies),
  ];
}

async function dispatchRoute(routes, context) {
  for (const route of routes) {
    if (route.method !== context.req.method) continue;
    const path = context.url.pathname;
    let params;
    if (route.path) params = route.path === path ? [] : null;
    else params = path.match(route.pattern)?.slice(1);
    if (!params) continue;
    await route.handler({ ...context, params });
    return true;
  }
  return false;
}

module.exports = { createRoutes, dispatchRoute };
