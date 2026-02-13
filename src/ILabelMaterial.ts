import type * as THREE from "three";

export interface ILabelMaterial extends THREE.Material {
  readonly picking: boolean;
  setTextureSize(width: number, height: number): void;
  setLabelSize(width: number, height: number): void;
  setColor(r: number, g: number, b: number, a: number): void;
  setBackgroundColor(r: number, g: number, b: number, a: number): void;
  setBillboard(billboard: boolean): void;
  setSizeAttenuation(sizeAttenuation: boolean): void;
  setAnchorPoint(x: number, y: number): void;
  setScale(scale: number): void;
}
