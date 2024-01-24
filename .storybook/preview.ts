export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
  chromatic: {
    // Detect any visual differences, no matter how small
    // https://www.chromatic.com/docs/threshold
    diffThreshold: 0,
    diffIncludeAntiAliasing: true,
  },
};
