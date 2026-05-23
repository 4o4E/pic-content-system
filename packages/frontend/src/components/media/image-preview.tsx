import { ChevronLeft, ChevronRight, Download, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useState } from "react";

export interface ImagePreviewItem {
  src: string;
  alt?: string;
  downloadUrl?: string;
}

export interface ImagePreviewState {
  visible: boolean;
  images: ImagePreviewItem[];
  activeIndex: number;
}

export const emptyImagePreviewState: ImagePreviewState = {
  visible: false,
  images: [],
  activeIndex: 0,
};

export function createImagePreviewState(images: ImagePreviewItem[], activeIndex = 0): ImagePreviewState {
  return {
    visible: images.length > 0,
    images,
    activeIndex,
  };
}

export function ImagePreviewViewer({ state, onClose }: { state: ImagePreviewState; onClose: () => void }) {
  const [activeIndex, setActiveIndex] = useState(state.activeIndex);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const activeImage = state.images[activeIndex];
  const canChange = state.images.length > 1;

  useEffect(() => {
    if (!state.visible) return;
    setActiveIndex(Math.min(Math.max(state.activeIndex, 0), Math.max(state.images.length - 1, 0)));
    setScale(1);
    setRotation(0);
  }, [state.activeIndex, state.images.length, state.visible]);

  useEffect(() => {
    if (!state.visible) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") setActiveIndex((index) => Math.max(0, index - 1));
      if (event.key === "ArrowRight") setActiveIndex((index) => Math.min(state.images.length - 1, index + 1));
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, state.images.length, state.visible]);

  useEffect(() => {
    setScale(1);
    setRotation(0);
  }, [activeIndex]);

  if (!state.visible || !activeImage) return null;

  function changeImage(offset: number) {
    setActiveIndex((index) => {
      const next = index + offset;
      if (next < 0) return 0;
      if (next >= state.images.length) return state.images.length - 1;
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="absolute right-4 top-4 flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
        <button className="flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80" type="button" title="放大" onClick={() => setScale((value) => Math.min(value + 0.2, 4))}>
          <ZoomIn className="h-4 w-4" />
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80" type="button" title="缩小" onClick={() => setScale((value) => Math.max(value - 0.2, 0.2))}>
          <ZoomOut className="h-4 w-4" />
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80" type="button" title="旋转" onClick={() => setRotation((value) => value + 90)}>
          <RotateCcw className="h-4 w-4" />
        </button>
        <a className="flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80" href={activeImage.downloadUrl ?? activeImage.src} title="下载" download onClick={(event) => event.stopPropagation()}>
          <Download className="h-4 w-4" />
        </a>
        <button className="flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80" type="button" title="关闭" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>

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

      <div className="flex max-h-[calc(100vh-6rem)] max-w-[calc(100vw-2rem)] items-center justify-center overflow-visible" onClick={(event) => event.stopPropagation()}>
        <img
          className="block max-h-[calc(100vh-6rem)] max-w-[calc(100vw-2rem)] select-none object-contain"
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
          disabled={activeIndex === state.images.length - 1}
          onClick={(event) => {
            event.stopPropagation();
            changeImage(1);
          }}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {canChange && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-black/60 px-3 py-1 text-xs text-white">
          {activeIndex + 1} / {state.images.length}
        </div>
      )}
    </div>
  );
}
