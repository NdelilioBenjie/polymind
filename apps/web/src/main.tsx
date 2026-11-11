import { App, setPlatform } from "@polymind/app";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// The web app talks to the API on its own origin.
setPlatform({ kind: "web", apiBase: "" });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
