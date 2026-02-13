import * as THREE from "three";

import type { ILabelMaterial } from "./ILabelMaterial.ts";
import type { LabelPoolBase } from "./LabelPoolBase.ts";

/**
 * Since THREE.js r151, InstancedMesh supports bounding sphere calculations using instanceMatrix.
 * However, Label does not use instanceMatrix and the resulting bounding spheres are have NaN
 * values. Instead, fall back to using the (non-instanced) bounding sphere of the geometry, which at
 * least provides a semi-correct value based on the label's `position`.
 */
class InstancedMeshWithBasicBoundingSphere extends THREE.InstancedMesh {
  override computeBoundingSphere(): void {
    this.geometry.computeBoundingSphere();
    const boundingSphere = this.geometry.boundingSphere;
    if (boundingSphere) {
      (this.boundingSphere ??= new THREE.Sphere()).copy(boundingSphere);
    }
  }
}

export abstract class Label extends THREE.Object3D {
  #text = "";
  mesh: THREE.InstancedMesh;
  geometry: THREE.InstancedBufferGeometry;
  material: ILabelMaterial;
  pickingMaterial: ILabelMaterial;

  #instanceAttrData: Float32Array;
  #instanceAttrBuffer: THREE.InstancedInterleavedBuffer;

  #instanceBoxPosition: THREE.InterleavedBufferAttribute;
  #instanceCharPosition: THREE.InterleavedBufferAttribute;
  #instanceUv: THREE.InterleavedBufferAttribute;
  #instanceBoxSize: THREE.InterleavedBufferAttribute;
  #instanceCharSize: THREE.InterleavedBufferAttribute;

  #lineHeight = 1;

  protected abstract createMaterial(atlasTexture: THREE.DataTexture): ILabelMaterial;
  protected abstract createPickingMaterial(): ILabelMaterial;

  public labelPool: LabelPoolBase;

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

