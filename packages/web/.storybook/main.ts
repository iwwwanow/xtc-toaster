import type { StorybookConfig } from "@storybook/svelte-vite";

// Storybook for setting up the ui by hand (13.11): the real nodes and panels on the real session, loaded from
// toasts — src/stories. Runs over the package's own vite config (svelte, favicon, the dev plugins)
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.ts"],
  framework: { name: "@storybook/svelte-vite", options: {} },
  core: { disableTelemetry: true },
};

export default config;
