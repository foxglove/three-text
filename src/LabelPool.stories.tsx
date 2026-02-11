import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { useEffect, useRef, useState, type ReactElement } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { WebGPURenderer } from "three/webgpu";

import type { Label, LabelPoolBase } from "./common.ts";
import { LabelPool as LabelPoolWebGL } from "./webgl/index.ts";
import { LabelPool as LabelPoolWebGPU } from "./webgpu/index.ts";

const meta: Meta<typeof BasicTemplate> = {
  title: "LabelPool",
  component: BasicTemplate,
  tags: ["autodocs"],
  argTypes: {
    renderer: { control: false },
    cameraMode: { control: "inline-radio", options: ["perspective", "orthographic"] },
    lineHeight: { control: { type: "range", min: 0.5, max: 20, step: 0.01 } },
    scaleFactor: { control: { type: "range", min: 0, max: 2, step: 0.01 } },
    bgOpacity: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    fgOpacity: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    anchorPointX: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    anchorPointY: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    positionX: { control: { type: "range", min: -5, max: 5, step: 0.01 } },
    positionY: { control: { type: "range", min: -5, max: 5, step: 0.01 } },
    positionZ: { control: { type: "range", min: -5, max: 5, step: 0.01 } },
  },
  args: {
    text: "Hello world!\nExample",
    lineHeight: 1,
    scaleFactor: 1,
    foregroundColor: "#000000",
    backgroundColor: "#ffffff",
    fgOpacity: 1,
    bgOpacity: 1,
    cameraMode: "perspective",
    billboard: false,
    sizeAttenuation: true,
    anchorPointX: 0.5,
    anchorPointY: 0.5,
    positionX: 0,
    positionY: 0,
    positionZ: 0,
  },
};
export default meta;

type StorySceneOptions = {
  renderer: "webgpu" | "webgpu-force-webgl" | "webgl";
  logDepthBuffer: boolean;
};
class StoryScene {
  labelPool: LabelPoolBase;

  perspectiveCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  orthographicCamera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
  scene = new THREE.Scene();
  renderer?: WebGPURenderer | THREE.WebGLRenderer;
  initialized = false;
  controls?: OrbitControls;

  perspective = true;

  bgCube?: THREE.Mesh;

  private options: StorySceneOptions;

  constructor(options: StorySceneOptions) {
    this.options = options;
    this.labelPool = options.renderer === "webgl" ? new LabelPoolWebGL() : new LabelPoolWebGPU();
    this.perspectiveCamera.position.set(4, 4, 4);
    this.scene.background = new THREE.Color(0xf0f0f0);
    this.scene.add(new THREE.AxesHelper(5));
    // show transparency in snapshot tests
    const cubeGeometry = new THREE.BoxGeometry(0.2, 0.2, 2);
    const cubeMaterial = new THREE.MeshNormalMaterial();
    this.bgCube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    this.bgCube.position.set(0, 0, -0.8);
    this.scene.add(this.bgCube);
  }

  dispose() {
    this.controls?.dispose();
    this.renderer?.dispose();
  }

  render = () => {
    if (!this.initialized) {
      return;
    }
    this.renderer?.render(
      this.scene,
      this.perspective ? this.perspectiveCamera : this.orthographicCamera,
    );
  };

