import type { Config } from "jest";

export default {
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  setupFiles: ["jest-canvas-mock"],
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
  transformIgnorePatterns: [],
} satisfies Config;
