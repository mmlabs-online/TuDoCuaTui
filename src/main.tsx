import React from "react";
import ReactDOM from "react-dom/client";
import { Root } from "./Root";
import { detectMode } from "./data/mode";
import { applySavedTheme } from "./lib/theme";
import "./index.css";

applySavedTheme();

void detectMode().then((mode) =>
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <Root mode={mode} />
    </React.StrictMode>,
  ),
);
