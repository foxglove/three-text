export type ThreeTextLabelMaterial = {
  depthTest: boolean;
  depthWrite: boolean;
  transparent: boolean;
};

export type ThreeTextLabelMesh = {
  renderOrder: number;
};

export type ThreeTextLabel<TObject3D extends object = object> = TObject3D & {
  mesh: ThreeTextLabelMesh;
  material: ThreeTextLabelMaterial;
  dispose(): void;
  setAnchorPoint(x: number, y: number): void;
  setBackgroundColor(r: number, g: number, b: number, a?: number): void;
  setBillboard(billboard: boolean): void;
  setColor(r: number, g: number, b: number, a?: number): void;
  setLineHeight(lineHeight: number): void;
  setSizeAttenuation(sizeAttenuation: boolean): void;
  setText(text: string): void;
};
