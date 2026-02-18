import * as THREE from "three";

import type { FontManagerOptions } from "./FontManager.ts";
import { FontManager } from "./FontManager.ts";
import type { Label } from "./Label.ts";

type EventMap = {
  scaleFactorChange: object;
  atlasChange: object;
  error: { error: Error };
};

export abstract class LabelPoolBase extends THREE.EventDispatcher<EventMap> {
  atlasTexture: THREE.DataTexture;

  private availableLabels: Label[] = [];
  private disposed = false;

  fontManager: FontManager;
  scaleFactor = 1;

  protected abstract createLabel(): Label;

  constructor(options: FontManagerOptions = {}) {
    super();
    this.fontManager = new FontManager(options);

    this.atlasTexture = new THREE.DataTexture(
      new Uint8ClampedArray(),
      0,
      0,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
      THREE.UVMapping,
      THREE.ClampToEdgeWrapping,
      THREE.ClampToEdgeWrapping,
      THREE.LinearFilter,
      THREE.LinearFilter,
    );

    this.fontManager.addEventListener("error", (event) => {
      this.dispatchEvent(event);
    });
    this.fontManager.addEventListener("atlasChange", () => {
      this._updateAtlasTexture();
    });
    this._updateAtlasTexture();
  }

  setScaleFactor(scaleFactor: number): void {
    this.scaleFactor = scaleFactor;
    this.dispatchEvent({ type: "scaleFactorChange" });
  }

  updateAtlas(text: string): void {
    this.fontManager.update(text);
  }

  private _updateAtlasTexture() {
    const data = new Uint8ClampedArray(this.fontManager.atlasData.data.length * 4);
    for (let i = 0; i < this.fontManager.atlasData.data.length; i++) {
      data[i * 4 + 0] = data[i * 4 + 1] = data[i * 4 + 2] = 1;
      data[i * 4 + 3] = this.fontManager.atlasData.data[i]!;
    }

    this.atlasTexture.image = {
      data,
      width: this.fontManager.atlasData.width,
      height: this.fontManager.atlasData.height,
    };
    this.atlasTexture.needsUpdate = true;
    this.dispatchEvent({ type: "atlasChange" });
  }

  acquire(): Label {
    return this.availableLabels.pop() ?? this.createLabel();
  }

  release(label: Label): void {
    if (this.disposed) {
      label.dispose();
    } else {
      label.removeFromParent();
      this.availableLabels.push(label);
    }
  }

  dispose(): void {
    for (const label of this.availableLabels) {
      label.dispose();
    }
    this.atlasTexture.dispose();
    this.disposed = true;
  }
}
