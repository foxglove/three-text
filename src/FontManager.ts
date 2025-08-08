import TinySDF from "@mapbox/tiny-sdf";
import { EventDispatcher } from "three";

export type CharInfo = {
  atlasX: number;
  atlasY: number;
  width: number;
  height: number;
  yOffset: number;
  xAdvance: number;
};
export type AtlasData = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  charInfo: Record<string, CharInfo>;
  maxAscent: number;
  lineHeight: number;
};
export type CharLayoutInfo = {
  left: number;
  top: number;
  width: number;
  height: number;
  xAdvance: number;
  boxTop: number;
  boxHeight: number;
  atlasX: number;
  atlasY: number;
};
export type LayoutInfo = {
  width: number;
  height: number;
  chars: CharLayoutInfo[];
};

const REPLACEMENT_CHARACTER = "\uFFFD";

export type FontManagerOptions = {
  fontFamily?: string;
  fontSize?: number;
};

type EventMap = {
  atlasChange: object;
  error: { error: Error };
};

/**
 * Manages the creation of a Signed Distance Field (SDF) font atlas, and performs text layout to
 * generate attributes for rendering text using the atlas.
 */
export class FontManager extends EventDispatcher<EventMap> {
  private alphabet = "";
  atlasData: AtlasData = {
    data: new Uint8ClampedArray(1024 * 1024),
    width: 1024,
    height: 1024,
    lineHeight: 0,
    maxAscent: 0,
    charInfo: {},
  };
  #buffer: number;
  #tinysdf: TinySDF;
  #lastCharPosition = { x: 0, y: 0, rowHeight: 0 };

  constructor(public readonly options: FontManagerOptions = {}) {
    super();

    this.options.fontSize = this.options.fontSize ?? 48;
    this.#buffer = Math.ceil(this.options.fontSize / 16);
    const fontFamily = this.options.fontFamily ?? "monospace";
    this.#tinysdf = new TinySDF({
      fontSize: this.options.fontSize,
      buffer: this.#buffer,
      radius: Math.ceil(this.options.fontSize / 4),
      fontFamily,
    });

    const start = " ".charCodeAt(0);
    const end = "~".charCodeAt(0);
    let initialAlphabet = REPLACEMENT_CHARACTER + "\n"; // always include replacement character
    for (let i = start; i <= end; i++) {
      initialAlphabet += String.fromCodePoint(i);
    }
    this.update(initialAlphabet);
  }

  update(newChars: string): void {
    let needsUpdate = false;
    let newAlphabet = "";
    for (const char of newChars) {
      if (!this.alphabet.includes(char)) {
        newAlphabet += char;
        needsUpdate = true;
      }
    }

    if (!needsUpdate) {
      return;
    }
    const atlas = this.atlasData.data;

    const charInfo: Record<string, CharInfo> = this.atlasData.charInfo;
    for (const char of newAlphabet) {
      if (charInfo[char] != undefined) {
        this.dispatchEvent({
          type: "error",
          error: new Error(
            `Duplicate character in alphabet: ${char} (${char.codePointAt(0) ?? "undefined"})`,
          ),
        });
        continue;
      }
      const sdf = this.#tinysdf.draw(char);
      if (this.#lastCharPosition.x + sdf.width >= this.atlasData.width) {
        this.#lastCharPosition.x = 0;
        this.#lastCharPosition.y += this.#lastCharPosition.rowHeight;
        this.#lastCharPosition.rowHeight = 0;
      }
      if (this.#lastCharPosition.y + sdf.height >= this.atlasData.height) {
        this.dispatchEvent({
          type: "error",
          error: new Error(
            `Unable to fit all ${this.alphabet.length + newAlphabet.length} characters in font atlas`,
          ),
        });
        continue;
      }
      this.#lastCharPosition.rowHeight = Math.max(this.#lastCharPosition.rowHeight, sdf.height);
      this.atlasData.lineHeight = Math.max(
        this.atlasData.lineHeight,
        this.#lastCharPosition.rowHeight,
      );
      for (let r = 0; r < sdf.height; r++) {
        atlas.set(
          sdf.data.subarray(sdf.width * r, sdf.width * (r + 1)),
          this.atlasData.width * (this.#lastCharPosition.y + r) + this.#lastCharPosition.x,
        );
      }
      this.atlasData.charInfo[char] = {
        atlasX: this.#lastCharPosition.x,
        atlasY: this.#lastCharPosition.y,
        width: sdf.width,
        height: sdf.height,
        yOffset: sdf.glyphTop,
        // Use the full width in order to avoid character overlaps and z-fighting. Use glyphAdvance
        // if it is larger than width (e.g. for space characters). Subtract 1x the buffer so we
        // don't end up with *too* much space between characters.
        xAdvance: Math.max(sdf.glyphAdvance, sdf.width - this.#buffer),
      };
      this.atlasData.maxAscent = Math.max(this.atlasData.maxAscent, sdf.glyphTop);
      this.#lastCharPosition.x += sdf.width;
    }

    this.alphabet += newAlphabet;

    this.dispatchEvent({ type: "atlasChange" });
  }

  layout(text: string): LayoutInfo {
    const chars: CharLayoutInfo[] = [];
    let x = 0;
    let lineTop = 0;
    let width = 0;
    let height = 0;
    for (const char of text) {
      if (char === "\n") {
        lineTop += this.atlasData.lineHeight;
        x = 0;
      } else {
        const info =
          this.atlasData.charInfo[char] ?? this.atlasData.charInfo[REPLACEMENT_CHARACTER]!;
        chars.push({
          left: x,
          top: lineTop - info.yOffset + this.atlasData.maxAscent,
          boxTop: lineTop,
          boxHeight: this.atlasData.lineHeight,
          width: info.width,
          height: info.height,
          xAdvance: info.xAdvance,
          atlasX: info.atlasX,
          atlasY: info.atlasY,
        });
        x += info.xAdvance;
        width = Math.max(width, x);
        height = Math.max(height, lineTop + this.atlasData.lineHeight);
      }
    }
    return { chars, width, height };
  }
}
