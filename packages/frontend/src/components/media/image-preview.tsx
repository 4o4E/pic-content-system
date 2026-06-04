import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Maximize2, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { createPortal } from "react-dom";

export interface ImagePreviewItem {
  src: string;
  alt?: string;
  downloadUrl?: string;
}

export interface ImagePreviewGroup {
  label?: string;
  images: ImagePreviewItem[];
}

export interface ImagePreviewState {
  visible: boolean;
  images: ImagePreviewItem[];
  activeIndex: number;
  groups?: ImagePreviewGroup[];
  groupIndex?: number;
}

type Point = {
  x: number;
  y: number;
};

type ImageSize = {
  width: number;
  height: number;
};

type ImageTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

type LoadedImageSize = {
  size: ImageSize;
  src: string;
};

type DragStart = {
  point: Point;
  transform: ImageTransform;
};

type PinchStart = {
  angle: number;
  distance: number;
  focal: Point;
  transform: ImageTransform;
};

const minScale = 0.5;
const maxScale = 12;
const previewPadding = 32;
const previewVerticalReserve = 128;

export const emptyImagePreviewState: ImagePreviewState = {
  visible: false,
  images: [],
  activeIndex: 0,
  groups: [],
  groupIndex: 0,
};

export function createImagePreviewState(images: ImagePreviewItem[], activeIndex = 0, groups: ImagePreviewGroup[] = [], groupIndex = 0): ImagePreviewState {
  return {
    visible: images.length > 0,
    images,
    activeIndex,
    groups,
    groupIndex,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function distance(left: Point, right: Point) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function angle(left: Point, right: Point) {
  return (Math.atan2(right.y - left.y, right.x - left.x) * 180) / Math.PI;
}

function midpoint(left: Point, right: Point) {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
}

function previewClickZone(clientX: number) {
  const unit = window.innerWidth / 3;
  if (clientX < unit) return "left";
  if (clientX > unit * 2) return "right";
  return undefined;
}

function isPreviewControlTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("[data-image-preview-controls], button, a"));
}

function pointFromEvent(event: ReactPointerEvent<HTMLElement>): Point {
  return {
    x: event.clientX,
    y: event.clientY,
  };
}

function pointDistance(left: Point, right: Point) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function capturePointer(element: HTMLElement, pointerId: number) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    return;
  }
}

function releasePointer(element: HTMLElement, pointerId: number) {
  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    return;
  }
}

function firstTwoPoints(points: Point[]) {
  const left = points[0];
  const right = points[1];
  return left && right ? [left, right] as const : undefined;
}

function createInitialTransform(imageSize: ImageSize, viewportSize: ImageSize): ImageTransform {
  const areaWidth = Math.max(viewportSize.width - previewPadding, 1);
  const areaHeight = Math.max(viewportSize.height - previewVerticalReserve, 1);
  const widthFill = areaWidth / imageSize.width;
  const heightFill = areaHeight / imageSize.height;
  const scale = clamp(Math.min(widthFill, heightFill), minScale, maxScale);
  const scaledHeight = imageSize.height * scale;
  const topOffset = scaledHeight > areaHeight ? previewVerticalReserve / 2 + scaledHeight / 2 - viewportSize.height / 2 : 0;

  // 默认优先完整显示；下限 50% 导致长图放不全时，从顶部开始展示。
  return {
    x: 0,
    y: topOffset,
    scale,
    rotation: 0,
  };
}

