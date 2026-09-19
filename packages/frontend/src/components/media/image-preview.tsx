import { Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, Download, Ellipsis, RefreshCcw, RotateCcw, RotateCw, Share2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { createPortal } from "react-dom";
import { useAppBackLayer } from "@/lib/app-back-layer";

export interface ImagePreviewItem {
  src: string;
  alt?: string;
  downloadUrl?: string;
}

export interface ImagePreviewGroup {
  anchorId?: string;
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

export interface ImagePreviewClosePayload {
  activeIndex: number;
  group?: ImagePreviewGroup;
  groupIndex: number;
  image?: ImagePreviewItem;
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

type DragStart = {
  mode?: "pan" | "swipe";
  point: Point;
  transform: ImageTransform;
};

type PinchStart = {
  angle: number;
  distance: number;
  focal: Point;
  transform: ImageTransform;
};

type PanBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
};

type ConstrainTransformOptions = {
  minScale?: number;
  snap?: boolean;
};

const absoluteMinScale = 0.0001;
const manualMinScale = 0.01;
const maxScale = 12;
const scaleSnapMinDistance = 0.03;
const scaleSnapRatio = 0.04;
const panEdgeTolerance = 18;
const swipeActivationDistance = 14;
const swipeAnimationMs = 220;
const swipeDominanceRatio = 1.25;
const longPressDelayMs = 550;
const longPressMoveTolerance = 10;

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

function normalizeAngleDelta(degrees: number) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

function snapRightAngle(degrees: number) {
  return Math.round(degrees / 90) * 90;
}

function normalizedRightAngle(degrees: number) {
  return ((snapRightAngle(degrees) % 360) + 360) % 360;
}

function midpoint(left: Point, right: Point) {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
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

function pointFromMouseEvent(event: ReactMouseEvent<HTMLElement>): Point {
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

function rotatedImageSize(imageSize: ImageSize, rotation: number): ImageSize {
  const normalized = normalizedRightAngle(rotation);
  if (normalized === 90 || normalized === 270) {
    return { width: imageSize.height, height: imageSize.width };
  }
  return imageSize;
}

function widthFitScale(imageSize: ImageSize, viewportSize: ImageSize, rotation = 0) {
  const rotatedSize = rotatedImageSize(imageSize, rotation);
  return viewportSize.width / Math.max(rotatedSize.width, 1);
}

function heightFitScale(imageSize: ImageSize, viewportSize: ImageSize, rotation = 0) {
  const rotatedSize = rotatedImageSize(imageSize, rotation);
  return viewportSize.height / Math.max(rotatedSize.height, 1);
}

function touchMinScale(imageSize: ImageSize, viewportSize: ImageSize, rotation: number) {
  return clamp(Math.min(widthFitScale(imageSize, viewportSize, rotation), heightFitScale(imageSize, viewportSize, rotation)), absoluteMinScale, maxScale);
}

function snapScale(scale: number, imageSize: ImageSize, viewportSize: ImageSize, rotation: number, minScale: number) {
  const targets = [widthFitScale(imageSize, viewportSize, rotation), 1];
  for (const target of targets) {
    const distance = Math.max(scaleSnapMinDistance, target * scaleSnapRatio);
    if (target >= minScale && target <= maxScale && Math.abs(scale - target) <= distance) return target;
  }
  return scale;
}

function constrainScale(scale: number, imageSize: ImageSize, viewportSize: ImageSize, rotation: number, minScale: number, shouldSnap: boolean) {
  const lowerScale = clamp(minScale, absoluteMinScale, maxScale);
  const clampedScale = clamp(scale, lowerScale, maxScale);
  return shouldSnap ? snapScale(clampedScale, imageSize, viewportSize, rotation, lowerScale) : clampedScale;
}

function panBounds(imageSize: ImageSize, viewportSize: ImageSize, transform: ImageTransform): PanBounds {
  const rotatedSize = rotatedImageSize(imageSize, transform.rotation);
  const scaledWidth = rotatedSize.width * transform.scale;
  const scaledHeight = rotatedSize.height * transform.scale;
  const maxX = Math.max((scaledWidth - viewportSize.width) / 2, 0);
  const maxY = Math.max((scaledHeight - viewportSize.height) / 2, 0);
  return {
    maxX,
    maxY,
    minX: -maxX,
    minY: -maxY,
  };
}

function clampTransformPosition(transform: ImageTransform, imageSize: ImageSize, viewportSize: ImageSize): ImageTransform {
  const bounds = panBounds(imageSize, viewportSize, transform);
  return {
    ...transform,
    x: clamp(transform.x, bounds.minX, bounds.maxX),
    y: clamp(transform.y, bounds.minY, bounds.maxY),
  };
}

function constrainTransform(transform: ImageTransform, imageSize: ImageSize, viewportSize: ImageSize, options: ConstrainTransformOptions = {}): ImageTransform {
  const rotation = snapRightAngle(transform.rotation);
  const scale = constrainScale(transform.scale, imageSize, viewportSize, rotation, options.minScale ?? manualMinScale, options.snap ?? true);
  return clampTransformPosition({ ...transform, rotation, scale }, imageSize, viewportSize);
}

function canSwipeNavigate(transform: ImageTransform, imageSize: ImageSize, viewportSize: ImageSize, deltaX: number) {
  const bounds = panBounds(imageSize, viewportSize, transform);
  if (bounds.maxX <= panEdgeTolerance) return true;
  return deltaX > 0 ? transform.x >= bounds.maxX - panEdgeTolerance : transform.x <= bounds.minX + panEdgeTolerance;
}

export function createInitialTransform(imageSize: ImageSize, viewportSize: ImageSize): ImageTransform {
  const isLongImage = imageSize.height > imageSize.width * 4;
  const desktop = viewportSize.width >= 640;
  const fitViewport = {
    width: Math.max(viewportSize.width - (desktop ? 120 : 24), 1),
    height: Math.max(viewportSize.height - (desktop ? 160 : 128), 1),
  };
  const scale = clamp(
    isLongImage ? widthFitScale(imageSize, viewportSize) : Math.min(widthFitScale(imageSize, fitViewport), heightFitScale(imageSize, fitViewport)),
    absoluteMinScale,
    maxScale,
  );
  const nextTransform = {
    x: 0,
    y: 0,
    scale,
    rotation: 0,
  };
  const bounds = panBounds(imageSize, viewportSize, nextTransform);

  // 只有高度超过宽度四倍的图片从顶部开始阅读；其他图片完整显示。
  return {
    ...nextTransform,
    y: isLongImage ? Math.max(bounds.maxY - (desktop ? 80 : 0), 0) : 0,
  };
}

function resolveAdjacentPreviewImage(activeImages: ImagePreviewItem[], groups: ImagePreviewGroup[], groupIndex: number, activeIndex: number, offset: -1 | 1) {
  const sameGroupIndex = activeIndex + offset;
  if (sameGroupIndex >= 0 && sameGroupIndex < activeImages.length) return activeImages[sameGroupIndex] ?? null;
  if (groups.length === 0) return null;
  const targetGroupIndex = groupIndex + offset;
  if (targetGroupIndex < 0 || targetGroupIndex >= groups.length) return null;
  const targetImages = groups[targetGroupIndex]?.images ?? [];
  return offset > 0 ? targetImages[0] ?? null : targetImages[targetImages.length - 1] ?? null;
}

export function ImagePreviewViewer({ state, onClose }: { state: ImagePreviewState; onClose: (payload: ImagePreviewClosePayload) => void }) {
  const [activeIndex, setActiveIndex] = useState(state.activeIndex);
  const [groupIndex, setGroupIndex] = useState(state.groupIndex ?? 0);
  const [imageSizes, setImageSizes] = useState<Record<string, ImageSize>>({});
  const [viewportSize, setViewportSize] = useState<ImageSize>({ width: 0, height: 0 });
  const [transform, setTransform] = useState<ImageTransform>({ x: 0, y: 0, scale: 1, rotation: 0 });
  const [mobileControlsVisible, setMobileControlsVisible] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [longPressMenuVisible, setLongPressMenuVisible] = useState(false);
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [shareError, setShareError] = useState("");
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwipeAnimating, setIsSwipeAnimating] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const dragStartRef = useRef<DragStart | null>(null);
  const pinchStartRef = useRef<PinchStart | null>(null);
  const tapStartRef = useRef<{ point: Point; target: EventTarget | null; time: number } | null>(null);
  const tapClosePendingRef = useRef(false);
  const mouseGestureActiveRef = useRef(false);
  const swipeAnimationTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressActivatedRef = useRef(false);
  const swipeOffsetRef = useRef(swipeOffset);
  const transformRef = useRef(transform);
  const activeGroup = state.groups?.[groupIndex];
  const activeImages = activeGroup?.images.length ? activeGroup.images : state.images;
  const safeActiveIndex = Math.min(Math.max(activeIndex, 0), Math.max(activeImages.length - 1, 0));
  const activeImage = activeImages[safeActiveIndex];
  const imageSize = activeImage ? imageSizes[activeImage.src] ?? null : null;
  const groups = state.groups ?? [];
  const canChangeGroup = groups.length > 1;
  const previousImage = resolveAdjacentPreviewImage(activeImages, groups, groupIndex, safeActiveIndex, -1);
  const nextImage = resolveAdjacentPreviewImage(activeImages, groups, groupIndex, safeActiveIndex, 1);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useEffect(() => {
    swipeOffsetRef.current = swipeOffset;
  }, [swipeOffset]);

  useEffect(() => {
    return () => {
      if (swipeAnimationTimerRef.current !== null) {
        window.clearTimeout(swipeAnimationTimerRef.current);
      }
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const hideMobileControls = useCallback(() => {
    setMobileControlsVisible(false);
    setCopyFeedback("");
  }, []);

  const applyTransform = useCallback((nextTransform: ImageTransform) => {
    transformRef.current = nextTransform;
    setTransform(nextTransform);
  }, []);

  const applyConstrainedTransform = useCallback(
    (nextTransform: ImageTransform, options: ConstrainTransformOptions = {}) => {
      if (!imageSize || viewportSize.width === 0 || viewportSize.height === 0) {
        applyTransform(nextTransform);
        return;
      }
      applyTransform(constrainTransform(nextTransform, imageSize, viewportSize, options));
    },
    [applyTransform, imageSize, viewportSize],
  );

  const updateImageSize = useCallback((image: HTMLImageElement, src: string) => {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width === 0 || height === 0) return;
    setImageSizes((current) => {
      const currentSize = current[src];
      if (currentSize?.width === width && currentSize.height === height) return current;
      return { ...current, [src]: { width, height } };
    });
  }, []);

  const applyInitialTransformForImage = useCallback(
    (image?: ImagePreviewItem) => {
      if (!image || viewportSize.width === 0 || viewportSize.height === 0) return;
      const targetSize = imageSizes[image.src];
      if (!targetSize) return;
      applyTransform(createInitialTransform(targetSize, viewportSize));
    },
    [applyTransform, imageSizes, viewportSize],
  );

  const closePreview = useCallback(() => {
    onClose({
      activeIndex: safeActiveIndex,
      group: activeGroup,
      groupIndex,
      image: activeImage,
    });
  }, [activeGroup, activeImage, groupIndex, onClose, safeActiveIndex]);
  useAppBackLayer(state.visible, closePreview);

  useEffect(() => {
    if (!state.visible) return;
    const nextGroupIndex = Math.min(Math.max(state.groupIndex ?? 0, 0), Math.max(groups.length - 1, 0));
    const nextImages = groups[nextGroupIndex]?.images.length ? groups[nextGroupIndex].images : state.images;
    setGroupIndex(nextGroupIndex);
    setActiveIndex(Math.min(Math.max(state.activeIndex, 0), Math.max(nextImages.length - 1, 0)));
  }, [groups, state.activeIndex, state.groupIndex, state.images, state.visible]);

  useEffect(() => {
    if (!state.visible) setMobileControlsVisible(false);
  }, [state.visible]);

  useEffect(() => {
    pointersRef.current.clear();
    dragStartRef.current = null;
    pinchStartRef.current = null;
    tapStartRef.current = null;
    tapClosePendingRef.current = false;
    setSwipeOffset(0);
    setIsSwipeAnimating(false);
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    longPressActivatedRef.current = false;
    setLongPressMenuVisible(false);
    setShareFile(null);
    setShareError("");
    const image = imageRef.current;
    if (activeImage?.src && image?.complete) {
      updateImageSize(image, activeImage.src);
    }
  }, [activeImage?.src, groupIndex, safeActiveIndex, updateImageSize]);

  useEffect(() => {
    if (!longPressMenuVisible || !activeImage) return;
    let cancelled = false;
    setShareFile(null);
    setShareError("");
    fetch(activeImage.src)
      .then(async (response) => {
        if (!response.ok) throw new Error(`读取图片失败：${response.status}`);
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error("图片格式无法分享");
        const extension = blob.type.slice("image/".length).replace("+xml", "");
        if (!cancelled) setShareFile(new File([blob], `image.${extension}`, { type: blob.type }));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setShareError(cause instanceof Error ? cause.message : "读取图片失败");
      });
    return () => { cancelled = true; };
  }, [activeImage?.src, longPressMenuVisible]);

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

  useEffect(() => {
    if (!state.visible || typeof window === "undefined") return;
    const preloadSources = Array.from(new Set([activeImage?.src, previousImage?.src, nextImage?.src].filter((src): src is string => Boolean(src))));
    const preloaders = preloadSources.map((src) => {
      const image = new window.Image();
      image.decoding = "async";
      image.src = src;
      return image;
    });

    // 预加载当前和相邻图片，切图时优先复用浏览器缓存。
    return () => {
      preloaders.forEach((image) => {
        image.onload = null;
        image.onerror = null;
      });
    };
  }, [activeImage?.src, nextImage?.src, previousImage?.src, state.visible]);

  const changeGroup = useCallback(
    (offset: number, target: "first" | "last" = "first") => {
      if (groups.length === 0) return;
      const next = Math.min(Math.max(groupIndex + offset, 0), groups.length - 1);
      if (next === groupIndex) return;
      const nextImages = groups[next]?.images ?? [];
      const nextActiveIndex = target === "last" ? Math.max(nextImages.length - 1, 0) : 0;
      applyInitialTransformForImage(nextImages[nextActiveIndex]);
      setGroupIndex(next);
      setActiveIndex(nextActiveIndex);
    },
    [applyInitialTransformForImage, groupIndex, groups],
  );

  const canNavigateImage = useCallback(
    (offset: number) => {
      if (offset > 0) return safeActiveIndex < activeImages.length - 1 || groupIndex < groups.length - 1;
      return safeActiveIndex > 0 || groupIndex > 0;
    },
    [activeImages.length, groupIndex, groups.length, safeActiveIndex],
  );

  const commitNavigateImage = useCallback(
    (offset: number) => {
      let nextGroupIndex = groupIndex;
      let nextActiveIndex = safeActiveIndex;
      if (offset > 0) {
        if (safeActiveIndex < activeImages.length - 1) {
          nextActiveIndex = safeActiveIndex + 1;
        } else {
          nextGroupIndex = groupIndex + 1;
          nextActiveIndex = 0;
        }
      } else if (safeActiveIndex > 0) {
        nextActiveIndex = safeActiveIndex - 1;
      } else {
        nextGroupIndex = groupIndex - 1;
        nextActiveIndex = Math.max((groups[nextGroupIndex]?.images.length ?? 1) - 1, 0);
      }

      const nextImages = groups[nextGroupIndex]?.images.length ? groups[nextGroupIndex]?.images ?? [] : activeImages;
      const nextImage = nextImages[nextActiveIndex];
      applyInitialTransformForImage(nextImage);
      if (nextGroupIndex !== groupIndex) setGroupIndex(nextGroupIndex);
      setActiveIndex(nextActiveIndex);
    },
    [activeImages, applyInitialTransformForImage, groupIndex, groups, safeActiveIndex],
  );

  const animateSwipeOffset = useCallback((targetOffset: number, after?: () => void) => {
    if (swipeAnimationTimerRef.current !== null) {
      window.clearTimeout(swipeAnimationTimerRef.current);
    }
    setIsSwipeAnimating(true);
    setSwipeOffset(targetOffset);
    swipeOffsetRef.current = targetOffset;
    swipeAnimationTimerRef.current = window.setTimeout(() => {
      after?.();
      setSwipeOffset(0);
      swipeOffsetRef.current = 0;
      setIsSwipeAnimating(false);
      swipeAnimationTimerRef.current = null;
    }, swipeAnimationMs);
  }, []);

  const navigateImage = useCallback(
    (offset: number) => {
      if (!canNavigateImage(offset)) return;
      if (swipeAnimationTimerRef.current !== null) return;
      if (viewportSize.width <= 0) {
        commitNavigateImage(offset);
        return;
      }
      animateSwipeOffset(offset > 0 ? -viewportSize.width : viewportSize.width, () => commitNavigateImage(offset));
    },
    [animateSwipeOffset, canNavigateImage, commitNavigateImage, viewportSize.width],
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

  // 将触点换算到图片坐标，保证缩放围绕手指焦点发生。
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
    hideMobileControls();
    applyTransform(createInitialTransform(imageSize, viewportSize));
  }, [applyTransform, hideMobileControls, imageSize, viewportSize]);

  const zoomAt = useCallback(
    (point: Point, factor: number, minScale = manualMinScale) => {
      hideMobileControls();
      const current = transformRef.current;
      const nextRotation = snapRightAngle(current.rotation);
      const nextScale = imageSize && viewportSize.width > 0 && viewportSize.height > 0
        ? constrainScale(current.scale * factor, imageSize, viewportSize, nextRotation, minScale, true)
        : clamp(current.scale * factor, minScale, maxScale);
      const focal = screenToLocal(point, current);
      applyConstrainedTransform(transformFromFocal(point, nextScale, nextRotation, focal), { minScale, snap: false });
    },
    [applyConstrainedTransform, hideMobileControls, imageSize, screenToLocal, transformFromFocal, viewportSize],
  );

  const zoomFromCenter = useCallback(
    (factor: number) => {
      zoomAt(stageCenter(), factor);
    },
    [stageCenter, zoomAt],
  );

  const rotateBy = useCallback(
    (degrees: number) => {
      hideMobileControls();
      const current = transformRef.current;
      const nextRotation = snapRightAngle(current.rotation + degrees);
      applyConstrainedTransform({ ...current, rotation: nextRotation }, { snap: false });
    },
    [applyConstrainedTransform, hideMobileControls],
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

  function updateSingleDrag(point: Point) {
    if (!dragStartRef.current) return;
    const deltaX = point.x - dragStartRef.current.point.x;
    const deltaY = point.y - dragStartRef.current.point.y;
    if (
      dragStartRef.current.mode !== "swipe"
      && viewportSize.width > 0
      && viewportSize.height > 0
      && Math.abs(deltaX) >= swipeActivationDistance
      && Math.abs(deltaX) > Math.abs(deltaY) * swipeDominanceRatio
      && canNavigateImage(deltaX < 0 ? 1 : -1)
      && (!imageSize || canSwipeNavigate(dragStartRef.current.transform, imageSize, viewportSize, deltaX))
    ) {
      dragStartRef.current = { ...dragStartRef.current, mode: "swipe" };
      setIsSwipeAnimating(false);
    }

    if (dragStartRef.current.mode === "swipe") {
      const nextOffset = clamp(deltaX, -viewportSize.width, viewportSize.width);
      setSwipeOffset(nextOffset);
      swipeOffsetRef.current = nextOffset;
      return;
    }

    applyConstrainedTransform({
      ...dragStartRef.current.transform,
      x: dragStartRef.current.transform.x + deltaX,
      y: dragStartRef.current.transform.y + deltaY,
    }, { snap: false });
  }

  function finishSingleDrag(point: Point) {
    const tapStart = tapStartRef.current;
    const deltaX = tapStart ? point.x - tapStart.point.x : 0;
    const deltaY = tapStart ? point.y - tapStart.point.y : 0;
    const releaseSwipeOffset = swipeOffsetRef.current || deltaX;
    const releaseSwipeDirection = releaseSwipeOffset < 0 ? 1 : -1;
    const isTap = tapStart && pointDistance(point, tapStart.point) < 8 && Date.now() - tapStart.time < 350;
    const isDirectionalSwipe = tapStart
      && Math.abs(deltaX) >= swipeActivationDistance
      && Math.abs(deltaX) > Math.abs(deltaY) * swipeDominanceRatio
      && canNavigateImage(releaseSwipeDirection)
      && (!imageSize || viewportSize.width === 0 || viewportSize.height === 0 || canSwipeNavigate(dragStartRef.current?.transform ?? transformRef.current, imageSize, viewportSize, releaseSwipeOffset));
    const wasSwipeDrag = dragStartRef.current?.mode === "swipe" || isDirectionalSwipe;
    const isSwipe = wasSwipeDrag
      && tapStart
      && !isPreviewControlTarget(tapStart.target)
      && releaseSwipeOffset !== 0
      && canNavigateImage(releaseSwipeDirection)
      && (!imageSize || viewportSize.width === 0 || viewportSize.height === 0 || canSwipeNavigate(dragStartRef.current?.transform ?? transformRef.current, imageSize, viewportSize, releaseSwipeOffset));

    if (isSwipe) {
      navigateImage(releaseSwipeDirection);
    } else if (wasSwipeDrag) {
      animateSwipeOffset(0);
    } else if (isTap) {
      tapClosePendingRef.current = !isPreviewControlTarget(tapStart.target);
    }
    tapStartRef.current = null;
    dragStartRef.current = null;
    pinchStartRef.current = null;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (isPreviewControlTarget(event.target)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (longPressMenuVisible) return;
    event.preventDefault();
    hideMobileControls();
    tapClosePendingRef.current = false;
    const point = pointFromEvent(event);
    pointersRef.current.set(event.pointerId, point);
    capturePointer(event.currentTarget, event.pointerId);

    if (pointersRef.current.size === 1) {
      tapStartRef.current = { point, target: event.target, time: Date.now() };
      setupDragStart();
      if (event.pointerType === "touch" && event.target instanceof HTMLImageElement && event.target.dataset.imagePreviewImage) {
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          longPressActivatedRef.current = true;
          dragStartRef.current = null;
          tapStartRef.current = null;
          tapClosePendingRef.current = false;
          setLongPressMenuVisible(true);
        }, longPressDelayMs);
      }
      return;
    }

    cancelLongPress();
    tapStartRef.current = null;
    setSwipeOffset(0);
    swipeOffsetRef.current = 0;
    setupPinchStart();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    if (longPressActivatedRef.current) return;
    const point = pointFromEvent(event);
    if (tapStartRef.current && pointDistance(point, tapStartRef.current.point) > longPressMoveTolerance) cancelLongPress();
    hideMobileControls();
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size >= 2 && pinchStartRef.current) {
      if (swipeOffsetRef.current !== 0) {
        setSwipeOffset(0);
        swipeOffsetRef.current = 0;
      }
      const pair = firstTwoPoints(Array.from(pointersRef.current.values()));
      if (!pair) return;
      const [left, right] = pair;
      const center = midpoint(left, right);
      const currentDistance = Math.max(distance(left, right), 1);
      const currentAngle = angle(left, right);
      const rotationOffset = snapRightAngle(normalizeAngleDelta(currentAngle - pinchStartRef.current.angle));
      const nextRotation = snapRightAngle(pinchStartRef.current.transform.rotation + rotationOffset);
      const minScale = imageSize && viewportSize.width > 0 && viewportSize.height > 0 ? touchMinScale(imageSize, viewportSize, nextRotation) : manualMinScale;
      const nextScale = imageSize && viewportSize.width > 0 && viewportSize.height > 0
        ? constrainScale(pinchStartRef.current.transform.scale * (currentDistance / pinchStartRef.current.distance), imageSize, viewportSize, nextRotation, minScale, true)
        : clamp(pinchStartRef.current.transform.scale * (currentDistance / pinchStartRef.current.distance), minScale, maxScale);
      applyConstrainedTransform(transformFromFocal(center, nextScale, nextRotation, pinchStartRef.current.focal), { minScale, snap: false });
      return;
    }

    if (pointersRef.current.size === 1 && dragStartRef.current) {
      updateSingleDrag(pointFromEvent(event));
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    cancelLongPress();
    const point = pointFromEvent(event);
    const isSinglePointerEnd = pointersRef.current.size === 1;
    pointersRef.current.delete(event.pointerId);
    releasePointer(event.currentTarget, event.pointerId);

    if (longPressActivatedRef.current) {
      longPressActivatedRef.current = false;
      dragStartRef.current = null;
      tapStartRef.current = null;
      pinchStartRef.current = null;
      return;
    }

    if (isSinglePointerEnd) {
      finishSingleDrag(point);
    } else if (pointersRef.current.size >= 2) {
      setupPinchStart();
    } else if (pointersRef.current.size === 1) {
      setupDragStart();
    } else {
      dragStartRef.current = null;
      pinchStartRef.current = null;
    }
  }

  function cancelLongPress() {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }

  function handleMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (pointersRef.current.size > 0 || isPreviewControlTarget(event.target)) return;
    if (event.button !== 0) return;
    event.preventDefault();
    hideMobileControls();
    tapClosePendingRef.current = false;
    mouseGestureActiveRef.current = true;
    const point = pointFromMouseEvent(event);
    tapStartRef.current = { point, target: event.target, time: Date.now() };
    dragStartRef.current = { point, transform: transformRef.current };
    pinchStartRef.current = null;
    setSwipeOffset(0);
    swipeOffsetRef.current = 0;
  }

  function handleMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    if (!mouseGestureActiveRef.current || pointersRef.current.size > 0) return;
    event.preventDefault();
    hideMobileControls();
    updateSingleDrag(pointFromMouseEvent(event));
  }

  function handleMouseEnd(event: ReactMouseEvent<HTMLDivElement>) {
    if (!mouseGestureActiveRef.current || pointersRef.current.size > 0) return;
    event.preventDefault();
    mouseGestureActiveRef.current = false;
    finishSingleDrag(pointFromMouseEvent(event));
  }

  function handlePreviewClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (isPreviewControlTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!tapClosePendingRef.current) return;
    tapClosePendingRef.current = false;
    closePreview();
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const horizontalDelta = event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX;
    if (event.shiftKey || Math.abs(horizontalDelta) > Math.abs(event.deltaY)) {
      if (horizontalDelta !== 0) {
        hideMobileControls();
        navigateImage(horizontalDelta > 0 ? 1 : -1);
      }
      return;
    }
    zoomAt({ x: event.clientX, y: event.clientY }, event.deltaY < 0 ? 1.12 : 0.88);
  }

  async function copyImage() {
    if (!activeImage) return false;
    try {
      const imageUrl = activeImage.src;
      await navigator.clipboard.write([new ClipboardItem({
        "image/png": (async () => {
          const response = await fetch(imageUrl);
          if (!response.ok) throw new Error(`读取图片失败：${response.status}`);
          const blob = await response.blob();
          if (blob.type === "image/png") return blob;
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
          bitmap.close();
          return new Promise<Blob>((resolve, reject) => canvas.toBlob((png) => png ? resolve(png) : reject(new Error("转换图片失败")), "image/png"));
        })(),
      })]);
      setCopyFeedback("已复制图片");
      return true;
    } catch (cause) {
      setCopyFeedback(cause instanceof Error ? cause.message : "复制图片失败");
      return false;
    }
  }

  async function shareImage() {
    if (!shareFile) return;
    if (!navigator.canShare?.({ files: [shareFile] })) {
      setShareError("当前浏览器无法分享图片文件");
      return;
    }
    try {
      await navigator.share({ files: [shareFile] });
      setLongPressMenuVisible(false);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setShareError(cause instanceof Error ? cause.message : "分享图片失败");
    }
  }

  useEffect(() => {
    if (!state.visible) return;

    function handleKeyDown(event: KeyboardEvent) {
      const handledKeys = ["Escape", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "+", "=", "-", "_", "0", "[", "]"];
      if (!handledKeys.includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Escape") closePreview();
      if (event.key === "ArrowLeft") { hideMobileControls(); navigateImage(-1); }
      if (event.key === "ArrowRight") { hideMobileControls(); navigateImage(1); }
      if (event.key === "PageUp") { hideMobileControls(); changeGroup(-1); }
      if (event.key === "PageDown") { hideMobileControls(); changeGroup(1); }
      if (event.key === "+" || event.key === "=") zoomFromCenter(1.18);
      if (event.key === "-" || event.key === "_") zoomFromCenter(0.82);
      if (event.key === "0") resetTransform();
      if (event.key === "[") rotateBy(-90);
      if (event.key === "]") rotateBy(90);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [changeGroup, closePreview, hideMobileControls, navigateImage, resetTransform, rotateBy, state.visible, zoomFromCenter]);

  if (!state.visible || !activeImage) return null;

  const previewSlots = [
    { image: previousImage, offset: -1 },
    { image: activeImage, offset: 0 },
    { image: nextImage, offset: 1 },
  ].filter((slot): slot is { image: ImagePreviewItem; offset: number } => Boolean(slot.image));
  const controlsVisibilityClass = mobileControlsVisible ? "flex" : "hidden sm:flex";
  const slotTransition = isSwipeAnimating ? `transform ${swipeAnimationMs}ms cubic-bezier(0.22, 1, 0.36, 1)` : "none";
  const slotWidth = viewportSize.width || 0;

  const preview = (
    <div
      ref={stageRef}
      data-image-preview-stage
      className="fixed inset-0 z-[1200] overflow-hidden bg-black/90 text-white"
      style={{ overscrollBehavior: "none", touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseEnd}
      onWheel={handleWheel}
      onClick={handlePreviewClick}
      onContextMenu={(event) => {
        if (window.matchMedia("(pointer: coarse)").matches) event.preventDefault();
      }}
    >
      {previewSlots.map((slot) => {
        const slotImageSize = imageSizes[slot.image.src] ?? null;
        const defaultTransform = slotImageSize && viewportSize.width > 0 && viewportSize.height > 0 ? createInitialTransform(slotImageSize, viewportSize) : null;
        const slotImageTransform = slot.offset === 0 ? transform : defaultTransform;
        return (
          <div
            key={`${slot.offset}-${slot.image.src}`}
            data-image-preview-slot={slot.offset}
            className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
            style={{
              transform: `translate3d(${slot.offset * slotWidth + swipeOffset}px, 0, 0)`,
              transition: slotTransition,
              willChange: "transform",
            }}
          >
            <img
              ref={slot.offset === 0 ? imageRef : undefined}
              data-image-preview-adjacent={slot.offset === 0 ? undefined : true}
              data-image-preview-image={slot.offset === 0 ? true : undefined}
              className={slot.offset === 0 ? "pointer-events-auto select-none" : "pointer-events-none select-none"}
              style={{
                height: slotImageSize ? `${slotImageSize.height}px` : "auto",
                maxHeight: "none",
                maxWidth: "none",
                touchAction: "none",
                transform: slotImageTransform ? `translate3d(${slotImageTransform.x}px, ${slotImageTransform.y}px, 0) rotate(${slotImageTransform.rotation}deg) scale(${slotImageTransform.scale})` : "none",
                transformOrigin: "center center",
                userSelect: "none",
                width: slotImageSize ? `${slotImageSize.width}px` : "100vw",
                willChange: "transform",
              }}
              src={slot.image.src}
              alt={slot.image.alt ?? "图片预览"}
              draggable={false}
              onLoad={(event) => updateImageSize(event.currentTarget, slot.image.src)}
            />
          </div>
        );
      })}

      <button data-image-preview-controls className="fixed left-3 top-1/2 z-[1215] hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md bg-black/60 hover:bg-white/10 sm:flex" type="button" title="上一张图片" onClick={() => navigateImage(-1)}>
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button data-image-preview-controls className="fixed right-3 top-1/2 z-[1215] hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md bg-black/60 hover:bg-white/10 sm:flex" type="button" title="下一张图片" onClick={() => navigateImage(1)}>
        <ChevronRight className="h-6 w-6" />
      </button>

      <button
        data-image-preview-controls
        className="fixed bottom-4 left-1/2 z-[1220] flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full bg-black/45 text-white/85 shadow-md hover:bg-black/65 sm:hidden"
        type="button"
        title={mobileControlsVisible ? "隐藏工具" : "显示工具"}
        onClick={() => setMobileControlsVisible((visible) => !visible)}
      >
        <Ellipsis className="h-4 w-4" />
      </button>

      <div data-image-preview-controls className={`fixed bottom-14 left-1/2 z-[1215] w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-md bg-black/70 p-2 text-white shadow-lg sm:bottom-3 sm:w-max sm:max-w-[calc(100vw-5rem)] sm:flex-nowrap ${controlsVisibilityClass}`}>
        {canChangeGroup && (
          <div className="flex w-full items-center justify-center gap-1 border-b border-white/20 pb-1 sm:w-auto sm:shrink-0 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-1">
            <button className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-40 sm:h-9 sm:w-9" type="button" title="上一条内容" disabled={groupIndex === 0} onClick={() => (activeImages.length === 1 ? navigateImage(-1) : changeGroup(-1))}><ChevronsLeft className="h-4 w-4" /></button>
            <span className="text-xs text-white/75 sm:hidden">{groupIndex + 1}/{groups.length}</span>
            <span className="hidden max-w-24 truncate text-xs text-white/75 sm:block" title={activeGroup?.label}>
              {groupIndex + 1}/{groups.length} · {activeGroup?.label ?? `第 ${groupIndex + 1} 条内容`}
            </span>
            <button className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-40 sm:h-9 sm:w-9" type="button" title="下一条内容" disabled={groupIndex >= groups.length - 1} onClick={() => (activeImages.length === 1 ? navigateImage(1) : changeGroup(1))}><ChevronsRight className="h-4 w-4" /></button>
          </div>
        )}
        <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-white/10 sm:h-9 sm:w-9" type="button" title="缩小" onClick={() => zoomFromCenter(0.82)}>
          <ZoomOut className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-white/10 sm:h-9 sm:w-9" type="button" title="放大" onClick={() => zoomFromCenter(1.18)}>
          <ZoomIn className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-white/10 sm:h-9 sm:w-9" type="button" title="逆时针旋转90度" onClick={() => rotateBy(-90)}>
          <RotateCcw className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-white/10 sm:h-9 sm:w-9" type="button" title="顺时针旋转90度" onClick={() => rotateBy(90)}>
          <RotateCw className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-white/10 sm:h-9 sm:w-9" type="button" title="重置" onClick={resetTransform}>
          <RefreshCcw className="h-4 w-4" />
        </button>
        <a className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-white/10 sm:h-9 sm:w-9" title="下载" href={activeImage.downloadUrl ?? activeImage.src} download onClick={hideMobileControls}>
          <Download className="h-4 w-4" />
        </a>
        <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-white/10 sm:h-9 sm:w-9" type="button" title="复制图片" onClick={() => void copyImage()}>
          {copyFeedback === "已复制图片" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
        <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-white/10 sm:hidden" type="button" title="分享与更多操作" onClick={() => setLongPressMenuVisible(true)}>
          <Share2 className="h-4 w-4" />
        </button>
        <div className="shrink-0 px-2 text-xs text-white/75">
          {safeActiveIndex + 1} / {activeImages.length}
        </div>
      </div>
      {copyFeedback && <div role="status" className="fixed bottom-28 left-1/2 z-[1225] -translate-x-1/2 rounded-md bg-black/80 px-3 py-2 text-sm text-white sm:bottom-16">{copyFeedback}</div>}
      {longPressMenuVisible && (
        <div data-image-preview-controls className="fixed inset-0 z-[1230] flex items-end justify-center bg-black/40 p-3 sm:hidden" onClick={(event) => { if (event.target === event.currentTarget) setLongPressMenuVisible(false); }}>
          <div className="w-full max-w-sm rounded-xl bg-surface-elevated p-3 text-foreground shadow-xl">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-medium">图片操作</span>
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-muted" aria-label="关闭图片操作菜单" onClick={() => setLongPressMenuVisible(false)}><X className="h-4 w-4" /></button>
            </div>
            <button type="button" className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-surface-muted" onClick={() => void copyImage().then((copied) => { if (copied) setLongPressMenuVisible(false); })}><Copy className="h-4 w-4" />复制图片</button>
            <a className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm hover:bg-surface-muted" href={activeImage.downloadUrl ?? activeImage.src} download onClick={() => setLongPressMenuVisible(false)}><Download className="h-4 w-4" />下载图片</a>
            <button type="button" className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-surface-muted disabled:opacity-50" disabled={!shareFile || Boolean(shareError)} onClick={() => void shareImage()}><Share2 className="h-4 w-4" />{shareError ? "无法分享图片" : shareFile ? "分享图片" : "正在准备分享"}</button>
            {shareError && <p role="alert" className="px-3 py-2 text-xs text-red-600 dark:text-red-400">{shareError}</p>}
          </div>
        </div>
      )}
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(preview, document.body);
}
