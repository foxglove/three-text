import foxglove from "@foxglove/eslint-plugin";
import { defineConfig } from "eslint/config";
import storybook from "eslint-plugin-storybook";
import globals from "globals";

export default defineConfig(
  {
    ignores: ["**/dist", "!.storybook"],
  },
  {
    languageOptions: {
      parserOptions: {
        project: "tsconfig.eslint.json",
      },
    },
  },
  ...foxglove.configs.base,
  ...foxglove.configs.jest,
  ...foxglove.configs.typescript,
  ...foxglove.configs.react,
  ...storybook.configs["flat/recommended"],
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },

    rules: {
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { disallowTypeAnnotations: false }],
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@foxglove/prefer-hash-private": "off",
      "import/extensions": ["error", "ignorePackages", { checkTypeImports: true }],
    },
  },
  {
    files: ["**/*.stories.tsx", ".storybook/**/*"],
    rules: {
      "filenames/match-exported": "off",
    },
  },
);
