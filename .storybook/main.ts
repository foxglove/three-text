import { type StorybookConfig } from "@storybook/react-webpack5";
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|ts|tsx)"],
  addons: ["@storybook/addon-essentials"],
  framework: {
    name: "@storybook/react-webpack5",
    options: {},
  },
  typescript: {
    check: true,
  },

  core: {},
};
module.exports = config;
