import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { detectRuntime } from "./data/mode";
import { needsAuth, takeTokenHash } from "./lib/boot";
import { clearLegacyAuthKeys } from "./lib/legacySession";
import { applySavedTheme } from "./lib/theme";
import "./index.css";

applySavedTheme();
if (import.meta.env.PROD) clearLegacyAuthKeys();

// Before any request: the verify-email / reset-password token must leave the address bar first (D36).
const link = takeTokenHash();

void detectRuntime().then(async (rt) => {
  const root = ReactDOM.createRoot(document.getElementById("root")!);
  if (!needsAuth(rt, link)) {
    root.render(
      <React.StrictMode>
        <App mode={rt.mode} />
      </React.StrictMode>,
    );
    return;
  }
  // Lazy: local mode and access mode never load the auth code. A failed load never falls back to local.
  const { default: AuthRoot } = await import("./features/auth/AuthRoot");
  root.render(
    <React.StrictMode>
      <AuthRoot
        identity={rt.auth === "identity"}
        verifyHash={link?.page === "verify" ? link.hash : null}
        resetHash={link?.page === "reset" ? link.hash : null}
        renderApp={(p) => <App mode={rt.mode} {...p} />}
      />
    </React.StrictMode>,
  );
});
