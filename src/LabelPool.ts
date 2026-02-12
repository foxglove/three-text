import * as THREE from "three";
import { EventDispatcher } from "three";

import type { FontManagerOptions } from "./FontManager.ts";
import { FontManager } from "./FontManager.ts";
import { Label } from "./Label.ts";

/**
 * Since THREE.js r151, InstancedMesh supports bounding sphere calculations using instanceMatrix.
 * However, Label does not use instanceMatrix and the resulting bounding spheres are have NaN
 * values. Instead, fall back to using the (non-instanced) bounding sphere of the geometry, which at
 * least provides a semi-correct value based on the label's `position`.
 */
export class InstancedMeshWithBasicBoundingSphere extends THREE.InstancedMesh {
  override computeBoundingSphere(): void {
    this.geometry.computeBoundingSphere();
    const boundingSphere = this.geometry.boundingSphere;
    if (boundingSphere) {
      (this.boundingSphere ??= new THREE.Sphere()).copy(boundingSphere);
    }
  }
}

type EventMap = {
  scaleFactorChange: object;
  atlasChange: object;
  error: { error: Error };
};

export class LabelPool extends EventDispatcher<EventMap> {
  atlasTexture: THREE.DataTexture;

  private availableLabels: Label[] = [];
  private disposed = false;

  static QUAD_POINTS: THREE.Vector3Tuple[] = [
    [0, 0, 0],
    [0, 1, 0],
    [1, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
  ];
  static QUAD_POSITIONS = new THREE.BufferAttribute(new Float32Array(this.QUAD_POINTS.flat()), 3);
  static QUAD_UVS = new THREE.BufferAttribute(
    new Float32Array(this.QUAD_POINTS.flatMap(([x, y]) => [x, 1 - y])),
    2,
  );

  fontManager: FontManager;
  scaleFactor = 1;

  setScaleFactor(scaleFactor: number): void {
    this.scaleFactor = scaleFactor;
    this.dispatchEvent({ type: "scaleFactorChange" });
  }

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
    return this.availableLabels.pop() ?? new Label(this);
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
