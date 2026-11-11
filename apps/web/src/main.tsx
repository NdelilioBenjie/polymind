import { App, setPlatform } from "@polymind/app";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Landing } from "./Landing";

// The web app talks to the API on its own origin.
setPlatform({ kind: "web", apiBase: "" });

// Two screens, so no router: the landing page at "/", the app at "/app".
const showApp = window.location.pathname.replace(/\/+$/, "") === "/app";

createRoot(document.getElementById("root")!).render(<StrictMode>{showApp ? <App /> : <Landing />}</StrictMode>);
