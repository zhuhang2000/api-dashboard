// ==========================================================================
// Codex Quota API (front/services/quotas.js)
// ==========================================================================

import { requestJson } from "./http.js";

export const quotasApi = {
  refresh() {
    return requestJson("/api/quotas/refresh", { method: "POST" });
  }
};
