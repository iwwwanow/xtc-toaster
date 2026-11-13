import type { Preview } from "@storybook/svelte-vite";
// the page's styles in the page's order (App.svelte): uiu first, xyflow's base over its reset, then ours
import "uiu/owo.css";
import "uiu/ai-generated.css";
import "@xyflow/svelte/dist/base.css";
import "../src/app.css";

const preview: Preview = {
  parameters: { layout: "fullscreen" },
};

export default preview;
