/** @jest-environment jsdom */

import { FontManager } from "./FontManager.ts";

describe("FontManager", () => {
  it("emits error events", () => {
    const fontManager = new FontManager({ fontSize: 500 });
    const errors: Error[] = [];
    fontManager.addEventListener("error", (err) => errors.push(err.error));
    for (let i = 0; i < 1000; i++) {
      fontManager.update(String.fromCodePoint(i));
      if (errors.length > 0) {
        break;
      }
    }
    expect(errors).toEqual([new Error("Unable to fit all 226 characters in font atlas")]);
  });
});
