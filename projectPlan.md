# Pane --- Project Plan

Pane is a Windows-native window arrangement utility inspired by macOS
OneMenu. It opens a compact popup from the system tray or a keyboard
shortcut and lets users arrange the active application window.

## 1. Product goals

Initial features:

- Snap the target window to the left or right half of its monitor.
- Snap the target window to any of four corners.
- Display a compact OneMenu-style layout picker with visual previews.
- Support popup-based selection first; add drag-to-snap separately.
- Capture the target window before opening the popup so Pane never snaps
  itself accidentally.
- Plan for multi-monitor support, Windows startup, configurable shortcuts,
  settings, and drag-to-snap.

## 2. Technology choice

Pane uses:

1. **Electron** for the Windows desktop shell, tray lifecycle, popup window,
   global shortcuts, and main/renderer process separation.
2. **React + TypeScript** for the popup UI, previews, selection feedback,
   and settings.
3. **Node.js APIs** in the Electron main process for IPC, configuration,
   process coordination, and application lifecycle.
4. **Windows APIs** behind a narrow main-process service for foreground-window
   capture, monitor work areas, and window positioning.

Electron is a good fit when keeping React and TypeScript is important and
avoiding a Go/Wails toolchain is a priority. The trade-off is higher memory
usage and a larger packaged application than Wails or a native C# app.

**Important toolchain decision:** GCC is not required for the baseline Pane
application. Electron, React, TypeScript, and the pure TypeScript geometry
engine use Node/npm only. Avoid native npm modules unless there is a clear
need, because packages with native bindings can require a C/C++ toolchain.
If a later Windows integration needs compiled native code, prefer a small
prebuilt helper or a .NET-based helper before adding a compiler toolchain.

## 3. Architecture

### Main process

Owns the BrowserWindow, tray, global shortcut registration, popup lifecycle,
IPC handlers, target-window capture, settings, and shutdown.

### Renderer process

Contains the React layout picker and settings UI. It never receives an
arbitrary HWND from the user and requests actions through typed IPC methods.

### Windows integration

Keep Windows-specific operations behind a small service such as
`src/main/windows/windowManager.ts`. The service should:

- Capture the foreground window before showing Pane.
- Reject Pane's own BrowserWindow and other ineligible windows.
- Find the target monitor and its work area.
- Calculate a layout rectangle using the shared geometry engine.
- Move the captured target window only after validating the request.

Do not use Electron's `BrowserWindow` APIs to move other applications'
windows; use Windows APIs through the integration service.

## 4. Recommended project structure

```text
Pane/
├── package.json
├── package-lock.json
├── tsconfig.json
├── electron.vite.config.ts
├── src/
│   ├── main/
│   │   ├── main.ts
│   │   ├── ipc.ts
│   │   ├── tray.ts
│   │   ├── settings.ts
│   │   └── windows/
│   │       ├── windowManager.ts
│   │       ├── monitor.ts
│   │       └── nativeBridge.ts
│   ├── preload/
│   │   ├── preload.ts
│   │   └── api.ts
│   ├── renderer/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── LayoutPicker.tsx
│   │   │   ├── LayoutPreview.tsx
│   │   │   └── Settings.tsx
│   │   └── styles/
│   │       └── index.css
│   └── shared/
│       ├── layout.ts
│       └── types.ts
├── tests/
│   └── layout.test.ts
└── build/
```

Keep the geometry engine independent from Electron and Windows APIs so it can
be unit-tested in Node without launching a desktop window.

## 5. Prerequisites and project setup

Required for the initial foundation:

- Node.js LTS
- npm

No Go installation, Wails CLI, GCC, MinGW, MSYS2, or Visual Studio C++
workload is required for the foundation milestone.

Recommended setup:

```powershell
node --version
npm --version
npm create electron-vite@latest Pane -- --template react-ts
cd Pane
npm install
npm run dev
```

Use the generated Electron Vite React/TypeScript structure as the starting
point. Keep its renderer, preload, and build configuration intact unless a
change is required by Pane.

For packaging later, add `electron-builder` or Electron Forge only after the
development application and tests are stable. Packaging tools are not part
of the foundation milestone.

## 6. Layout geometry engine

Create `src/shared/layout.ts`:

```ts
export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LayoutKind =
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export function calculateLayout(work: Rect, kind: LayoutKind): Rect {
  const halfWidth = Math.floor(work.width / 2);
  const halfHeight = Math.floor(work.height / 2);

  switch (kind) {
    case "left":
      return { x: work.x, y: work.y, width: halfWidth, height: work.height };
    case "right":
      return {
        x: work.x + halfWidth,
        y: work.y,
        width: work.width - halfWidth,
        height: work.height,
      };
    case "top-left":
      return { x: work.x, y: work.y, width: halfWidth, height: halfHeight };
    case "top-right":
      return {
        x: work.x + halfWidth,
        y: work.y,
        width: work.width - halfWidth,
        height: halfHeight,
      };
    case "bottom-left":
      return {
        x: work.x,
        y: work.y + halfHeight,
        width: halfWidth,
        height: work.height - halfHeight,
      };
    case "bottom-right":
      return {
        x: work.x + halfWidth,
        y: work.y + halfHeight,
        width: work.width - halfWidth,
        height: work.height - halfHeight,
      };
  }
}
```

Right and bottom regions use the remaining width and height so odd monitor
dimensions do not leave a one-pixel gap.

Add focused tests in `tests/layout.test.ts` for:

- Each layout kind on an even-sized work area.
- Right and bottom layouts on odd dimensions.
- Non-zero and negative work-area coordinates.
- Full coverage of the work area without overlap or gaps.

