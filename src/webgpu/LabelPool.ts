import type { Label } from "../Label.ts";
import { LabelPoolBase } from "../LabelPoolBase.ts";
import { LabelWebGPU } from "./LabelWebGPU.ts";

export class LabelPool extends LabelPoolBase {
  protected override createLabel(): Label {
    return new LabelWebGPU(this);
  }
}
