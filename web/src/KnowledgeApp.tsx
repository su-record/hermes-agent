import { Navigate, Route, Routes } from "react-router";

import { PageHeaderProvider } from "@/contexts/PageHeaderProvider";
import KnowledgePage from "@/pages/KnowledgePage";

export default function KnowledgeApp() {
  return (
    <div className="flex h-dvh bg-background-base text-text-primary antialiased">
      <PageHeaderProvider pluginTabs={[]}>
        <Routes>
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="*" element={<Navigate to="/knowledge" replace />} />
        </Routes>
      </PageHeaderProvider>
    </div>
  );
}
