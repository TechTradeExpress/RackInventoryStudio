import React from "react";
import ReactDOM from "react-dom/client";
import "./app.css";
import { App } from "./App";
import { AppBusyProvider } from "./lib/appBusy";
import { BusyOverlay } from "./components/ui/BusyOverlay";
import { WorkModeProvider } from "./lib/workMode";
import { logError, logInfo } from "./lib/diagnosticsLog";
import { sanitizeErrorForLog } from "./lib/redact";

window.addEventListener("error", (e) => {
  logError(`Unhandled error: ${sanitizeErrorForLog(e.error ?? e.message ?? "unknown")}`);
});

window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
  logError(`Unhandled rejection: ${sanitizeErrorForLog(e.reason)}`);
});

logInfo("Rack Inventory Studio frontend initializing");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <WorkModeProvider>
      <AppBusyProvider>
        <BusyOverlay />
        <App />
      </AppBusyProvider>
    </WorkModeProvider>
  </React.StrictMode>
);
