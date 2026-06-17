import type { Meta, StoryObj } from "@storybook/react-webpack5";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { WebGPURenderer } from "three/webgpu";

import type { Label, LabelPoolBase } from "./common.ts";
import { LabelPool as LabelPoolWebGL } from "./webgl/index.ts";
import { LabelPool as LabelPoolWebGPU } from "./webgpu/index.ts";

const CANVAS_SIZE = 400;
const PICK_PIXEL_WIDTH = 31;
const PICK_PIXEL_CENTER = (PICK_PIXEL_WIDTH / 2) | 0;
const NULL_SCENE = null as unknown as THREE.Scene;
const NULL_GROUP = null as unknown as THREE.Group;

const meta: Meta<typeof BasicTemplate> = {
  title: "LabelPool",
  component: BasicTemplate,
  tags: ["autodocs"],
  argTypes: {
    renderer: { control: false },
    cameraMode: { control: "inline-radio", options: ["perspective", "orthographic"] },
    lineHeight: { control: { type: "range", min: 0.5, max: 20, step: 0.01 } },
    scaleFactor: { control: { type: "range", min: 0, max: 40, step: 0.01 } },
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

type StoryRenderer = WebGPURenderer | THREE.WebGLRenderer;

type CssRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type PickDebugResult = {
  label?: string;
  status:
    | "picked"
    | "none"
    | "not-ready"
    | "outside-canvas"
    | "unsupported-renderer"
    | "no-pickable-objects";
  renderer?: "webgl" | "webgpu";
  canvasX: number;
  canvasY: number;
  drawingBufferWidth?: number;
  drawingBufferHeight?: number;
  pixelRatio?: number;
  viewOffset?: CssRect;
  pickViewportRect?: CssRect;
  readX?: number;
  readY?: number;
  pixel?: [number, number, number, number];
  objectId?: number;
  objectIds: { id: number; label: string }[];
  renderItemCount?: number;
  renderedPickingItemCount?: number;
};

type PickRequest = {
  canvasX: number;
  canvasY: number;
  queryId: number;
};

type PickMaterial = THREE.Material & {
  uniforms?: Record<string, { value: unknown } | undefined>;
};

type StoryRenderItem = {
  object: THREE.Object3D;
  geometry: THREE.BufferGeometry | null;
  material: THREE.Material;
  group: THREE.Group | null;
};

type MaterialState = {
  material: THREE.Material;
  blending: THREE.Blending;
};

type StorySceneOptions = {
  renderer: "webgpu" | "webgpu-force-webgl" | "webgl";
  logDepthBuffer: boolean;
};

function isWebGLRenderer(renderer: StoryRenderer): renderer is THREE.WebGLRenderer {
  return renderer instanceof THREE.WebGLRenderer;
}

function getCanvasPointerPosition(
  canvas: HTMLCanvasElement,
  event: globalThis.MouseEvent,
): PickRequest {
  const canvasRect = canvas.getBoundingClientRect();
  const canvasX =
    canvasRect.width > 0
      ? ((event.clientX - canvasRect.left) / canvasRect.width) * canvas.clientWidth
      : 0;
  const canvasY =
    canvasRect.height > 0
      ? ((event.clientY - canvasRect.top) / canvasRect.height) * canvas.clientHeight
      : 0;

  return {
    canvasX,
    canvasY,
    queryId: 0,
  };
}

function containsPoint(rect: CssRect, x: number, y: number): boolean {
  return (
    x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height
  );
}

function formatRect(rect: CssRect): string {
  return `${rect.left.toFixed(1)},${rect.top.toFixed(1)} ${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`;
}

function formatPickDebugTooltip(queryId: number, pickResult: PickDebugResult): string {
  const lines = [
    `q${queryId} ${pickResult.status}: ${pickResult.label ?? "None"}`,
    `xy ${pickResult.canvasX.toFixed(1)},${pickResult.canvasY.toFixed(1)}`,
  ];

  if (pickResult.renderer != undefined) {
    lines.push(`renderer ${pickResult.renderer}`);
  }
  if (pickResult.drawingBufferWidth != undefined && pickResult.drawingBufferHeight != undefined) {
    lines.push(`buffer ${pickResult.drawingBufferWidth}x${pickResult.drawingBufferHeight}`);
  }
  if (pickResult.pixelRatio != undefined) {
    lines.push(`pixelRatio ${pickResult.pixelRatio.toFixed(2)}`);
  }
  if (pickResult.viewOffset != undefined) {
    lines.push(`viewOffset ${formatRect(pickResult.viewOffset)}`);
  }
  if (pickResult.pickViewportRect != undefined) {
    lines.push(`pick viewport css ${formatRect(pickResult.pickViewportRect)}`);
  }
  if (pickResult.readX != undefined && pickResult.readY != undefined) {
    lines.push(`read ${pickResult.readX},${pickResult.readY}`);
  }
  if (pickResult.pixel != undefined) {
    lines.push(
      `pixel ${pickResult.pixel.join(",")} objectId ${pickResult.objectId ?? "n/a"} ${pickResult.label ?? "None"}`,
    );
  }
  if (pickResult.renderItemCount != undefined) {
    lines.push(
      `render list ${pickResult.renderItemCount} items, rendered ${pickResult.renderedPickingItemCount ?? 0} picking items`,
    );
  }

  const objectIds =
    pickResult.objectIds.length > 0
      ? pickResult.objectIds.map(({ id, label }) => `${id}:${label}`).join(", ")
      : "none";
  lines.push(`ids ${objectIds}`);

  return lines.join("\n");
}

function pickLabelForObject(object: THREE.Object3D): string {
  const parentName = object.parent?.name;
  if (parentName != undefined && parentName.length > 0) {
    return parentName;
  }

  if (object.name.length > 0) {
    return object.name;
  }

  return "Label";
}

function getPickingMaterial(object: THREE.Object3D): PickMaterial | undefined {
  const pickingMaterial = object.userData.pickingMaterial as PickMaterial | undefined;
  if (pickingMaterial?.isMaterial === true && pickingMaterial.uniforms?.objectId != undefined) {
    return pickingMaterial;
  }

  return undefined;
}

function setObjectId(material: PickMaterial, objectId: number): void {
  const uniform = material.uniforms?.objectId;
  const value = uniform?.value;
  if (uniform == undefined || value == undefined) {
    return;
  }

  const unsignedObjectId = objectId >>> 0;
  const r = ((unsignedObjectId >> 24) & 0xff) / 255;
  const g = ((unsignedObjectId >> 16) & 0xff) / 255;
  const b = ((unsignedObjectId >> 8) & 0xff) / 255;
  const a = (unsignedObjectId & 0xff) / 255;

  if (Array.isArray(value)) {
    value[0] = r;
    value[1] = g;
    value[2] = b;
    value[3] = a;
  } else if (value instanceof THREE.Vector4) {
    value.set(r, g, b, a);
  }
}

function setPickingResolution(material: PickMaterial, width: number, height: number): void {
  const value = material.uniforms?.resolution?.value;
  if (Array.isArray(value)) {
    value[0] = width;
    value[1] = height;
  } else if (value instanceof THREE.Vector2) {
    value.set(width, height);
  }
}

function objectIdFromPixel(pixel: Uint8Array): number {
  return (pixel[0]! << 24) | (pixel[1]! << 16) | (pixel[2]! << 8) | pixel[3]!;
}

class StoryScene {
  labelPool: LabelPoolBase;

  perspectiveCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  orthographicCamera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
  scene = new THREE.Scene();
  pickingScene = new THREE.Scene();
  renderer?: StoryRenderer;
  initialized = false;
  controls?: OrbitControls;
  canvas?: HTMLCanvasElement;

  perspective = true;

  bgCube?: THREE.Mesh;

  private options: StorySceneOptions;
  private pickingRenderTarget?: THREE.WebGLRenderTarget;
  private pickQueue = Promise.resolve();

  constructor(options: StorySceneOptions) {
    this.options = options;
    this.labelPool = options.renderer === "webgl" ? new LabelPoolWebGL() : new LabelPoolWebGPU();
    this.perspectiveCamera.position.set(4, 4, 4);
    this.scene.background = new THREE.Color(0xf0f0f0);
    const axes = new THREE.AxesHelper(5);
    axes.userData.picking = false;
    this.scene.add(axes);
    // show transparency in snapshot tests
    const cubeGeometry = new THREE.BoxGeometry(0.2, 0.2, 2);
    const cubeMaterial = new THREE.MeshNormalMaterial();
    this.bgCube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    this.bgCube.userData.picking = false;
    this.bgCube.position.set(0, 0, -0.8);
    this.scene.add(this.bgCube);
  }

  dispose() {
    this.controls?.dispose();
    this.pickingRenderTarget?.dispose();
    this.renderer?.dispose();
  }

  get activeCamera(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    return this.perspective ? this.perspectiveCamera : this.orthographicCamera;
  }

  render = () => {
    if (!this.initialized || !this.renderer) {
      return;
    }

    this.renderer.setRenderTarget(null);
    this.applyFullCanvasViewport();
    this.renderer.render(this.scene, this.activeCamera);
  };

  setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

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

  async pickAt(canvasX: number, canvasY: number): Promise<PickDebugResult> {
    const pickResult = this.pickQueue.then(
      async () => await this.pickAtNow(canvasX, canvasY),
      async () => await this.pickAtNow(canvasX, canvasY),
    );
    this.pickQueue = pickResult.then(
      async () => undefined,
      async () => undefined,
    );

    return await pickResult;
  }

  private async pickAtNow(canvasX: number, canvasY: number): Promise<PickDebugResult> {
    if (!this.initialized || !this.renderer || !this.canvas) {
      return {
        status: "not-ready",
        canvasX,
        canvasY,
        objectIds: [],
      };
    }

    const canvasRect = this.getFullCanvasRect();
    if (!containsPoint(canvasRect, canvasX, canvasY)) {
      return {
        status: "outside-canvas",
        canvasX,
        canvasY,
        objectIds: [],
      };
    }

    const renderer = this.renderer;
    if (!isWebGLRenderer(renderer)) {
      return {
        status: "unsupported-renderer",
        renderer: "webgpu",
        canvasX,
        canvasY,
        objectIds: [],
      };
    }

    this.render();

    const renderList = renderer.renderLists.get(this.scene, 0);

    const renderItems = [
      ...(renderList.opaque as StoryRenderItem[]),
      ...(renderList.transmissive as StoryRenderItem[]),
      ...(renderList.transparent as StoryRenderItem[]),
    ];
    const objectIds: { id: number; label: string }[] = [];
    const objectLabels = new Map<number, string>();
    const materialStates: MaterialState[] = [];
    const pickingItems = renderItems.flatMap((renderItem) => {
      if (renderItem.object.userData.picking === false || renderItem.geometry == undefined) {
        return [];
      }

      const pickingMaterial = getPickingMaterial(renderItem.object);
      if (pickingMaterial == undefined) {
        return [];
      }
      if (!pickingMaterial.visible) {
        return [];
      }

      const label = pickLabelForObject(renderItem.object);
      objectLabels.set(renderItem.object.id, label);
      objectIds.push({ id: renderItem.object.id, label });

      return [{ ...renderItem, material: pickingMaterial }];
    });

    if (pickingItems.length === 0) {
      return {
        status: "no-pickable-objects",
        renderer: "webgl",
        canvasX,
        canvasY,
        drawingBufferWidth: renderer.domElement.width,
        drawingBufferHeight: renderer.domElement.height,
        pixelRatio: renderer.getPixelRatio(),
        objectIds,
        renderItemCount: renderItems.length,
        renderedPickingItemCount: 0,
      };
    }

    const camera = this.activeCamera;
    const pixelRatio = renderer.getPixelRatio();
    const drawingBufferWidth = renderer.domElement.width;
    const drawingBufferHeight = renderer.domElement.height;
    const viewOffsetX = Math.max(0, canvasX * pixelRatio - PICK_PIXEL_CENTER);
    const viewOffsetY = Math.max(0, canvasY * pixelRatio - PICK_PIXEL_CENTER);
    const viewOffset = {
      left: viewOffsetX,
      top: viewOffsetY,
      width: PICK_PIXEL_WIDTH,
      height: PICK_PIXEL_WIDTH,
    };
    const pickViewportRect = {
      left: viewOffsetX / pixelRatio,
      top: viewOffsetY / pixelRatio,
      width: PICK_PIXEL_WIDTH / pixelRatio,
      height: PICK_PIXEL_WIDTH / pixelRatio,
    };

    const renderTarget = this.ensurePickingRenderTarget();
    const previousRenderTarget = renderer.getRenderTarget();
    const previousClearColor = new THREE.Color();
    renderer.getClearColor(previousClearColor);
    const previousClearAlpha = renderer.getClearAlpha();
    const previousInfoAutoReset = renderer.info.autoReset;

    try {
      camera.setViewOffset(
        drawingBufferWidth,
        drawingBufferHeight,
        viewOffsetX,
        viewOffsetY,
        PICK_PIXEL_WIDTH,
        PICK_PIXEL_WIDTH,
      );
      camera.updateProjectionMatrix();

      renderTarget.viewport.set(0, 0, PICK_PIXEL_WIDTH, PICK_PIXEL_WIDTH);
      renderTarget.scissor.set(0, 0, PICK_PIXEL_WIDTH, PICK_PIXEL_WIDTH);
      renderTarget.scissorTest = false;
      renderer.setRenderTarget(renderTarget);
      renderer.setViewport(0, 0, PICK_PIXEL_WIDTH, PICK_PIXEL_WIDTH);
      renderer.setScissor(0, 0, PICK_PIXEL_WIDTH, PICK_PIXEL_WIDTH);
      renderer.setScissorTest(false);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear(true, true, true);

      renderer.info.autoReset = false;
      renderer.info.reset();

      let renderedPickingItemCount = 0;
      this.pickingScene.onAfterRender = () => {
        for (const renderItem of pickingItems) {
          setObjectId(renderItem.material, renderItem.object.id);
          setPickingResolution(renderItem.material, PICK_PIXEL_WIDTH, PICK_PIXEL_WIDTH);
          materialStates.push({
            material: renderItem.material,
            blending: renderItem.material.blending,
          });
          renderItem.material.blending = THREE.NoBlending;
          renderer.renderBufferDirect(
            camera,
            NULL_SCENE,
            renderItem.geometry!,
            renderItem.material,
            renderItem.object,
            renderItem.group ?? NULL_GROUP,
          );
          renderedPickingItemCount++;
        }
      };
      renderer.render(this.pickingScene, camera);

      const pixel = new Uint8Array(4);
      renderer.readRenderTargetPixels(
        renderTarget,
        PICK_PIXEL_CENTER,
        PICK_PIXEL_CENTER,
        1,
        1,
        pixel,
      );
      const objectId = objectIdFromPixel(pixel);
      const label = objectLabels.get(objectId);

      return {
        status: label != undefined ? "picked" : "none",
        label,
        renderer: "webgl",
        canvasX,
        canvasY,
        drawingBufferWidth,
        drawingBufferHeight,
        pixelRatio,
        viewOffset,
        pickViewportRect,
        readX: PICK_PIXEL_CENTER,
        readY: PICK_PIXEL_CENTER,
        pixel: [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0, pixel[3] ?? 0],
        objectId,
        objectIds,
        renderItemCount: renderItems.length,
        renderedPickingItemCount,
      };
    } finally {
      this.pickingScene.onAfterRender = () => undefined;
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
      for (const state of materialStates) {
        state.material.blending = state.blending;
      }
      renderer.info.autoReset = previousInfoAutoReset;
      renderer.setClearColor(previousClearColor, previousClearAlpha);
      renderer.setRenderTarget(previousRenderTarget);
      this.applyFullCanvasViewport();
    }
  }

  private getFullCanvasRect(): CssRect {
    if (!this.canvas) {
      return { left: 0, top: 0, width: CANVAS_SIZE, height: CANVAS_SIZE };
    }

    return {
      left: 0,
      top: 0,
      width: this.canvas.clientWidth,
      height: this.canvas.clientHeight,
    };
  }

  private applyFullCanvasViewport(): void {
    if (!this.renderer || !this.canvas) {
      return;
    }

    this.renderer.setViewport(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setScissor(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setScissorTest(false);
  }

  private ensurePickingRenderTarget(): THREE.WebGLRenderTarget {
    this.pickingRenderTarget ??= new THREE.WebGLRenderTarget(PICK_PIXEL_WIDTH, PICK_PIXEL_WIDTH, {
      depthBuffer: true,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      stencilBuffer: false,
    });

    return this.pickingRenderTarget;
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
  const pickQueryIdRef = useRef(0);

  const [storyScene] = useState(() => new StoryScene({ renderer, logDepthBuffer }));
  const [label, setLabel] = useState<Label>();
  const [pickDebugText, setPickDebugText] = useState("Click the canvas to run a pick query.");
  const [lastPickViewportRect, setLastPickViewportRect] = useState<CssRect>();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      throw new Error("expected canvas");
    }
    storyScene.setCanvas(canvas);
    const newLabel = storyScene.labelPool.acquire();
    newLabel.name = "Label";
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

  const handleClick = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const pickRequest = {
        ...getCanvasPointerPosition(event.currentTarget, event.nativeEvent),
        queryId: ++pickQueryIdRef.current,
      };

      setPickDebugText(
        `q${pickRequest.queryId} pending\nxy ${pickRequest.canvasX.toFixed(1)},${pickRequest.canvasY.toFixed(1)}`,
      );

      void (async () => {
        try {
          const pickResult = await storyScene.pickAt(pickRequest.canvasX, pickRequest.canvasY);
          if (pickQueryIdRef.current !== pickRequest.queryId) {
            return;
          }

          setLastPickViewportRect(pickResult.pickViewportRect);
          setPickDebugText(formatPickDebugTooltip(pickRequest.queryId, pickResult));
        } catch (error: unknown) {
          console.error("Failed to pick clicked label", error);
          if (pickQueryIdRef.current !== pickRequest.queryId) {
            return;
          }

          setPickDebugText(
            `q${pickRequest.queryId} error\nxy ${pickRequest.canvasX.toFixed(1)},${pickRequest.canvasY.toFixed(1)}\n${String(error)}`,
          );
        }
      })();
    },
    [storyScene],
  );

  return (
    <div style={{ width: CANVAS_SIZE }}>
      <div style={{ position: "relative", width: CANVAS_SIZE, height: CANVAS_SIZE }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          onClick={handleClick}
          style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
        />
        {lastPickViewportRect != undefined && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: lastPickViewportRect.left,
              top: lastPickViewportRect.top,
              width: lastPickViewportRect.width,
              height: lastPickViewportRect.height,
              border: "1px solid rgba(255, 48, 48, 0.95)",
              boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.8)",
              boxSizing: "border-box",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
      <textarea
        readOnly
        aria-label="Pick debug output"
        value={pickDebugText}
        style={{
          display: "block",
          width: "100%",
          height: 180,
          marginTop: 8,
          boxSizing: "border-box",
          resize: "vertical",
          fontFamily: "monospace",
          fontSize: 12,
          lineHeight: "16px",
          whiteSpace: "pre",
        }}
      />
    </div>
  );
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
export const LogarithmicDepthWebGPU: StoryObj<typeof meta> = {
  name: "Logarithmic Depth (WebGPU)",
  args: {
    renderer: "webgpu",
    logDepthBuffer: true,
  },
};
export const LogarithmicDepthWebGPUForceWebGL: StoryObj<typeof meta> = {
  name: "Logarithmic Depth (WebGPU, Force WebGL)",
  args: {
    renderer: "webgpu-force-webgl",
    logDepthBuffer: true,
  },
};
