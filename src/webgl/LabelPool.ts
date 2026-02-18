import type { Label } from "../Label.ts";
import { LabelPoolBase } from "../LabelPoolBase.ts";
import { LabelWebGL } from "./LabelWebGL.ts";

export class LabelPool extends LabelPoolBase {
  protected override createLabel(): Label {
    return new LabelWebGL(this);
  }
}
