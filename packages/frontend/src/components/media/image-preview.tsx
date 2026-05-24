import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useState } from "react";

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

export function ImagePreviewViewer({ state, onClose }: { state: ImagePreviewState; onClose: () => void }) {
  const [activeIndex, setActiveIndex] = useState(state.activeIndex);
  const [groupIndex, setGroupIndex] = useState(state.groupIndex ?? 0);
  const activeGroup = state.groups?.[groupIndex];
  const activeImages = activeGroup?.images.length ? activeGroup.images : state.images;
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const activeImage = activeImages[activeIndex];
  const canChange = activeImages.length > 1;
  const canChangeGroup = Boolean(state.groups && state.groups.length > 1);

  useEffect(() => {
    if (!state.visible) return;
    const nextGroupIndex = Math.min(Math.max(state.groupIndex ?? 0, 0), Math.max((state.groups?.length ?? 1) - 1, 0));
    const nextImages = state.groups?.[nextGroupIndex]?.images.length ? state.groups[nextGroupIndex].images : state.images;
    setGroupIndex(nextGroupIndex);
    setActiveIndex(Math.min(Math.max(state.activeIndex, 0), Math.max(nextImages.length - 1, 0)));
    setScale(1);
    setRotation(0);
  }, [state.activeIndex, state.groupIndex, state.groups, state.images, state.visible]);

  useEffect(() => {
    if (!state.visible) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") setActiveIndex((index) => Math.max(0, index - 1));
      if (event.key === "ArrowRight") setActiveIndex((index) => Math.min(activeImages.length - 1, index + 1));
      if (event.key === "PageUp") changeGroup(-1);
      if (event.key === "PageDown") changeGroup(1);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeImages.length, groupIndex, onClose, state.groups, state.visible]);

  useEffect(() => {
    setScale(1);
    setRotation(0);
  }, [activeIndex]);

  if (!state.visible || !activeImage) return null;

  function changeImage(offset: number) {
    setActiveIndex((index) => {
      const next = index + offset;
      if (next < 0) return 0;
      if (next >= activeImages.length) return activeImages.length - 1;
      return next;
    });
  }

  function changeGroup(offset: number) {
    const groups = state.groups;
    if (!groups || groups.length === 0) return;
    setGroupIndex((index) => {
      const next = Math.min(Math.max(index + offset, 0), groups.length - 1);
      if (next !== index) {
        setActiveIndex(0);
        setScale(1);
        setRotation(0);
      }
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onWheel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && Math.abs(event.deltaX) > 24) {
          changeImage(event.deltaX > 0 ? 1 : -1);
          return;
        }
        setScale((value) => Math.min(Math.max(value + (event.deltaY < 0 ? 0.12 : -0.12), 0.2), 4));
      }}
    >
      {canChange && (
        <button
          className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80 disabled:opacity-40"
          type="button"
          title="上一张"
          disabled={activeIndex === 0}
          onClick={(event) => {
            event.stopPropagation();
            changeImage(-1);
          }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      <div className="flex max-h-[calc(100vh-8rem)] max-w-[calc(100vw-2rem)] items-center justify-center overflow-visible" onClick={(event) => event.stopPropagation()}>
        <img
          className="block max-h-[calc(100vh-8rem)] max-w-[calc(100vw-2rem)] select-none object-contain transition-transform"
          src={activeImage.src}
          alt={activeImage.alt ?? "图片预览"}
          draggable={false}
          style={{ transform: `scale(${scale}) rotate(${rotation}deg)` }}
        />
      </div>

      {canChange && (
        <button
          className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80 disabled:opacity-40"
          type="button"
          title="下一张"
          disabled={activeIndex === activeImages.length - 1}
          onClick={(event) => {
            event.stopPropagation();
            changeImage(1);
          }}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {canChange && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-md bg-black/60 px-3 py-1 text-xs text-white">
          {activeIndex + 1} / {activeImages.length}
        </div>
      )}

      {canChangeGroup && (
        <div className="absolute bottom-20 right-4 rounded-md bg-black/60 px-3 py-1 text-xs text-white">
          {activeGroup?.label ?? `第 ${groupIndex + 1} 条`} · {groupIndex + 1} / {state.groups?.length ?? 1}
        </div>
      )}

      <div className="absolute bottom-4 left-1/2 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-md bg-black/60 p-2" onClick={(event) => event.stopPropagation()}>
        {canChangeGroup && (
          <>
            <button className="flex h-9 items-center gap-1 rounded-md px-3 text-xs text-white hover:bg-black/60 disabled:opacity-40" type="button" title="上一条记录" disabled={groupIndex === 0} onClick={() => changeGroup(-1)}>
              <ChevronsLeft className="h-4 w-4" />
              上一条
            </button>
            <button className="flex h-9 items-center gap-1 rounded-md px-3 text-xs text-white hover:bg-black/60 disabled:opacity-40" type="button" title="下一条记录" disabled={groupIndex >= (state.groups?.length ?? 1) - 1} onClick={() => changeGroup(1)}>
              下一条
              <ChevronsRight className="h-4 w-4" />
            </button>
          </>
        )}
        <button className="flex h-9 w-9 items-center justify-center rounded-md text-white hover:bg-black/60" type="button" title="放大" onClick={() => setScale((value) => Math.min(value + 0.2, 4))}>
          <ZoomIn className="h-4 w-4" />
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-md text-white hover:bg-black/60" type="button" title="缩小" onClick={() => setScale((value) => Math.max(value - 0.2, 0.2))}>
          <ZoomOut className="h-4 w-4" />
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-md text-white hover:bg-black/60" type="button" title="旋转" onClick={() => setRotation((value) => value + 90)}>
          <RotateCcw className="h-4 w-4" />
        </button>
        <a className="flex h-9 w-9 items-center justify-center rounded-md text-white hover:bg-black/60" href={activeImage.downloadUrl ?? activeImage.src} title="下载" download onClick={(event) => event.stopPropagation()}>
          <Download className="h-4 w-4" />
        </a>
        <button className="flex h-9 w-9 items-center justify-center rounded-md text-white hover:bg-black/60" type="button" title="关闭" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
