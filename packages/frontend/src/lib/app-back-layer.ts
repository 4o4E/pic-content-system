import { useEffect, useRef } from "react";

export const appBackLayerChangeEvent = "pic-content-system:back-layer-change";

type AppBackLayer = {
  close: () => void;
  id: symbol;
};

const appBackLayers: AppBackLayer[] = [];
let escapeListenerActive = false;

function handleEscapeKey(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  if (!hasAppBackLayers()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeLatestAppBackLayer();
}

function syncEscapeListener() {
  if (typeof document === "undefined") return;
  if (appBackLayers.length > 0 && !escapeListenerActive) {
    // Esc 关闭当前最上层浮层，捕获阶段消费事件避免图片预览等局部快捷键重复关闭。
    document.addEventListener("keydown", handleEscapeKey, { capture: true });
    escapeListenerActive = true;
    return;
  }
  if (appBackLayers.length === 0 && escapeListenerActive) {
    document.removeEventListener("keydown", handleEscapeKey, { capture: true });
    escapeListenerActive = false;
  }
}

function emitAppBackLayerChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(appBackLayerChangeEvent));
}

export function hasAppBackLayers() {
  return appBackLayers.length > 0;
}

export function closeLatestAppBackLayer() {
  const layer = appBackLayers[appBackLayers.length - 1];
  if (!layer) return false;
  layer.close();
  return true;
}

function registerAppBackLayer(id: symbol, close: () => void) {
  const existing = appBackLayers.find((layer) => layer.id === id);
  if (existing) {
    existing.close = close;
    return;
  }
  appBackLayers.push({ id, close });
  syncEscapeListener();
  emitAppBackLayerChange();
}

function unregisterAppBackLayer(id: symbol) {
  const index = appBackLayers.findIndex((layer) => layer.id === id);
  if (index < 0) return;
  appBackLayers.splice(index, 1);
  syncEscapeListener();
  emitAppBackLayerChange();
}

export function useAppBackLayer(active: boolean, onBack: () => void) {
  const idRef = useRef<symbol | null>(null);
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!active) return;
    const id = idRef.current ?? Symbol("app-back-layer");
    idRef.current = id;
    // 全局浮层栈按打开顺序关闭最上层，匹配移动端返回键预期。
    registerAppBackLayer(id, () => onBackRef.current());
    return () => {
      unregisterAppBackLayer(id);
      if (idRef.current === id) idRef.current = null;
    };
  }, [active]);
}
