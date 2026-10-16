/** Last line of defence: a crash in one screen shows a way out, not a blank page. */
import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode; lang: "it" | "en"; resetKey: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Veritag:", error);
  }

  componentDidUpdate(prev: { resetKey: string }) {
    // navigating away from a crashed screen recovers, without remounting the app
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const it = this.props.lang === "it";
    return (
      <div className="pub" style={{ display: "grid", placeItems: "center", padding: 24, minHeight: "100dvh" }}>
        <div className="empty" style={{ maxWidth: 460 }}>
          <img src="/mark.svg" alt="" style={{ width: 44, height: 44 }} />
          <b>{it ? "Qualcosa si è inceppato" : "Something got stuck"}</b>
          <p>{it ? "Ricarica la pagina: i tuoi dati sono al sicuro." : "Reload the page — your data is safe."}</p>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn btn-primary" onClick={() => location.reload()}>
              {it ? "Ricarica" : "Reload"}
            </button>
            <a className="btn btn-ghost" href="/">
              Home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
