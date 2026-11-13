import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { TOASTS } from "./load.svelte";
import StoryEditor from "./StoryEditor.svelte";

// The whole editor on a QA toast (tests/toasts, what each one checks — README there): pick it in the controls
const meta = {
  title: "Editor",
  component: StoryEditor,
  argTypes: {
    toast: { control: "select", options: Object.keys(TOASTS).filter((name) => !name.startsWith("broken-")) },
    connected: { control: "boolean" },
    picture: { control: "boolean" },
    renderError: { control: "text" },
    errorNode: { control: "text" },
    open: { control: "text" },
  },
  args: { toast: "all-nodes", connected: true, picture: true },
} satisfies Meta<typeof StoryEditor>;
export default meta;

export const Editor: StoryObj<typeof meta> = {};
