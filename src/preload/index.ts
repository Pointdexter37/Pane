import { contextBridge, ipcRenderer } from "electron";
import type { LayoutKind } from "../shared/layout";

contextBridge.exposeInMainWorld("pane", {
  platform: process.platform,
  snapWindow: (kind: LayoutKind) => ipcRenderer.invoke("pane:snap-window", kind),
  hidePicker: () => ipcRenderer.invoke("pane:hide-picker"),
  onTargetCaptured: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("pane:target-captured", listener);
    return () => ipcRenderer.removeListener("pane:target-captured", listener);
  },
  onError: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on("pane:error", listener);
    return () => ipcRenderer.removeListener("pane:error", listener);
  },
});