Use the test runner generated by the selected Electron Vite template. Keep
these tests independent of Electron.

## 7. Electron popup UI

The renderer should provide:

- A compact panel with the Pane name and platform status.
- Six visual layout previews.
- Disabled layout actions until a target has been captured.
- Busy and error states.
- Keyboard-accessible buttons and labels.

The preload script exposes a small, typed API rather than exposing Node
directly:

```ts
interface PaneApi {
  captureTarget(): Promise<void>;
  snapWindow(kind: LayoutKind): Promise<void>;
  hidePicker(): Promise<void>;
}
```

The renderer must not accept or send arbitrary HWND values.

## 8. Popup lifecycle and system tray

Configure Pane's BrowserWindow as frameless, always on top, initially hidden,
and sized for the compact picker. The main process should:

1. Capture the foreground target before showing the picker.
2. Store the target only in the main process.
3. Show and focus the picker.
4. Handle a layout request through IPC.
5. Snap the stored target.
6. Hide the picker and return focus where possible.
7. Clear the stored target on success, cancellation, timeout, or error.

The tray menu should eventually include **Open**, **Settings**, **Start with
Windows**, and **Quit**. Quit must unregister shortcuts, stop tray actions,
destroy windows, and exit cleanly.

## 9. Native Windows window management

Start with an adapter boundary instead of tying the renderer to native code.
The first native implementation may use a narrowly scoped Windows helper
invoked by the Electron main process. Prefer an existing prebuilt solution
or a .NET helper if that avoids introducing native npm build requirements.

Required operations:

- Get the foreground HWND.
- Check that the HWND is valid and eligible.
- Identify the monitor containing the captured window.
- Read that monitor's work area.
- Move and resize the target window.

The implementation must exclude Pane's own windows and must never trust an
arbitrary HWND supplied by renderer input.

## 10. Multi-monitor and DPI support

Before calling Pane complete:

- Enumerate monitors and use each monitor's work area.
- Support negative X/Y coordinates.
- Handle per-monitor DPI consistently.
- Select the target monitor from the captured window.
- Recalculate after display topology or resolution changes.
- Test mixed-DPI displays, taskbar positions, and odd dimensions.

The geometry engine must remain coordinate-system agnostic; monitor and DPI
conversion belongs in the Windows integration layer.

## 11. Settings and persistence

Persist these values in a per-user Electron configuration location:

- Global shortcut.
- Edge snap threshold.
- Launch-on-login preference.
- Popup positioning preference.
- Animation and preview options.
- Excluded applications or window classes.

Validate settings on load and use safe defaults when the file is absent or
invalid. Keep settings access in the main process.

## 12. Drag-to-snap design

Treat drag-to-snap as a separate native feature after popup snapping works:

- Detect movement of eligible top-level windows.
- Determine the monitor and pointer edge proximity.
- Display a translucent preview overlay.
- Snap on drag release.
- Ignore Pane windows, child windows, minimized windows, and unsupported
  window types.
- Make the edge threshold configurable.

React can render the preview, but it cannot observe arbitrary Windows
application movement by itself.

## 13. Implementation milestones

### Milestone 1 --- Electron foundation

- [ ] Create the Electron Vite React/TypeScript project named Pane.
- [ ] Confirm `npm run dev` works.
- [ ] Add the shared layout geometry module.
- [ ] Add layout unit tests.

### Milestone 2 --- Native snapping

- [ ] Capture the foreground HWND.
- [ ] Read the target monitor work area.
- [ ] Snap to halves and four corners.
- [ ] Prevent snapping Pane itself.
- [ ] Validate HWND existence and error handling.

### Milestone 3 --- Popup UX

- [ ] Capture the target before showing the picker.
- [ ] Build layout previews and selection feedback.
- [ ] Hide the popup after snapping.
- [ ] Add cancellation and target reset behavior.

### Milestone 4 --- Tray and shortcut

- [ ] Add the tray icon and context menu.
- [ ] Add a global shortcut.
- [ ] Start hidden and support clean shutdown.

### Milestone 5 --- Multi-monitor and DPI

- [ ] Enumerate displays.
- [ ] Implement per-monitor work areas.
- [ ] Test negative coordinates and mixed DPI.

### Milestone 6 --- Drag-to-snap

- [ ] Track eligible window movement.
- [ ] Detect edge/corner thresholds.
- [ ] Show a preview overlay.
- [ ] Apply snap on drag release.

### Milestone 7 --- Release readiness

- [ ] Persist settings.
- [ ] Add Start with Windows.
- [ ] Build an installer.
- [ ] Test common applications and failure cases.
- [ ] Document known limitations and keyboard shortcuts.

## 14. Testing checklist

- [ ] `npm test` or the selected test command passes.
- [ ] Each layout covers the expected portion of a work area.
- [ ] Odd dimensions leave no gaps.
- [ ] Negative monitor coordinates are preserved.
- [ ] The popup never snaps itself.
- [ ] The captured target remains stable while the popup has focus.
- [ ] Closed or invalid HWNDs fail safely.
- [ ] Mixed-DPI and elevated-window cases are tested.
- [ ] Tray Quit closes all app components.
- [ ] Drag-to-snap ignores Pane's own windows.

## 15. Important implementation notes

- This document is an implementation plan, not a claim that Pane is already
  production-ready.
- Electron avoids the Wails/Go/GCC baseline setup, but native npm modules can
  reintroduce compiler requirements. Avoid them unless necessary.
- The foundation milestone should use only Node/npm and browser-independent
  TypeScript tests.
- Keep target selection and validation in the Electron main process.
- Test Windows behavior on the actual Windows versions and display setups
  Pane intends to support.
