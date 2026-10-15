import js from "@eslint/js";
import globals from "globals";

const unusedVariables = {
  ignoreRestSiblings: true,
  argsIgnorePattern: "^_",
  varsIgnorePattern: "^_",
  caughtErrorsIgnorePattern: "^_",
};

export default [
  {
    ignores: [
      ".harness-state/",
      ".local/",
      ".scratch/",
      "challenge/",
      "node_modules/",
      "dist/",
      "tv/dist/",
      "film/",
      "promo/",
      "media/",
      "design/",
      "experiments/",
      "screenshots/",
      "prototypes/",
      "tests/fixtures/",
      "docs/",
      ".claude/",
      ".codex/",
      ".agents/",
      "scripts/check.mjs",
      "scripts/quality/",
      "scripts/loop/",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,cjs,mjs}"],
    linterOptions: { noInlineConfig: true },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": ["error", unusedVariables],
      complexity: ["error", 15],
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }],
      "no-nested-ternary": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": "error",
    },
  },
  {
    files: ["**/*.{js,cjs,mjs}"],
    ignores: ["app/ui/**", "app/*.js", "tv/app/**/*.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
  },
  {
    files: ["app/ui/**", "app/*.js"],
    languageOptions: { sourceType: "module", globals: globals.browser },
  },
  {
    files: ["tv/app/**/*.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: { ...globals.browser, module: "readonly" },
    },
    rules: {
      "no-unused-vars": ["error", { ...unusedVariables, vars: "local" }],
    },
  },
  {
    files: ["scripts/**"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ["app/main.cjs", "server/main.cjs", "scripts/**"],
    rules: { "no-console": "off" },
  },
  {
    files: ["tests/**"],
    rules: { "max-lines": "off", "max-lines-per-function": "off" },
  },
];
