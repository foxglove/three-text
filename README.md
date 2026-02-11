# @foxglove/three-text

Render text in 3D using Signed Distance Fields

[![npm version](https://img.shields.io/npm/v/@foxglove/three-text.svg)](https://www.npmjs.com/package/@foxglove/three-text)

![demo of three-text](https://user-images.githubusercontent.com/14237/185552879-3301a9d0-d749-4b48-8fcd-ddfd8d0871f3.gif)

## Usage

View live example [in Storybook](https://foxglove-three-text-storybook.pages.dev/?path=/story/labelpool--basic). View example usage at [LabelPool.stories.tsx](./src/LabelPool.stories.tsx).

To run Storybook locally, run `yarn storybook`.

- For WebGLRenderer: `import { LabelPool } from "@foxglove/three-text";`
- For WebGPURenderer: `import { LabelPool } from "@foxglove/three-text/webgpu";`

```ts
const labelPool = new LabelPool();
const label = labelPool.acquire();
label.setText("hello");
label.setColor(r, g, b, a);
label.setBackgroundColor(r, g, b, a);
label.setBillboard(true);
label.setSizeAttenutation(true); // sizeAttenuation=false requires billboard=true
label.setAnchorPoint(x, y);
label.setLineHeight(0.5);

// cleanup...
labelPool.release(label);
```
