import type * as THREE from "three";

import type { ILabelMaterial } from "../ILabelMaterial.ts";
import { Label } from "../Label.ts";
import { LabelMaterial } from "./LabelMaterial.ts";

export class LabelWebGL extends Label {
  protected override createMaterial(atlasTexture: THREE.DataTexture): ILabelMaterial {
    return new LabelMaterial({ atlasTexture });
  }

  protected override createPickingMaterial(): ILabelMaterial {
    return new LabelMaterial({ picking: true });
  }
}