export function ImagePreviewViewer({ state, onClose }: { state: ImagePreviewState; onClose: () => void }) {
  const [activeIndex, setActiveIndex] = useState(state.activeIndex);
  const [groupIndex, setGroupIndex] = useState(state.groupIndex ?? 0);
  const [loadedImageSize, setLoadedImageSize] = useState<LoadedImageSize | null>(null);
  const [viewportSize, setViewportSize] = useState<ImageSize>({ width: 0, height: 0 });
  const [transform, setTransform] = useState<ImageTransform>({ x: 0, y: 0, scale: 1, rotation: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const dragStartRef = useRef<DragStart | null>(null);
  const pinchStartRef = useRef<PinchStart | null>(null);
  const tapStartRef = useRef<{ point: Point; target: EventTarget | null; time: number } | null>(null);
  const transformRef = useRef(transform);
  const activeGroup = state.groups?.[groupIndex];
  const activeImages = activeGroup?.images.length ? activeGroup.images : state.images;
  const safeActiveIndex = Math.min(Math.max(activeIndex, 0), Math.max(activeImages.length - 1, 0));
  const activeImage = activeImages[safeActiveIndex];
  const imageSize = loadedImageSize && loadedImageSize.src === activeImage?.src ? loadedImageSize.size : null;
  const groups = state.groups ?? [];
  const canChangeGroup = groups.length > 1;

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const applyTransform = useCallback((nextTransform: ImageTransform) => {
    transformRef.current = nextTransform;
    setTransform(nextTransform);
  }, []);

  const updateImageSize = useCallback((image: HTMLImageElement, src: string) => {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width === 0 || height === 0) return;
    setLoadedImageSize({ src, size: { width, height } });
  }, []);

  useEffect(() => {
    if (!state.visible) return;
    const nextGroupIndex = Math.min(Math.max(state.groupIndex ?? 0, 0), Math.max(groups.length - 1, 0));
    const nextImages = groups[nextGroupIndex]?.images.length ? groups[nextGroupIndex].images : state.images;
    setGroupIndex(nextGroupIndex);
    setActiveIndex(Math.min(Math.max(state.activeIndex, 0), Math.max(nextImages.length - 1, 0)));
  }, [groups, state.activeIndex, state.groupIndex, state.images, state.visible]);

  useEffect(() => {
    pointersRef.current.clear();
    dragStartRef.current = null;
    pinchStartRef.current = null;
    tapStartRef.current = null;
    const image = imageRef.current;
    if (activeImage?.src && image?.complete) {
      updateImageSize(image, activeImage.src);
    }
  }, [activeImage?.src, groupIndex, safeActiveIndex, updateImageSize]);

  useEffect(() => {
    if (!state.visible || !stageRef.current) return;
    const stage = stageRef.current;

    function updateViewportSize() {
      const rect = stage.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
    }

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [state.visible]);

  useEffect(() => {
    if (!imageSize || viewportSize.width === 0 || viewportSize.height === 0) return;
    applyTransform(createInitialTransform(imageSize, viewportSize));
  }, [activeImage?.src, applyTransform, groupIndex, imageSize, safeActiveIndex, viewportSize.height, viewportSize.width]);

  const changeGroup = useCallback(
    (offset: number, target: "first" | "last" = "first") => {
      if (groups.length === 0) return;
      const next = Math.min(Math.max(groupIndex + offset, 0), groups.length - 1);
      if (next === groupIndex) return;
      const nextImages = groups[next]?.images ?? [];
      const nextActiveIndex = target === "last" ? Math.max(nextImages.length - 1, 0) : 0;
      setGroupIndex(next);
      setActiveIndex(nextActiveIndex);
    },
    [groupIndex, groups],
  );

  const navigateImage = useCallback(
    (offset: number) => {
      if (offset > 0) {
        if (safeActiveIndex < activeImages.length - 1) {
          setActiveIndex(safeActiveIndex + 1);
          return;
        }
        changeGroup(1, "first");
        return;
      }

      if (safeActiveIndex > 0) {
        setActiveIndex(safeActiveIndex - 1);
        return;
      }
      changeGroup(-1, "last");
    },
    [activeImages.length, changeGroup, safeActiveIndex],
  );

  const stageCenter = useCallback(() => {
    const rect = stageRef.current?.getBoundingClientRect();
    return {
      x: (rect?.left ?? 0) + (rect?.width ?? window.innerWidth) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? window.innerHeight) / 2,
    };
  }, []);

  const screenToLocal = useCallback(
    (point: Point, current: ImageTransform) => {
      const center = stageCenter();
      const radians = (current.rotation * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const dx = point.x - center.x - current.x;
      const dy = point.y - center.y - current.y;
      return {
        x: (cos * dx + sin * dy) / current.scale,
        y: (-sin * dx + cos * dy) / current.scale,
      };
    },
    [stageCenter],
  );

  // 将触点换算到图片坐标，保证缩放和旋转围绕手指焦点发生。
  const transformFromFocal = useCallback(
    (point: Point, scale: number, rotation: number, focal: Point): ImageTransform => {
      const center = stageCenter();
      const radians = (rotation * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      return {
        x: point.x - center.x - (cos * scale * focal.x - sin * scale * focal.y),
        y: point.y - center.y - (sin * scale * focal.x + cos * scale * focal.y),
        scale,
        rotation,
      };
    },
    [stageCenter],
  );

  const resetTransform = useCallback(() => {
    if (!imageSize || viewportSize.width === 0 || viewportSize.height === 0) return;
    applyTransform(createInitialTransform(imageSize, viewportSize));
  }, [applyTransform, imageSize, viewportSize]);

  const zoomAt = useCallback(
    (point: Point, factor: number) => {
      const current = transformRef.current;
      const nextScale = clamp(current.scale * factor, minScale, maxScale);
      const focal = screenToLocal(point, current);
      applyTransform(transformFromFocal(point, nextScale, current.rotation, focal));
    },
    [applyTransform, screenToLocal, transformFromFocal],
  );

  const zoomFromCenter = useCallback(
    (factor: number) => {
      zoomAt(stageCenter(), factor);
    },
    [stageCenter, zoomAt],
  );

  const rotateBy = useCallback(
    (degrees: number) => {
      const current = transformRef.current;
      applyTransform({ ...current, rotation: current.rotation + degrees });
    },
    [applyTransform],
  );

  function setupPinchStart(currentTransform = transformRef.current) {
    const pair = firstTwoPoints(Array.from(pointersRef.current.values()));
    if (!pair) return;
    const [left, right] = pair;
    const center = midpoint(left, right);
    pinchStartRef.current = {
      angle: angle(left, right),
      distance: Math.max(distance(left, right), 1),
      focal: screenToLocal(center, currentTransform),
      transform: currentTransform,
    };
    dragStartRef.current = null;
  }

  function setupDragStart(currentTransform = transformRef.current) {
    const [point] = Array.from(pointersRef.current.values());
    if (!point) return;
    dragStartRef.current = { point, transform: currentTransform };
    pinchStartRef.current = null;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (isPreviewControlTarget(event.target)) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    pointersRef.current.set(event.pointerId, point);
    capturePointer(event.currentTarget, event.pointerId);

    if (pointersRef.current.size === 1) {
      tapStartRef.current = { point, target: event.target, time: Date.now() };
      setupDragStart();
      return;
    }

    tapStartRef.current = null;
    setupPinchStart();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    pointersRef.current.set(event.pointerId, pointFromEvent(event));

    if (pointersRef.current.size >= 2 && pinchStartRef.current) {
      const pair = firstTwoPoints(Array.from(pointersRef.current.values()));
      if (!pair) return;
      const [left, right] = pair;
      const center = midpoint(left, right);
      const currentDistance = Math.max(distance(left, right), 1);
      const currentAngle = angle(left, right);
      const nextScale = clamp(pinchStartRef.current.transform.scale * (currentDistance / pinchStartRef.current.distance), minScale, maxScale);
      const nextRotation = pinchStartRef.current.transform.rotation + currentAngle - pinchStartRef.current.angle;
      applyTransform(transformFromFocal(center, nextScale, nextRotation, pinchStartRef.current.focal));
      return;
    }

    if (pointersRef.current.size === 1 && dragStartRef.current) {
      const point = pointFromEvent(event);
      applyTransform({
        ...dragStartRef.current.transform,
        x: dragStartRef.current.transform.x + point.x - dragStartRef.current.point.x,
        y: dragStartRef.current.transform.y + point.y - dragStartRef.current.point.y,
      });
    }
  }

  function handlePreviewTap(point: Point, target: EventTarget | null) {
    if (isPreviewControlTarget(target)) return;
    const zone = previewClickZone(point.x);
    if (zone === "left") {
      navigateImage(-1);
      return;
    }
    if (zone === "right") {
      navigateImage(1);
      return;
    }
    onClose();
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    const tapStart = tapStartRef.current;
    const isTap = pointersRef.current.size === 1 && tapStart && pointDistance(point, tapStart.point) < 8 && Date.now() - tapStart.time < 350;
    pointersRef.current.delete(event.pointerId);
    releasePointer(event.currentTarget, event.pointerId);

    if (pointersRef.current.size >= 2) {
      setupPinchStart();
    } else if (pointersRef.current.size === 1) {
      setupDragStart();
    } else {
      dragStartRef.current = null;
      pinchStartRef.current = null;
    }

    if (isTap) handlePreviewTap(point, tapStart.target);
    tapStartRef.current = null;
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    zoomAt({ x: event.clientX, y: event.clientY }, event.deltaY < 0 ? 1.12 : 0.88);
  }

  useEffect(() => {
    if (!state.visible) return;

    function handleKeyDown(event: KeyboardEvent) {
      const handledKeys = ["Escape", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "+", "=", "-", "_", "0", "[", "]"];
      if (!handledKeys.includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") navigateImage(-1);
      if (event.key === "ArrowRight") navigateImage(1);
      if (event.key === "PageUp") changeGroup(-1);
      if (event.key === "PageDown") changeGroup(1);
      if (event.key === "+" || event.key === "=") zoomFromCenter(1.18);
      if (event.key === "-" || event.key === "_") zoomFromCenter(0.82);
      if (event.key === "0") resetTransform();
      if (event.key === "[") rotateBy(-90);
      if (event.key === "]") rotateBy(90);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [changeGroup, navigateImage, onClose, resetTransform, rotateBy, state.visible, zoomFromCenter]);

  if (!state.visible || !activeImage) return null;

  const preview = (
    <div
      ref={stageRef}
      className="fixed inset-0 z-[1200] overflow-hidden bg-black/90 text-white"
      style={{ overscrollBehavior: "none", touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onWheel={handleWheel}
    >
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <img
          ref={imageRef}
          className="pointer-events-auto select-none"
          style={{
            height: imageSize ? `${imageSize.height}px` : "auto",
            maxHeight: "none",
            maxWidth: "none",
            touchAction: "none",
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(${transform.rotation}deg) scale(${transform.scale})`,
            transformOrigin: "center center",
            userSelect: "none",
            width: imageSize ? `${imageSize.width}px` : "auto",
            willChange: "transform",
          }}
          src={activeImage.src}
          alt={activeImage.alt ?? "图片预览"}
          draggable={false}
          onLoad={(event) => updateImageSize(event.currentTarget, activeImage.src)}
        />
      </div>

      {canChangeGroup && (
        <div data-image-preview-controls className="fixed left-1/2 top-3 z-[1215] flex max-w-[calc(100vw-5rem)] -translate-x-1/2 items-center gap-2 rounded-md bg-black/70 p-2 text-white shadow-lg">
          <button
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-40"
            type="button"
            title="上一条内容"
            disabled={groupIndex === 0}
            onClick={() => changeGroup(-1)}
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 px-1 text-center text-xs leading-5">
            <div className="max-w-[50vw] truncate font-medium">{activeGroup?.label ?? `第 ${groupIndex + 1} 条内容`}</div>
            <div className="text-white/70">
              {groupIndex + 1} / {groups.length}
            </div>
          </div>
          <button
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-40"
            type="button"
            title="下一条内容"
            disabled={groupIndex >= groups.length - 1}
            onClick={() => changeGroup(1)}
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <button data-image-preview-controls className="fixed left-3 top-1/2 z-[1215] hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md bg-black/60 hover:bg-white/10 sm:flex" type="button" title="上一张图片" onClick={() => navigateImage(-1)}>
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button data-image-preview-controls className="fixed right-3 top-1/2 z-[1215] hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md bg-black/60 hover:bg-white/10 sm:flex" type="button" title="下一张图片" onClick={() => navigateImage(1)}>
        <ChevronRight className="h-6 w-6" />
      </button>

      <div data-image-preview-controls className="fixed bottom-3 left-1/2 z-[1215] flex w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-nowrap items-center justify-center gap-1 overflow-x-auto rounded-md bg-black/70 p-2 text-white shadow-lg">
        <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-white/10 sm:h-9 sm:w-9" type="button" title="缩小" onClick={() => zoomFromCenter(0.82)}>
          <ZoomOut className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-white/10 sm:h-9 sm:w-9" type="button" title="放大" onClick={() => zoomFromCenter(1.18)}>
          <ZoomIn className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-white/10 sm:h-9 sm:w-9" type="button" title="逆时针旋转" onClick={() => rotateBy(-90)}>
          <RotateCcw className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-white/10 sm:h-9 sm:w-9" type="button" title="顺时针旋转" onClick={() => rotateBy(90)}>
          <RotateCw className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-white/10 sm:h-9 sm:w-9" type="button" title="重置填充" onClick={resetTransform}>
          <Maximize2 className="h-4 w-4" />
        </button>
        <a className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-white/10 sm:h-9 sm:w-9" title="下载" href={activeImage.downloadUrl ?? activeImage.src} download>
          <Download className="h-4 w-4" />
        </a>
        <div className="shrink-0 px-2 text-xs text-white/75">
          {safeActiveIndex + 1} / {activeImages.length}
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(preview, document.body);
}
