import * as THREE from "three";
import {
  uniform,
  property,
  uv,
  modelViewMatrix,
  vec4,
  vec3,
  length,
  If,
  Fn,
  attribute,
  positionLocal,
  cameraProjectionMatrix,
  modelWorldMatrix,
  sRGBTransferOETF,
  texture,
  dFdx,
  dFdy,
  vec2,
  smoothstep,
  mix,
  select,
  vertexStage,
  screenSize,
  screenDPR,
  viewZToLogarithmicDepth,
  viewZToPerspectiveDepth,
  viewZToOrthographicDepth,
  cameraNear,
  cameraFar,
  varyingProperty,
} from "three/tsl";
import { NodeMaterial } from "three/webgpu";
import type { TextureNode, Node } from "three/webgpu";

import type { ILabelMaterial } from "../ILabelMaterial.ts";

export class LabelNodeMaterial extends NodeMaterial implements ILabelMaterial {
  picking: boolean;

  #uBillboard = uniform(false).setName("uBillboard");
  #uSizeAttenuation = uniform(true).setName("uSizeAttenuation");
  #uScale = uniform(0, "float").setName("uScale");
  #uLabelSize = uniform(new THREE.Vector2(0, 0)).setName("uLabelSize");
  #uTextureSize = uniform(new THREE.Vector2(0, 0)).setName("uTextureSize");
  #uAnchorPoint = uniform(new THREE.Vector2(0.5, 0.5)).setName("uAnchorPoint");
  #uMap: TextureNode;
  #uColor = uniform(new THREE.Vector4(0, 0, 0, 1)).setName("uColor");
  #uBackgroundColor = uniform(new THREE.Vector4(1, 1, 1, 1)).setName("uBackgroundColor");
  #uObjectId = uniform(new THREE.Vector4(NaN, NaN, NaN, NaN)).setName("uObjectId");

