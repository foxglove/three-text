import { type StorybookConfig } from "@storybook/core-common";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|ts|tsx)"],
  addons: ["@storybook/addon-essentials"],
  framework: "@storybook/react",
  typescript: {
    check: true,
    reactDocgen: false, // https://github.com/storybookjs/storybook/issues/21642
  },
  core: {
    builder: "webpack5",
  },
  features: {
    // Tell Storybook to use our own babel config rather than providing a default
    babelModeV7: true,
  },
};

module.exports = config;
