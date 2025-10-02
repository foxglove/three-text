import foxglove from "@foxglove/eslint-plugin";
import storybook from "eslint-plugin-storybook";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
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
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@foxglove/prefer-hash-private": "off",
    },
  },
  {
    files: ["**/*.stories.tsx", ".storybook/**/*"],
    rules: {
      "filenames/match-exported": "off",
    },
  },
);
