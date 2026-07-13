import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Base JS recommended rules apply to every file.
  js.configs.recommended,
  // typescript-eslint recommended rules apply to .ts files only. There are no
  // .ts files yet (Phase 0 keeps src as .js); this is inert but ready so that
  // later migration phases lint TypeScript sources without further config work.
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommended],
  },
  // Shared language options + project rules for all files.
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        // jest globals retained so the current Jest suites lint cleanly; a later
        // phase moves the client to vitest and can drop these.
        ...globals.jest,
        ...globals.browser,
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-console": "off",
    },
  },
);
