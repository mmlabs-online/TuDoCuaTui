import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { detectMode } from "./data/mode";
import { clearLegacyAuthKeys } from "./lib/legacySession";
import { applySavedTheme } from "./lib/theme";
import "./index.css";

applySavedTheme();
if (import.meta.env.PROD) clearLegacyAuthKeys();

void detectMode().then((mode) =>
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App mode={mode} />
    </React.StrictMode>,
  ),
);
