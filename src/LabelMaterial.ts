import * as THREE from "three";

export class LabelMaterial extends THREE.ShaderMaterial {
  picking: boolean;

  constructor(params: {
    atlasTexture?: THREE.Texture<THREE.DataTextureImageData>;
    picking?: boolean;
  }) {
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
uniform vec2 resolution;

in vec2 instanceBoxPosition, instanceCharPosition;
in vec2 instanceUv;
in vec2 instanceBoxSize, instanceCharSize;
out mediump vec2 vUv;
out mediump vec2 vInsideChar;
out mediump vec2 vPosInLabel;
void main() {
  // Adjust uv coordinates so they are in the 0-1 range in the character region
  vec2 boxUv = (uv * instanceBoxSize - (instanceCharPosition - instanceBoxPosition)) / instanceCharSize;
  vInsideChar = boxUv;
  vUv = (instanceUv + boxUv * instanceCharSize) / uTextureSize;
  vec2 vertexPos = (instanceBoxPosition + position.xy * instanceBoxSize - uAnchorPoint * uLabelSize) * uScale;
  vPosInLabel = (instanceBoxPosition + position.xy * instanceBoxSize);

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

      // Add offset in view space before projection so that setViewOffset
      // (used by the Picker) works correctly. Multiplying by distance
      // compensates for the perspective divide, keeping constant pixel size.
      float dist = -mvPosition.z;
      mvPosition.xy += vertexPos * 2. * dist / resolution * scale;
      gl_Position = projectionMatrix * mvPosition;
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
in mediump vec2 vPosInLabel;
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
        resolution: { value: new THREE.Vector2(1, 1) },
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

    this.picking = params.picking ?? false;
  }
}
