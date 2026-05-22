import { useEffect } from "react";
import Viewer from "react-viewer";

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
  useEffect(() => {
    if (!state.visible) return;

    function handleViewerClick(event: globalThis.MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const target = event.target;
      if (!target.closest(".react-viewer-canvas, .react-viewer-mask")) return;
      if (target.closest(".react-viewer-toolbar, .react-viewer-navbar, .react-viewer-close, img")) return;
      onClose();
    }

    document.addEventListener("click", handleViewerClick, true);
    return () => document.removeEventListener("click", handleViewerClick, true);
  }, [onClose, state.visible]);

  return (
    <Viewer
      visible={state.visible}
      images={state.images}
      activeIndex={state.activeIndex}
      zIndex={1200}
      downloadable
      rotatable
      scalable
      zoomable
      drag
      onMaskClick={onClose}
      onClose={onClose}
    />
  );
}
