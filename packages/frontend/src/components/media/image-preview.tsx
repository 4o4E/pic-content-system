import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import Viewer from "react-viewer";

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

function previewClickZone(clientX: number) {
  const unit = window.innerWidth / 3;
  if (clientX < unit) return "left";
  if (clientX > unit * 2) return "right";
  return undefined;
}

function isPreviewControlTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(".react-viewer-close, .react-viewer-footer, [data-image-preview-controls], button, a"));
}

export function ImagePreviewViewer({ state, onClose }: { state: ImagePreviewState; onClose: () => void }) {
  const [activeIndex, setActiveIndex] = useState(state.activeIndex);
  const [groupIndex, setGroupIndex] = useState(state.groupIndex ?? 0);
  const [groupSwitchGuardIndex, setGroupSwitchGuardIndex] = useState<number | null>(null);
  const activeGroup = state.groups?.[groupIndex];
  const activeImages = activeGroup?.images.length ? activeGroup.images : state.images;
  const safeActiveIndex = Math.min(Math.max(activeIndex, 0), Math.max(activeImages.length - 1, 0));
  const activeImage = activeImages[safeActiveIndex];
  const groups = state.groups ?? [];
  const canChangeGroup = groups.length > 1;
  const firstImage = activeImages[0];
  const viewerImages =
    groupSwitchGuardIndex == null || !firstImage
      ? activeImages
      : Array.from({ length: Math.max(activeImages.length, groupSwitchGuardIndex + 1) }, (_, index) => (index <= groupSwitchGuardIndex ? firstImage : activeImages[index] ?? firstImage));

  useEffect(() => {
    if (!state.visible) return;
    const nextGroupIndex = Math.min(Math.max(state.groupIndex ?? 0, 0), Math.max(groups.length - 1, 0));
    const nextImages = groups[nextGroupIndex]?.images.length ? groups[nextGroupIndex].images : state.images;
    setGroupIndex(nextGroupIndex);
    setActiveIndex(Math.min(Math.max(state.activeIndex, 0), Math.max(nextImages.length - 1, 0)));
    setGroupSwitchGuardIndex(null);
  }, [groups, state.activeIndex, state.groupIndex, state.images, state.visible]);

  const changeGroup = useCallback(
    (offset: number, target: "first" | "last" = "first") => {
      if (groups.length === 0) return;
      const next = Math.min(Math.max(groupIndex + offset, 0), groups.length - 1);
      if (next === groupIndex) return;
      const nextImages = groups[next]?.images ?? [];
      const nextActiveIndex = target === "last" ? Math.max(nextImages.length - 1, 0) : 0;
      setGroupSwitchGuardIndex(Math.max(activeIndex, nextActiveIndex));
      setGroupIndex(next);
      setActiveIndex(nextActiveIndex);
    },
    [activeIndex, groupIndex, groups],
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

  useEffect(() => {
    if (groupSwitchGuardIndex == null) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setGroupSwitchGuardIndex(null));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [groupSwitchGuardIndex, groupIndex]);

  useEffect(() => {
    if (!state.visible) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "PageUp") changeGroup(-1);
      if (event.key === "PageDown") changeGroup(1);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [changeGroup, state.visible]);

  if (!state.visible || !activeImage) return null;

  function stopPreviewZoneDrag(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleMaskClick(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    if (isPreviewControlTarget(event.target)) return;
    if (previewClickZone(event.clientX)) return;
    if (event.target.closest("img")) return;
    onClose();
  }

  const groupControls =
    canChangeGroup && typeof document !== "undefined"
      ? createPortal(
          <div data-image-preview-controls className="fixed left-1/2 top-4 z-[1215] flex max-w-[calc(100vw-5rem)] -translate-x-1/2 items-center gap-2 rounded-md bg-black/70 p-2 text-white shadow-lg">
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
          </div>,
          document.body,
        )
      : null;

  const clickZones =
    typeof document !== "undefined"
      ? createPortal(
          <div data-image-preview-zones className="pointer-events-none fixed bottom-24 left-0 right-0 top-12 z-[1208] flex">
            <button
              className="pointer-events-auto h-full w-1/3 cursor-default bg-transparent"
              type="button"
              aria-label="上一张图片"
              onMouseDown={stopPreviewZoneDrag}
              onClick={(event) => {
                stopPreviewZoneDrag(event);
                navigateImage(-1);
              }}
            />
            <div className="h-full flex-1" />
            <button
              className="pointer-events-auto h-full w-1/3 cursor-default bg-transparent"
              type="button"
              aria-label="下一张图片"
              onMouseDown={stopPreviewZoneDrag}
              onClick={(event) => {
                stopPreviewZoneDrag(event);
                navigateImage(1);
              }}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <Viewer
        visible={state.visible}
        images={viewerImages}
        activeIndex={safeActiveIndex}
        zIndex={1200}
        downloadable
        rotatable
        scalable
        zoomable
        drag
        loop={false}
        zoomSpeed={0.18}
        onChange={(_, index) => setActiveIndex(index)}
        onMaskClick={handleMaskClick}
        onClose={onClose}
      />
      {clickZones}
      {groupControls}
    </>
  );
}
