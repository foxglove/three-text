// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createDefaultEsmPreset } = require("ts-jest");

/** @type {import("ts-jest").JestConfigWithTsJest} */
module.exports = {
  ...createDefaultEsmPreset({}),
  setupFiles: ["jest-canvas-mock"],
};
