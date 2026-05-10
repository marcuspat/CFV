/**
 * dependency-cruiser configuration for CFV.
 *
 * Enforces the architectural rules from ADR-0016 (Hexagonal architecture for
 * bounded contexts) and ADR-0002 (DDD adoption). Initially in WARN mode per
 * the Phase 0 exit criterion in docs/ddd/14-implementation-roadmap.md;
 * graduates to ERROR per Phase 10.
 *
 * Run via: npx depcruise --config .dependency-cruiser.cjs src
 */
module.exports = {
  forbidden: [
    {
      name: "no-domain-importing-infrastructure",
      severity: "warn",
      comment:
        "ADR-0016: domain/ must depend on nothing. Infrastructure leaks " +
        "(DB clients, ORM types, HTTP clients) belong in infrastructure/.",
      from: { path: "^src/server/contexts/[^/]+/domain" },
      to: {
        path: [
          "^src/server/contexts/[^/]+/infrastructure",
          "^src/server/contexts/[^/]+/interfaces",
          "^src/server/contexts/[^/]+/application",
          "^src/server/middleware",
          "^src/server/routes",
          "^src/server/services",
        ],
      },
    },
    {
      name: "no-domain-importing-frameworks",
      severity: "warn",
      comment: "ADR-0016: domain/ may not import HTTP/DB/3rd-party frameworks.",
      from: { path: "^src/server/contexts/[^/]+/domain" },
      to: {
        path: [
          "^node_modules/express",
          "^node_modules/pg",
          "^node_modules/neo4j-driver",
          "^node_modules/redis",
          "^node_modules/jsonwebtoken",
          "^node_modules/bcryptjs",
          "^node_modules/@radix-ui",
        ],
      },
    },
    {
      name: "no-application-importing-infrastructure",
      severity: "warn",
      comment:
        "ADR-0016: application/ depends on domain/ and ports only; " +
        "infrastructure adapters are wired in at the composition root.",
      from: { path: "^src/server/contexts/[^/]+/application" },
      to: { path: "^src/server/contexts/[^/]+/infrastructure" },
    },
    {
      name: "no-cross-context-internals",
      severity: "warn",
      comment:
        "Context Map (docs/ddd/03-...): no context may reach into another " +
        "context's domain/ or infrastructure/. Use the published port " +
        "(application/) or the published-language event payload.",
      from: { path: "^src/server/contexts/([^/]+)/" },
      to: {
        path: "^src/server/contexts/([^/]+)/(domain|infrastructure)",
        pathNot: [
          "^src/server/contexts/$1/", // same context is fine
        ],
      },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies are bugs.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment: "Orphan modules tend to be dead code.",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$",
          "\\.d\\.ts$",
          "(^|/)tsconfig\\.json$",
          "(^|/)(jest|playwright|babel|webpack|tsup|tsdown|rollup|vite|vitest)\\.config\\.(js|cjs|mjs|ts|json)$",
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
