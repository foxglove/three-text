import type * as THREE from "three";

import type { ILabelMaterial } from "../ILabelMaterial.ts";
import { Label } from "../Label.ts";
import { LabelNodeMaterial } from "./LabelNodeMaterial.ts";

export class LabelWebGPU extends Label {
  protected override createMaterial(atlasTexture: THREE.DataTexture): ILabelMaterial {
    return new LabelNodeMaterial({ atlasTexture });
  }

  protected override createPickingMaterial(): ILabelMaterial {
    return new LabelNodeMaterial({ picking: true });
  }
}
