// Lint rules for the app. Type-safety, hook and import rules are errors. Accessibility and
// react-refresh rules are warnings (`bun run lint:report` prints the counts). Formatting is
// checked by Prettier on its own, not by ESLint.
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

/**
 * The plugin's recommended accessibility rules, as warnings. Rules the recommended set turns off stay
 * off, and the deprecated label-has-for is dropped (label-has-associated-control covers it).
 */
const A11Y_AS_WARNINGS = Object.fromEntries(
  Object.entries(jsxA11y.configs.recommended.rules).map(([rule, setting]) => {
    const level = Array.isArray(setting) ? setting[0] : setting;
    const off = level === "off" || level === 0 || rule === "jsx-a11y/label-has-for";
    return [rule, off ? "off" : "warn"];
  }),
);

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
      "no-useless-escape": "error",
      "import-x/no-cycle": "error",
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/set-state-in-effect": "error",
      ...A11Y_AS_WARNINGS,
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
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: VENDORED,
    rules: {
      "@typescript-eslint/consistent-type-assertions": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "react-refresh/only-export-components": "off",
      "react-hooks/set-state-in-effect": "off",
      ...Object.fromEntries(Object.keys(jsxA11y.configs.recommended.rules).map((r) => [r, "off"])),
    },
  },
);