  setCanvas(canvas: HTMLCanvasElement) {
    if (this.options.renderer === "webgpu" || this.options.renderer === "webgpu-force-webgl") {
      this.renderer = new WebGPURenderer({
        canvas,
        antialias: true,
        logarithmicDepthBuffer: this.options.logDepthBuffer,
        forceWebGL: this.options.renderer === "webgpu-force-webgl",
      });
      this.renderer.init().then(
        () => {
          this.initialized = true;
          this.render();
        },
        (err: unknown) => {
          console.error("Failed to initialize renderer", err);
        },
      );
    } else {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        logarithmicDepthBuffer: this.options.logDepthBuffer,
      });
      this.initialized = true;
    }
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.perspectiveCamera.aspect = canvas.clientWidth / canvas.clientHeight;
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);

    this.controls = new OrbitControls(this.perspectiveCamera, canvas);
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    this.orthographicCamera.position.copy(this.perspectiveCamera.position);
    this.orthographicCamera.rotation.copy(this.perspectiveCamera.rotation);
    this.orthographicCamera.updateProjectionMatrix();

    this.controls.addEventListener("change", () => {
      this.orthographicCamera.position.copy(this.perspectiveCamera.position);
      this.orthographicCamera.rotation.copy(this.perspectiveCamera.rotation);
      this.orthographicCamera.updateProjectionMatrix();
      this.render();
    });
  }
}
function BasicTemplate({
  renderer = "webgl",
  text,
  lineHeight,
  scaleFactor,
  foregroundColor,
  backgroundColor,
  fgOpacity,
  bgOpacity,
  billboard,
  sizeAttenuation,
  cameraMode = "perspective",
  anchorPointX,
  anchorPointY,
  positionX,
  positionY,
  positionZ,
  logDepthBuffer = false,
}: {
  renderer?: "webgpu" | "webgpu-force-webgl" | "webgl";
  text: string;
  lineHeight: number;
  scaleFactor: number;
  foregroundColor: string;
  backgroundColor: string;
  fgOpacity: number;
  bgOpacity: number;
  cameraMode: "perspective" | "orthographic";
  billboard: boolean;
  sizeAttenuation: boolean;
  anchorPointX: number;
  anchorPointY: number;
  positionX: number;
  positionY: number;
  positionZ: number;
  logDepthBuffer: boolean;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [storyScene] = useState(() => new StoryScene({ renderer, logDepthBuffer }));
  const [label, setLabel] = useState<Label>();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      throw new Error("expected canvas");
    }
    storyScene.setCanvas(canvas);
    const newLabel = storyScene.labelPool.acquire();
    setLabel(newLabel);

    storyScene.scene.add(newLabel);

    storyScene.render();

    return () => {
      storyScene.labelPool.release(newLabel);
      storyScene.dispose();
    };
  }, [storyScene]);

  useEffect(() => {
    storyScene.perspective = cameraMode === "perspective";
    storyScene.render();
  }, [storyScene, cameraMode]);

  useEffect(() => {
    if (label) {
      label.setText(text);
      storyScene.render();
    }
  }, [text, label, storyScene]);

  useEffect(() => {
    storyScene.labelPool.setScaleFactor(scaleFactor);
    storyScene.render();
  }, [scaleFactor, storyScene]);

  useEffect(() => {
    if (label) {
      label.setLineHeight(lineHeight);
      storyScene.render();
    }
  }, [lineHeight, label, storyScene]);

  useEffect(() => {
    if (label) {
      label.setBillboard(billboard);
      storyScene.render();
    }
  }, [billboard, label, storyScene]);

  useEffect(() => {
    if (label) {
      label.setSizeAttenuation(sizeAttenuation);
      storyScene.render();
    }
  }, [sizeAttenuation, label, storyScene]);

  useEffect(() => {
    if (label) {
      label.setAnchorPoint(anchorPointX, anchorPointY);
      storyScene.render();
    }
  }, [anchorPointX, anchorPointY, billboard, label, storyScene]);

  useEffect(() => {
    if (label) {
      const color = new THREE.Color(foregroundColor);
      label.setColor(color.r, color.g, color.b, fgOpacity);
      storyScene.render();
    }
  }, [label, foregroundColor, storyScene, fgOpacity]);

  useEffect(() => {
    if (label) {
      const color = new THREE.Color(backgroundColor);
      label.setBackgroundColor(color.r, color.g, color.b, bgOpacity);
      storyScene.render();
    }
  }, [label, backgroundColor, storyScene, bgOpacity]);

  useEffect(() => {
    if (label) {
      label.position.set(positionX, positionY, positionZ);
      storyScene.render();
    }
  }, [label, positionX, positionY, positionZ, storyScene]);

  return <canvas ref={canvasRef} width={400} height={400} style={{ width: 400, height: 400 }} />;
}

export const Basic: StoryObj<typeof meta> = {};
export const WebGPU: StoryObj<typeof meta> = {
  name: "WebGPU",
  args: {
    renderer: "webgpu",
  },
};
export const WebGPUForceWebGL: StoryObj<typeof meta> = {
  name: "WebGPU (Force WebGL)",
  args: {
    renderer: "webgpu-force-webgl",
  },
};
export const CustomColors: StoryObj<typeof meta> = {
  args: {
    foregroundColor: "#ff9d42",
    backgroundColor: "#1295d1",
    bgOpacity: 0.8,
    fgOpacity: 0.3,
  },
};
export const LogarithmicDepth: StoryObj<typeof meta> = {
  args: {
    logDepthBuffer: true,
  },
};
