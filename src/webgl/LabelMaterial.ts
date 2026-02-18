import * as THREE from "three";

import type { ILabelMaterial } from "../ILabelMaterial.ts";

const tempVec2 = new THREE.Vector2();

export class LabelMaterial extends THREE.ShaderMaterial implements ILabelMaterial {
  picking: boolean;

  constructor(params: { atlasTexture?: THREE.DataTexture; picking?: boolean }) {
    super({
      glslVersion: THREE.GLSL3,
      vertexShader: /* glsl */ `\
#include <common>
#include <logdepthbuf_pars_vertex>

precision highp float;
precision highp int;

uniform bool uBillboard;
uniform bool uSizeAttenuation;
uniform float uScale;
uniform vec2 uLabelSize;
uniform vec2 uTextureSize;
uniform vec2 uAnchorPoint;
uniform vec2 uCanvasSize;

in vec2 instanceBoxPosition, instanceCharPosition;
in vec2 instanceUv;
in vec2 instanceBoxSize, instanceCharSize;
out mediump vec2 vUv;
out mediump vec2 vInsideChar;
void main() {
  // Adjust uv coordinates so they are in the 0-1 range in the character region
  vec2 boxUv = (uv * instanceBoxSize - (instanceCharPosition - instanceBoxPosition)) / instanceCharSize;
  vInsideChar = boxUv;
  vUv = (instanceUv + boxUv * instanceCharSize) / uTextureSize;
  vec2 vertexPos = (instanceBoxPosition + position.xy * instanceBoxSize - uAnchorPoint * uLabelSize) * uScale;

  // Adapted from THREE.ShaderLib.sprite
  if (uBillboard) {
    if (uSizeAttenuation) {
      vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
      mvPosition.xy += vertexPos;
      gl_Position = projectionMatrix * mvPosition;
    } else {
      vec4 mvPosition = modelViewMatrix * vec4(0., 0., 0., 1.);

      // Adapted from THREE.ShaderLib.sprite
      vec2 scale;
      scale.x = length(vec3(modelMatrix[0].xyz));
      scale.y = length(vec3(modelMatrix[1].xyz));

      gl_Position = projectionMatrix * mvPosition;

      // Add position after projection to maintain constant pixel size
      gl_Position.xy += vertexPos * 2. / uCanvasSize * scale * gl_Position.w;
    }
  } else {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(vertexPos, 0.0, 1.0);
  }

  #include <logdepthbuf_vertex>
}
`,
      fragmentShader:
        params.picking === true
          ? /* glsl */ `\
#ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
#else
  precision mediump float;
#endif

#include <logdepthbuf_pars_fragment>

uniform vec4 objectId;
out vec4 outColor;
void main() {
  outColor = objectId;

  #include <logdepthbuf_fragment>
}
`
          : /* glsl */ `\
#ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
#else
  precision mediump float;
#endif

#include <logdepthbuf_pars_fragment>

uniform sampler2D uMap;
uniform mediump vec4 uColor, uBackgroundColor;
uniform float uScale;
uniform vec2 uLabelSize;
in mediump vec2 vUv;
in mediump vec2 vInsideChar;
out vec4 outColor;

// From https://github.com/Jam3/three-bmfont-text/blob/e17efbe4e9392a83d4c5ee35c67eca5a11a13395/shaders/sdf.js
float aastep(float threshold, float value) {
  float afwidth = length(vec2(dFdx(value), dFdy(value))) * 0.70710678118654757;
  return smoothstep(threshold - afwidth, threshold + afwidth, value);
}

void main() {
  float dist = texture(uMap, vUv).a;
  vec4 color = uBackgroundColor * (1.0 - dist) + uColor * dist;
  outColor = mix(uBackgroundColor, uColor, aastep(0.75, dist));

  bool insideChar = vInsideChar.x >= 0.0 && vInsideChar.x <= 1.0 && vInsideChar.y >= 0.0 && vInsideChar.y <= 1.0;
  outColor = insideChar ? outColor : uBackgroundColor;
  outColor = sRGBTransferOETF(outColor); // assumes output encoding is srgb

  #include <logdepthbuf_fragment>
}
`,
      uniforms: {
        objectId: { value: [NaN, NaN, NaN, NaN] },
        uAnchorPoint: { value: [0.5, 0.5] },
        uBillboard: { value: false },
        uSizeAttenuation: { value: true },
        uLabelSize: { value: [0, 0] },
        uCanvasSize: { value: [0, 0] },
        uScale: { value: 0 },
        uTextureSize: {
          value: [params.atlasTexture?.image.width ?? 0, params.atlasTexture?.image.height ?? 0],
        },
        uMap: { value: params.atlasTexture },
        uColor: { value: [0, 0, 0, 1] },
        uBackgroundColor: { value: [1, 1, 1, 1] },
      },

      side: THREE.DoubleSide,
      transparent: false,
      depthWrite: true,
    });

    this.onBeforeRender = (renderer, _scene, _camera, _geometry, _material, _group) => {
      renderer.getSize(tempVec2);
      this.uniforms.uCanvasSize!.value[0] = tempVec2.x;
      this.uniforms.uCanvasSize!.value[1] = tempVec2.y;
    };

    this.picking = params.picking ?? false;
  }

  setTextureSize(width: number, height: number): void {
    this.uniforms.uTextureSize!.value[0] = width;
    this.uniforms.uTextureSize!.value[1] = height;
  }

  setLabelSize(width: number, height: number): void {
    this.uniforms.uLabelSize!.value[0] = width;
    this.uniforms.uLabelSize!.value[1] = height;
  }

  setColor(r: number, g: number, b: number, a: number): void {
    this.uniforms.uColor!.value[0] = r;
    this.uniforms.uColor!.value[1] = g;
    this.uniforms.uColor!.value[2] = b;
    this.uniforms.uColor!.value[3] = a;
    this.#updateTransparency();
  }

  setBackgroundColor(r: number, g: number, b: number, a: number): void {
    this.uniforms.uBackgroundColor!.value[0] = r;
    this.uniforms.uBackgroundColor!.value[1] = g;
    this.uniforms.uBackgroundColor!.value[2] = b;
    this.uniforms.uBackgroundColor!.value[3] = a;
    this.#updateTransparency();
  }

  // eslint-disable-next-line @foxglove/no-boolean-parameters
  setBillboard(billboard: boolean): void {
    this.uniforms.uBillboard!.value = billboard;
  }

  // eslint-disable-next-line @foxglove/no-boolean-parameters
  setSizeAttenuation(sizeAttenuation: boolean): void {
    this.uniforms.uSizeAttenuation!.value = sizeAttenuation;
  }

  setAnchorPoint(x: number, y: number): void {
    this.uniforms.uAnchorPoint!.value[0] = x;
    this.uniforms.uAnchorPoint!.value[1] = y;
  }

  setScale(scale: number): void {
    this.uniforms.uScale!.value = scale;
  }

  #updateTransparency() {
    const bgOpacity = this.uniforms.uBackgroundColor!.value[3];
    const fgOpacity = this.uniforms.uColor!.value[3];
    const transparent = bgOpacity < 1 || fgOpacity < 1;
    this.transparent = transparent;
    this.depthWrite = !transparent;
  }
}
