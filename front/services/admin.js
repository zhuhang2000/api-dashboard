// ==========================================================================
// Security Admin & Fail2ban API (front/services/admin.js)
// ==========================================================================

import { requestJson, authRequest } from "./http.js";

export const adminApi = {
  verify(password) {
    return requestJson("/api/admin/verify", {
      method: "POST",
      body: JSON.stringify({ password })
    });
  },

  getStatus() {
    return authRequest("/api/admin/fail2ban/status");
  },

  getIpStats(run = false) {
    const path = run ? "/api/admin/ip-stats/run" : "/api/admin/ip-stats/latest";
    const method = run ? "POST" : "GET";
    return authRequest(path, { method });
  },

  banIp(ip) {
    return authRequest("/api/admin/fail2ban/ban", {
      method: "POST",
      body: JSON.stringify({ ip })
    });
  },

  unbanIp(ip) {
    return authRequest("/api/admin/fail2ban/unban", {
      method: "POST",
      body: JSON.stringify({ ip })
    });
  },

  unbanAll() {
    return authRequest("/api/admin/fail2ban/unban-all", {
      method: "POST"
    });
  }
};
