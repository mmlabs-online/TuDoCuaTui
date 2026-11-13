import { createRoot } from "react-dom/client";
import "@/index.css";
import { applySavedTheme } from "@/lib/theme";
import { AuthPreview } from "./AuthPreview";

// Dev only: auth-preview.html is not an input of `vite build`.
if (!import.meta.env.PROD) {
  applySavedTheme();
  createRoot(document.getElementById("root")!).render(<AuthPreview />);
}