  constructor(labelPool: LabelPoolBase) {
    super();
    this.labelPool = labelPool;

    this.geometry = new THREE.InstancedBufferGeometry();

    this.geometry.setAttribute("position", Label.QUAD_POSITIONS);
    this.geometry.setAttribute("uv", Label.QUAD_UVS);

    this.#instanceAttrData = new Float32Array();
    this.#instanceAttrBuffer = new THREE.InstancedInterleavedBuffer(this.#instanceAttrData, 10, 1);
    this.#instanceBoxPosition = new THREE.InterleavedBufferAttribute(
      this.#instanceAttrBuffer,
      2,
      0,
    );
    this.#instanceCharPosition = new THREE.InterleavedBufferAttribute(
      this.#instanceAttrBuffer,
      2,
      2,
    );
    this.#instanceUv = new THREE.InterleavedBufferAttribute(this.#instanceAttrBuffer, 2, 4);
    this.#instanceBoxSize = new THREE.InterleavedBufferAttribute(this.#instanceAttrBuffer, 2, 6);
    this.#instanceCharSize = new THREE.InterleavedBufferAttribute(this.#instanceAttrBuffer, 2, 8);
    this.geometry.setAttribute("instanceBoxPosition", this.#instanceBoxPosition);
    this.geometry.setAttribute("instanceCharPosition", this.#instanceCharPosition);
    this.geometry.setAttribute("instanceUv", this.#instanceUv);
    this.geometry.setAttribute("instanceBoxSize", this.#instanceBoxSize);
    this.geometry.setAttribute("instanceCharSize", this.#instanceCharSize);

    this.material = this.createMaterial(labelPool.atlasTexture);
    this.pickingMaterial = this.createPickingMaterial();

    this.mesh = new InstancedMeshWithBasicBoundingSphere(this.geometry, this.material, 1);
    this.mesh.userData.pickingMaterial = this.pickingMaterial;

    this.add(this.mesh);

    labelPool.addEventListener("scaleFactorChange", () => {
      // Trigger recalculation of scale uniform
      this.setLineHeight(this.#lineHeight);
    });

    labelPool.addEventListener("atlasChange", () => {
      this._handleAtlasChange();
    });
    this._handleAtlasChange();
  }

  private _handleAtlasChange() {
    this.material.setTextureSize(
      this.labelPool.atlasTexture.image.width,
      this.labelPool.atlasTexture.image.height,
    );
    this.pickingMaterial.setTextureSize(
      this.labelPool.atlasTexture.image.width,
      this.labelPool.atlasTexture.image.height,
    );
    this.setLineHeight(this.#lineHeight);
    this._needsUpdateLayout = true;
    this._updateLayoutIfNeeded();
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.pickingMaterial.dispose();
    this.mesh.dispose();
  }

  private reallocateAttributeBufferIfNeeded(numChars: number) {
    const requiredLength = numChars * 10 * Float32Array.BYTES_PER_ELEMENT;
    if (this.#instanceAttrData.byteLength < requiredLength) {
      this.#instanceAttrData = new Float32Array(requiredLength);
      this.#instanceAttrBuffer = new THREE.InstancedInterleavedBuffer(
        this.#instanceAttrData,
        10,
        1,
      );
      this.#instanceBoxPosition = new THREE.InterleavedBufferAttribute(
        this.#instanceAttrBuffer,
        2,
        0,
      );
      this.#instanceCharPosition = new THREE.InterleavedBufferAttribute(
        this.#instanceAttrBuffer,
        2,
        2,
      );
      this.#instanceUv = new THREE.InterleavedBufferAttribute(this.#instanceAttrBuffer, 2, 4);
      this.#instanceBoxSize = new THREE.InterleavedBufferAttribute(this.#instanceAttrBuffer, 2, 6);
      this.#instanceCharSize = new THREE.InterleavedBufferAttribute(this.#instanceAttrBuffer, 2, 8);
      this.geometry.setAttribute("instanceBoxPosition", this.#instanceBoxPosition);
      this.geometry.setAttribute("instanceCharPosition", this.#instanceCharPosition);
      this.geometry.setAttribute("instanceUv", this.#instanceUv);
      this.geometry.setAttribute("instanceBoxSize", this.#instanceBoxSize);
      this.geometry.setAttribute("instanceCharSize", this.#instanceCharSize);
    }
  }

  setText(text: string): void {
    if (text !== this.#text) {
      this.#text = text;
      this._needsUpdateLayout = true;
      this.labelPool.updateAtlas(text);
      this._updateLayoutIfNeeded();
    }
  }

  private _needsUpdateLayout = false;
  private _updateLayoutIfNeeded() {
    if (!this._needsUpdateLayout) {
      return;
    }
    const layoutInfo = this.labelPool.fontManager.layout(this.#text);
    this.material.setLabelSize(layoutInfo.width, layoutInfo.height);
    this.pickingMaterial.setLabelSize(layoutInfo.width, layoutInfo.height);

    this.geometry.instanceCount = this.mesh.count = layoutInfo.chars.length;

    this.reallocateAttributeBufferIfNeeded(layoutInfo.chars.length);

    let i = 0;
    for (const char of layoutInfo.chars) {
      // instanceBoxPosition
      this.#instanceAttrData[i++] = char.left;
      this.#instanceAttrData[i++] = layoutInfo.height - char.boxTop - char.boxHeight;
      // instanceCharPosition
      this.#instanceAttrData[i++] = char.left;
      this.#instanceAttrData[i++] =
        layoutInfo.height - char.boxTop - char.boxHeight + char.top - char.boxTop;
      // instanceUv
      this.#instanceAttrData[i++] = char.atlasX;
      this.#instanceAttrData[i++] = char.atlasY;
      // instanceBoxSize
      this.#instanceAttrData[i++] = char.xAdvance;
      this.#instanceAttrData[i++] = char.boxHeight;
      // instanceCharSize
      this.#instanceAttrData[i++] = char.width;
      this.#instanceAttrData[i++] = char.height;
    }
    this.#instanceAttrBuffer.needsUpdate = true;
    this._needsUpdateLayout = false;
  }

  /** Values should be in working (linear-srgb) color space */
  setColor(r: number, g: number, b: number, a = 1): void {
    this.material.setColor(r, g, b, a);
  }

  /** Values should be in working (linear-srgb) color space */
  setBackgroundColor(r: number, g: number, b: number, a = 1): void {
    this.material.setBackgroundColor(r, g, b, a);
  }

  // eslint-disable-next-line @foxglove/no-boolean-parameters
  setBillboard(billboard: boolean): void {
    this.material.setBillboard(billboard);
    this.pickingMaterial.setBillboard(billboard);
  }

  /**
   * Enable or disable size attenuation. Setting this to `false` also requires that billboarding is
   * enabled.
   */
  // eslint-disable-next-line @foxglove/no-boolean-parameters
  setSizeAttenuation(sizeAttenuation: boolean): void {
    this.material.setSizeAttenuation(sizeAttenuation);
    this.pickingMaterial.setSizeAttenuation(sizeAttenuation);
  }

  setAnchorPoint(x: number, y: number): void {
    this.material.setAnchorPoint(x, y);
    this.pickingMaterial.setAnchorPoint(x, y);
  }

  setLineHeight(lineHeight: number): void {
    this.#lineHeight = lineHeight;
    const scale =
      (this.#lineHeight * this.labelPool.scaleFactor) /
      this.labelPool.fontManager.atlasData.lineHeight;
    this.material.setScale(scale);
    this.pickingMaterial.setScale(scale);
  }
}
