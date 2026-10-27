import { useEffect, useState } from "react";
import type { LayoutKind } from "../../shared/layout";

const layouts: Array<{ id: LayoutKind; label: string }> = [
  { id: "left", label: "Left half" },
  { id: "right", label: "Right half" },
  { id: "top-left", label: "Top left" },
  { id: "top-right", label: "Top right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom-right", label: "Bottom right" },
];

export default function App() {
  const [captured, setCaptured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const removeCapturedListener = window.pane.onTargetCaptured(() => {
      setCaptured(true);
      setError("");
    });
    const removeErrorListener = window.pane.onError((message) => {
      setCaptured(false);
      setError(message);
    });

    return () => {
      removeCapturedListener();
      removeErrorListener();
    };
  }, []);

  async function chooseLayout(kind: LayoutKind): Promise<void> {
    if (!captured || busy) return;

    setBusy(true);
    setError("");
    try {
      await window.pane.snapWindow(kind);
      setCaptured(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="panel">
      <header className="header">
        <div>
          <span className="eyebrow">WINDOW CONTROL</span>
          <h1>Pane</h1>
        </div>
        <span className="status">Windows</span>
      </header>

      <section className={`capture-status ${captured ? "ready" : ""}`}>
        <span className="status-dot" />
        <div>
          <strong>{captured ? "Target captured" : "Ready to capture"}</strong>
          <p>
            {captured
              ? "Choose where to place the active window."
              : "Press Ctrl + Alt + Space while another app is active."}
          </p>
        </div>
      </section>

      <div className="section-title">Choose a layout</div>
      <div className="layout-grid">
        {layouts.map((item) => (
          <button
            key={item.id}
            className="layout-button"
            disabled={!captured || busy}
            onClick={() => void chooseLayout(item.id)}
            aria-label={item.label}
          >
            <div className={`preview ${item.id}`}><span /></div>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      <footer>Pane stays out of the way until you need it.</footer>
    </main>
  );
}
