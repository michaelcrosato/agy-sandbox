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
    // TypeScript-migration allowances (Phase 2). The migration converts the
    // server-side sources from JS to TS to make them COMPILE as TypeScript
    // under `strict: false` / `noImplicitAny: false`; complete typing is a
    // documented follow-up, so implicit and explicit `any` are expected here.
    // Align the two rules that otherwise fight this with the project's
    // established JS conventions:
    // - `no-explicit-any` off: `any` is the intended placeholder while the
    //   type surface is filled in incrementally (matches `noImplicitAny:false`).
    // - `no-unused-vars` mirrors the base JS rule below (warn, `_`-prefix ignore)
    //   instead of the stricter recommended error, so behaviour is identical
    //   across `.js` and `.ts`.
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Shared language options + project rules for all files.
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        // Test suites import their APIs explicitly from "vitest" (globals:
        // false), so no test-runner globals are injected here.
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
