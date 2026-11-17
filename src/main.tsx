import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { probeServer } from "./data/serverProbe";
import { ServerUnavailable } from "./features/layout/ServerUnavailable";
import { takeTokenHash } from "./lib/boot";
import { clearLegacyAuthKeys } from "./lib/legacySession";
import { startup, type View } from "./lib/startup";
import { applySavedTheme } from "./lib/theme";
import "./index.css";

applySavedTheme();
if (import.meta.env.PROD) clearLegacyAuthKeys();

// Before any request: the verify-email / reset-password token must leave the address bar first (D36).
const link = takeTokenHash();

const root = ReactDOM.createRoot(document.getElementById("root")!);

async function show(v: View) {
  if (v.kind === "unavailable") {
    root.render(<ServerUnavailable dev={v.dev} onRetry={v.retry} />);
    return;
  }
  if (v.kind === "devApp") {
    // `pnpm dev` only: the dev proxy adds the token server-side, so there is no sign-in and no getToken.
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
    return;
  }
  // Lazy: the auth code loads only here. A failed load never falls back to anything.
  const { default: AuthRoot } = await import("./features/auth/AuthRoot");
  root.render(
    <React.StrictMode>
      <AuthRoot
        verifyHash={link?.page === "verify" ? link.hash : null}
        resetHash={link?.page === "reset" ? link.hash : null}
        renderApp={(p) => <App {...p} />}
      />
    </React.StrictMode>,
  );
}

void startup({ probe: () => probeServer(), dev: import.meta.env.DEV, show });