  constructor(params: {
    atlasTexture?: THREE.Texture<THREE.DataTextureImageData>;
    picking?: boolean;
  }) {
    super();
    this.name = "LabelMaterial";
    this.#uMap = texture(params.atlasTexture);
    this.side = THREE.DoubleSide;
    this.transparent = false;
    this.depthWrite = true;
    this.picking = params.picking ?? false;

    const instanceBoxPosition = attribute("instanceBoxPosition", "vec2");
    const instanceCharPosition = attribute("instanceCharPosition", "vec2");
    const instanceUv = attribute("instanceUv", "vec2");
    const instanceBoxSize = attribute("instanceBoxSize", "vec2");
    const instanceCharSize = attribute("instanceCharSize", "vec2");

    // Track view-space Z value from custom vertexNode (instead of default positionView.z) for log depth support
    const vViewZ = varyingProperty("float", "vViewZ");

    // Adjust uv coordinates so they are in the 0-1 range in the character region
    const boxUv = uv()
      .mul(instanceBoxSize)
      .sub(instanceCharPosition.sub(instanceBoxPosition))
      .div(instanceCharSize)
      .toConst("boxUv");
    const vInsideChar = vertexStage(boxUv);
    const vUv = vertexStage(instanceUv.add(boxUv.mul(instanceCharSize)).div(this.#uTextureSize));
    const vertexPos = instanceBoxPosition
      .add(positionLocal.xy.mul(instanceBoxSize))
      .sub(this.#uAnchorPoint.mul(this.#uLabelSize))
      .mul(this.#uScale)
      .toConst("vertexPos");

    this.vertexNode = Fn(() => {
      const result = vec4().toVar("result");

      // Adapted from THREE.ShaderLib.sprite
      If(this.#uBillboard, () => {
        const mvPosition = modelViewMatrix.mul(vec4(0, 0, 0, 1)).toVar("mvPosition");
        If(this.#uSizeAttenuation, () => {
          mvPosition.xy.addAssign(vertexPos);
          result.assign(cameraProjectionMatrix.mul(mvPosition));
        }).Else(() => {
          // Adapted from THREE.ShaderLib.sprite
          const scale = property("vec2");
          scale.x.assign(length(vec3(modelWorldMatrix[0].xyz)));
          scale.y.assign(length(vec3(modelWorldMatrix[1].xyz)));

          result.assign(cameraProjectionMatrix.mul(mvPosition));

          // Add position after projection to maintain constant pixel size
          result.xy.addAssign(
            vertexPos.mul(2).div(screenSize).mul(screenDPR).mul(scale).mul(result.w),
          );
        });

        vViewZ.assign(mvPosition.z);
      }).Else(() => {
        const mvPosition = modelViewMatrix.mul(vec4(vertexPos, 0.0, 1.0)).toConst();
        vViewZ.assign(mvPosition.z);
        result.assign(cameraProjectionMatrix.mul(mvPosition));
      });

      return result;
    })();

    // The default depth behavior accounts for logarithmic depth, but doesn't work with our custom
    // vertexNode so we customize it to use vViewZ.
    this.depthNode = Fn((builder) => {
      const isPerspective = cameraProjectionMatrix[2][3].equal(-1);
      return select(
        isPerspective,
        builder.renderer.logarithmicDepthBuffer
          ? viewZToLogarithmicDepth(vViewZ, cameraNear, cameraFar)
          : viewZToPerspectiveDepth(vViewZ, cameraNear, cameraFar),
        viewZToOrthographicDepth(vViewZ, cameraNear, cameraFar),
      );
    })();

    if (this.picking) {
      this.fragmentNode = this.#uObjectId;
    } else {
      const aastep = Fn<[Node, Node]>(([threshold, value]) => {
        const afwidth = length(vec2(dFdx(value), dFdy(value)))
          .mul(0.70710678118654757)
          .toConst("afwidth");
        return smoothstep(threshold.sub(afwidth), threshold.add(afwidth), value);
      });

      const dist = this.#uMap.sample(vUv).a;
      const outColor = mix(this.#uBackgroundColor, this.#uColor, aastep(0.75, dist));
      const insideChar = vInsideChar.x
        .greaterThanEqual(0.0)
        .and(vInsideChar.x.lessThanEqual(1.0))
        .and(vInsideChar.y.greaterThanEqual(0.0))
        .and(vInsideChar.y.lessThanEqual(1.0));

      const color = select(insideChar, outColor, this.#uBackgroundColor).toConst("color");
      this.fragmentNode = vec4(sRGBTransferOETF(color), color.a);
    }
  }

  setTextureSize(width: number, height: number): void {
    this.#uTextureSize.value.set(width, height);
  }

  setLabelSize(width: number, height: number): void {
    this.#uLabelSize.value.set(width, height);
  }

  setColor(r: number, g: number, b: number, a: number): void {
    this.#uColor.value.set(r, g, b, a);
    this.#updateTransparency();
  }

  setBackgroundColor(r: number, g: number, b: number, a: number): void {
    this.#uBackgroundColor.value.set(r, g, b, a);
    this.#updateTransparency();
  }

  // eslint-disable-next-line @foxglove/no-boolean-parameters
  setBillboard(billboard: boolean): void {
    this.#uBillboard.value = billboard;
  }

  // eslint-disable-next-line @foxglove/no-boolean-parameters
  setSizeAttenuation(sizeAttenuation: boolean): void {
    this.#uSizeAttenuation.value = sizeAttenuation;
  }

  setAnchorPoint(x: number, y: number): void {
    this.#uAnchorPoint.value.set(x, y);
  }

  setScale(scale: number): void {
    this.#uScale.value = scale;
  }

  #updateTransparency() {
    const bgOpacity = this.#uBackgroundColor.value.w;
    const fgOpacity = this.#uColor.value.w;
    const transparent = bgOpacity < 1 || fgOpacity < 1;
    this.transparent = transparent;
    this.depthWrite = !transparent;
  }
}
