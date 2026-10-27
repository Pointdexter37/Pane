import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("pane", {
  platform: process.platform,
});
