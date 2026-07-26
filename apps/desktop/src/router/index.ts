import { createRouter, createWebHashHistory } from "vue-router";
import RequestWorkspace from "../features/requests/views/RequestWorkspace.vue";
import SettingsView from "../features/settings/views/SettingsView.vue";
import PhaseTwoView from "../features/workspace/views/PhaseTwoView.vue";
import EnvironmentsView from "../features/environments/views/EnvironmentsView.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "workspace", component: RequestWorkspace },
    {
      path: "/environments",
      name: "environments",
      component: EnvironmentsView,
    },
    {
      path: "/history",
      name: "history",
      component: PhaseTwoView,
      meta: {
        titleKey: "app.history",
        descriptionKey: "workspace.historyDescription",
      },
    },
    { path: "/settings", name: "settings", component: SettingsView },
  ],
});
