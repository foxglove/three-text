import * as THREE from "three";

import { LabelMaterial } from "./LabelMaterial.ts";
import { LabelPool } from "./LabelPool.ts";

const tempVec2 = new THREE.Vector2();

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

export class Label extends THREE.Object3D {
  text = "";
  mesh: THREE.InstancedMesh;
  geometry: THREE.InstancedBufferGeometry;
  material: LabelMaterial;
  pickingMaterial: LabelMaterial;

  instanceAttrData: Float32Array;
  instanceAttrBuffer: THREE.InstancedInterleavedBuffer;

  instanceBoxPosition: THREE.InterleavedBufferAttribute;
  instanceCharPosition: THREE.InterleavedBufferAttribute;
  instanceUv: THREE.InterleavedBufferAttribute;
  instanceBoxSize: THREE.InterleavedBufferAttribute;
  instanceCharSize: THREE.InterleavedBufferAttribute;

  lineHeight = 1;

  public labelPool: LabelPool;

  constructor(labelPool: LabelPool) {
    super();
    this.labelPool = labelPool;

    this.geometry = new THREE.InstancedBufferGeometry();

    this.geometry.setAttribute("position", LabelPool.QUAD_POSITIONS);
    this.geometry.setAttribute("uv", LabelPool.QUAD_UVS);

    this.instanceAttrData = new Float32Array();
    this.instanceAttrBuffer = new THREE.InstancedInterleavedBuffer(this.instanceAttrData, 10, 1);
    this.instanceBoxPosition = new THREE.InterleavedBufferAttribute(this.instanceAttrBuffer, 2, 0);
    this.instanceCharPosition = new THREE.InterleavedBufferAttribute(this.instanceAttrBuffer, 2, 2);
    this.instanceUv = new THREE.InterleavedBufferAttribute(this.instanceAttrBuffer, 2, 4);
    this.instanceBoxSize = new THREE.InterleavedBufferAttribute(this.instanceAttrBuffer, 2, 6);
    this.instanceCharSize = new THREE.InterleavedBufferAttribute(this.instanceAttrBuffer, 2, 8);
    this.geometry.setAttribute("instanceBoxPosition", this.instanceBoxPosition);
    this.geometry.setAttribute("instanceCharPosition", this.instanceCharPosition);
    this.geometry.setAttribute("instanceUv", this.instanceUv);
    this.geometry.setAttribute("instanceBoxSize", this.instanceBoxSize);
    this.geometry.setAttribute("instanceCharSize", this.instanceCharSize);

    this.material = new LabelMaterial({ atlasTexture: labelPool.atlasTexture });
    this.pickingMaterial = new LabelMaterial({ picking: true });

    this.mesh = new InstancedMeshWithBasicBoundingSphere(this.geometry, this.material, 0);
    this.mesh.userData.pickingMaterial = this.pickingMaterial;

    this.mesh.onBeforeRender = (renderer, _scene, _camera, _geometry, _material, _group) => {
      renderer.getSize(tempVec2);
      this.material.uniforms.uCanvasSize!.value[0] = tempVec2.x;
      this.material.uniforms.uCanvasSize!.value[1] = tempVec2.y;
      this.pickingMaterial.uniforms.uCanvasSize!.value[0] = tempVec2.x;
      this.pickingMaterial.uniforms.uCanvasSize!.value[1] = tempVec2.y;
    };

    this.add(this.mesh);

    labelPool.addEventListener("scaleFactorChange", () => {
      // Trigger recalculation of scale uniform
      this.setLineHeight(this.lineHeight);
    });

    labelPool.addEventListener("atlasChange", () => {
      this._handleAtlasChange();
    });
    this._handleAtlasChange();
  }

  private _handleAtlasChange() {
    this.material.uniforms.uTextureSize!.value[0] = this.labelPool.atlasTexture.image.width;
    this.material.uniforms.uTextureSize!.value[1] = this.labelPool.atlasTexture.image.height;
    this.setLineHeight(this.lineHeight);
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
    if (this.instanceAttrData.byteLength < requiredLength) {
      this.instanceAttrData = new Float32Array(requiredLength);
      this.instanceAttrBuffer = new THREE.InstancedInterleavedBuffer(this.instanceAttrData, 10, 1);
      this.instanceBoxPosition.data = this.instanceAttrBuffer;
      this.instanceCharPosition.data = this.instanceAttrBuffer;
      this.instanceUv.data = this.instanceAttrBuffer;
      this.instanceBoxSize.data = this.instanceAttrBuffer;
      this.instanceCharSize.data = this.instanceAttrBuffer;
    }
  }

