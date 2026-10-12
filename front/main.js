// ==========================================================================
// Root Application Entry (front/main.js)
// ==========================================================================

import { createApp, ref, onMounted, onUnmounted } from "vue";
import { DashboardView } from "./dashboard/dashboard.js";
import { SecurityView } from "./security-manager/security-manager.js";

const App = {
  name: "App",
  components: {
    DashboardView,
    SecurityView
  },
  template: `
    <main class="app-shell">
      <DashboardView
        v-if="currentView === 'dashboard'"
        @open-security="navigateTo('security')"
      />
      <SecurityView
        v-else-if="currentView === 'security'"
        @back-to-dashboard="navigateTo('dashboard')"
      />
    </main>
  `,
  setup() {
    const currentView = ref(window.location.hash === "#security" ? "security" : "dashboard");

    function navigateTo(view) {
      currentView.value = view;
      if (view === "security") {
        if (window.location.hash !== "#security") {
          window.location.hash = "#security";
        }
      } else {
        if (window.location.hash === "#security") {
          history.replaceState(null, "", window.location.pathname);
        }
      }
    }

    function onHashChange() {
      currentView.value = window.location.hash === "#security" ? "security" : "dashboard";
    }

    onMounted(() => {
      window.addEventListener("hashchange", onHashChange);
    });

    onUnmounted(() => {
      window.removeEventListener("hashchange", onHashChange);
    });

    return {
      currentView,
      navigateTo
    };
  }
};

createApp(App).mount("#app");
