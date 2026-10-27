import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Tray,
} from "electron";
import { join } from "node:path";
import { calculateLayout, type LayoutKind, type Rect } from "../shared/layout";
import { captureForegroundWindow, getWorkArea, snapWindow } from "./windows";

let picker: BrowserWindow | null = null;
let tray: Tray | null = null;
let pendingTarget: number | null = null;
let isQuitting = false;

function createPicker(): BrowserWindow {
  const window = new BrowserWindow({
    width: 380,
    height: 440,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: "#171923",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
      pendingTarget = null;
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}

async function openPicker(): Promise<void> {
  if (!picker) return;

  try {
    pendingTarget = await captureForegroundWindow();
    picker.show();
    picker.focus();
    picker.webContents.send("pane:target-captured");
  } catch (error) {
    pendingTarget = null;
    picker.webContents.send("pane:error", error instanceof Error ? error.message : String(error));
    picker.show();
  }
}

function createTray(): void {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip("Pane");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Pane", click: () => void openPicker() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
  tray.on("click", () => void openPicker());
}

ipcMain.handle("pane:snap-window", async (_event, kind: LayoutKind) => {
  if (!pendingTarget) {
    throw new Error("Capture a target window before choosing a layout.");
  }

  const workArea: Rect = await getWorkArea(pendingTarget);
  const target = calculateLayout(workArea, kind);
  await snapWindow(pendingTarget, target.x, target.y, target.width, target.height);
  pendingTarget = null;
  picker?.hide();
});

ipcMain.handle("pane:hide-picker", () => {
  pendingTarget = null;
  picker?.hide();
});

app.whenReady().then(() => {
  picker = createPicker();
  createTray();
  globalShortcut.register("CommandOrControl+Alt+Space", () => void openPicker());
});

app.on("will-quit", () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  tray?.destroy();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
