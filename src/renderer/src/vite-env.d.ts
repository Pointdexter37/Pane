/// <reference types="vite/client" />

import type { LayoutKind } from "../../shared/layout";

declare global {
  interface Window {
    pane: {
      platform: string;
      snapWindow: (kind: LayoutKind) => Promise<void>;
      hidePicker: () => Promise<void>;
      onTargetCaptured: (callback: () => void) => () => void;
      onError: (callback: (message: string) => void) => () => void;
    };
  }
}

export {};
