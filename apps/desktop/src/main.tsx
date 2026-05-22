import React from "react";
import ReactDOM from "react-dom/client";
import "./app.css";
import { App } from "./App";
import { logError, logInfo } from "./lib/diagnosticsLog";
import { sanitizeErrorForLog } from "./lib/redact";

window.addEventListener("error", (e) => {
  logError(`Unhandled error: ${e.message ?? "unknown"}`);
});

window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
  logError(`Unhandled rejection: ${sanitizeErrorForLog(e.reason)}`);
});

logInfo("Rack Inventory Studio frontend initializing");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