  setText(text: string): void {
    if (text !== this.text) {
      this.text = text;
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
    const layoutInfo = this.labelPool.fontManager.layout(this.text);
    this.material.uniforms.uLabelSize!.value[0] = layoutInfo.width;
    this.material.uniforms.uLabelSize!.value[1] = layoutInfo.height;
    this.pickingMaterial.uniforms.uLabelSize!.value[0] = layoutInfo.width;
    this.pickingMaterial.uniforms.uLabelSize!.value[1] = layoutInfo.height;

    this.geometry.instanceCount = this.mesh.count = layoutInfo.chars.length;

    this.reallocateAttributeBufferIfNeeded(layoutInfo.chars.length);

    let i = 0;
    for (const char of layoutInfo.chars) {
      // instanceBoxPosition
      this.instanceAttrData[i++] = char.left;
      this.instanceAttrData[i++] = layoutInfo.height - char.boxTop - char.boxHeight;
      // instanceCharPosition
      this.instanceAttrData[i++] = char.left;
      this.instanceAttrData[i++] =
        layoutInfo.height - char.boxTop - char.boxHeight + char.top - char.boxTop;
      // instanceUv
      this.instanceAttrData[i++] = char.atlasX;
      this.instanceAttrData[i++] = char.atlasY;
      // instanceBoxSize
      this.instanceAttrData[i++] = char.xAdvance;
      this.instanceAttrData[i++] = char.boxHeight;
      // instanceCharSize
      this.instanceAttrData[i++] = char.width;
      this.instanceAttrData[i++] = char.height;
    }
    this.instanceAttrBuffer.needsUpdate = true;
    this._needsUpdateLayout = false;
  }

  /** Values should be in working (linear-srgb) color space */
  setColor(r: number, g: number, b: number, a = 1): void {
    this.material.uniforms.uColor!.value[0] = r;
    this.material.uniforms.uColor!.value[1] = g;
    this.material.uniforms.uColor!.value[2] = b;
    this.material.uniforms.uColor!.value[3] = a;
    this.#updateTransparency();
  }

  /** Values should be in working (linear-srgb) color space */
  setBackgroundColor(r: number, g: number, b: number, a = 1): void {
    this.material.uniforms.uBackgroundColor!.value[0] = r;
    this.material.uniforms.uBackgroundColor!.value[1] = g;
    this.material.uniforms.uBackgroundColor!.value[2] = b;
    this.material.uniforms.uBackgroundColor!.value[3] = a;
    this.#updateTransparency();
  }

  #updateTransparency(): void {
    const bgOpacity = this.material.uniforms.uBackgroundColor!.value[3];
    const fgOpacity = this.material.uniforms.uColor!.value[3];
    const transparent = bgOpacity < 1 || fgOpacity < 1;
    this.material.transparent = transparent;
    this.material.depthWrite = !transparent;
  }

  // eslint-disable-next-line @foxglove/no-boolean-parameters
  setBillboard(billboard: boolean): void {
    this.material.uniforms.uBillboard!.value = billboard;
    this.pickingMaterial.uniforms.uBillboard!.value = billboard;
  }

  /**
   * Enable or disable size attenuation. Setting this to `false` also requires that billboarding is
   * enabled.
   */
  // eslint-disable-next-line @foxglove/no-boolean-parameters
  setSizeAttenuation(sizeAttenuation: boolean): void {
    this.material.uniforms.uSizeAttenuation!.value = sizeAttenuation;
    this.pickingMaterial.uniforms.uSizeAttenuation!.value = sizeAttenuation;
  }

  setAnchorPoint(x: number, y: number): void {
    this.material.uniforms.uAnchorPoint!.value[0] = x;
    this.material.uniforms.uAnchorPoint!.value[1] = y;
    this.pickingMaterial.uniforms.uAnchorPoint!.value[0] = x;
    this.pickingMaterial.uniforms.uAnchorPoint!.value[1] = y;
  }

  setLineHeight(lineHeight: number): void {
    this.lineHeight = lineHeight;
    const scale =
      (this.lineHeight * this.labelPool.scaleFactor) /
      this.labelPool.fontManager.atlasData.lineHeight;
    this.material.uniforms.uScale!.value = scale;
    this.pickingMaterial.uniforms.uScale!.value = scale;
  }
}
