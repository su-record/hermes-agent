import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { SystemActionsProvider } from "./contexts/SystemActions";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./themes";
import { HERMES_BASE_PATH } from "./lib/api";

const knowledgeOnly = import.meta.env.VITE_KNOWLEDGE_ONLY === "1";
const { default: App } = knowledgeOnly
  ? await import("./KnowledgeApp")
  : await import("./App");
if (!knowledgeOnly) {
  const { exposePluginSDK } = await import("./plugins");
  exposePluginSDK();
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter basename={HERMES_BASE_PATH || undefined}>
    <I18nProvider>
      <ThemeProvider>
        <SystemActionsProvider>
          <App />
        </SystemActionsProvider>
      </ThemeProvider>
    </I18nProvider>
  </BrowserRouter>,
);
