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
      onClose={onClose}
    />
  );
}
