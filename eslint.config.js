// Lint rules for the app. Rules that still have findings start at "warn" and move to "error"
// once their count reaches 0 (`bun run lint:report` prints the counts). Formatting is checked
// by Prettier on its own, not by ESLint.
import js from "@eslint/js";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import importX from "eslint-plugin-import-x";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

const root = import.meta.dirname;

/** Test and tooling files, where casts are allowed. */
const TEST_FILES = ["tests/**", "**/*.test.{ts,tsx}", "scripts/e2e/**"];

/** TanStack Start marks server-only modules by file name, not with the Next.js package. */
const SERVER_ONLY = {
  name: "server-only",
  message:
    "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
};

/** Vendored shadcn/ui components. They follow upstream and are left as they are. */
const VENDORED = ["src/components/ui/**"];

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", ".nitro", ".tanstack", "src/routeTree.gen.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "import-x": importX,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver({ alwaysTryTypes: true, project: `${root}/tsconfig.json` }),
      ],
      "import-x/extensions": [".ts", ".tsx", ".js", ".jsx", ".mjs"],
      "import-x/parsers": { "@typescript-eslint/parser": [".ts", ".tsx"] },
    },
    rules: {
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-restricted-imports": ["error", { paths: [SERVER_ONLY] }],
      "no-useless-escape": "warn",
      "import-x/no-cycle": "warn",
      "@typescript-eslint/consistent-type-assertions": ["warn", { assertionStyle: "never" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "warn",
      ...Object.fromEntries(Object.keys(jsxA11y.configs.recommended.rules).map((r) => [r, "warn"])),
      // Deprecated by the plugin; label-has-associated-control covers it.
      "jsx-a11y/label-has-for": "off",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [SERVER_ONLY],
          patterns: [
            { group: ["../../*"], message: "Import through the @/ alias instead of ../../." },
          ],
        },
      ],
    },
  },
  {
    files: TEST_FILES,
    rules: {
      "@typescript-eslint/consistent-type-assertions": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: VENDORED,
    rules: {
      "@typescript-eslint/consistent-type-assertions": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "react-refresh/only-export-components": "off",
      "react-hooks/set-state-in-effect": "off",
      ...Object.fromEntries(Object.keys(jsxA11y.configs.recommended.rules).map((r) => [r, "off"])),
    },
  },
);
