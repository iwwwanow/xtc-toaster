import type { Meta, StoryObj } from "@storybook/svelte-vite";
import StoryCanvas from "./StoryCanvas.svelte";
import { single, TOASTS } from "./load.svelte";

// Every node as the canvas shows it, one story per type (its defaults, as the menu drops it) and per state.
// Edit app.css / uiu and the story follows (vite hmr)
const meta = {
  title: "Nodes",
  component: StoryCanvas,
  argTypes: {
    toast: { control: false },
    open: { control: "text" },
    connected: { control: "boolean" },
    picture: { control: "boolean" },
    renderError: { control: "text" },
    errorNode: { control: "text" },
  },
  args: { connected: true, picture: false },
} satisfies Meta<typeof StoryCanvas>;
export default meta;
type Story = StoryObj<typeof meta>;

// all of them at once — tests/toasts/all-nodes.json
export const All: Story = { args: { toast: "all-nodes" } };

// select
export const SelectColor: Story = { args: { toast: single("selectColor") } };
export const SelectVivid: Story = { args: { toast: single("selectVivid") } };
export const SelectBright: Story = { args: { toast: single("selectBright") } };
export const Channel: Story = { args: { toast: single("channel") } };
// color
export const Fill: Story = { args: { toast: single("fill") } };
export const Tint: Story = { args: { toast: single("tint") } };
export const ColorNoise: Story = { args: { toast: single("colorNoise") } };
export const Opacity: Story = { args: { toast: single("opacity") } };
// effect
export const Blur: Story = { args: { toast: single("blur") } };
// move
export const Move: Story = { args: { toast: single("move") } };
export const Rotate: Story = { args: { toast: single("rotate") } };
export const Scale: Story = { args: { toast: single("scale") } };
export const Skew: Story = { args: { toast: single("skew") } };
export const Turn3d: Story = { args: { toast: single("turn3d") } };
export const Corners: Story = { args: { toast: single("corners") } };
export const Matrix: Story = { args: { toast: single("matrix") } };
// layers, animation, value
export const Layers: Story = { args: { toast: single("layers") } };
export const Animation: Story = { args: { toast: single("animation") } };
export const Delay: Story = { args: { toast: single("delay") } };
export const Value: Story = { args: { toast: single("value") } };
export const Factor: Story = { args: { toast: single("factor") } };

// states
// fields on tracks show the playhead's value, locked; the animation node with its channels and keys
export const Animated: Story = { args: { toast: "animation" } };
// params wired into a value / a factor — locked, showing what they're given
export const DrivenByValue: Story = { args: { toast: "value" } };
export const DrivenByFactor: Story = { args: { toast: "factor" } };
// a delay with its rows and the free one under them
export const DelayRows: Story = { args: { toast: "delay" } };
// two linked instances of a group, their exposed params as fields
export const GroupInstances: Story = { args: { toast: "group" } };
// a group's inside: the group input's rows, the fields' param dots on the left
export const GroupInside: Story = { args: { toast: "group", open: TOASTS.group?.groups?.[0]?.id ?? "spin" } };
// the server refused the graph — on the output, and on the node it named
export const RenderError: Story = { args: { toast: "animation", picture: true, renderError: "only a numeric param can be animated", errorNode: "move-1" } };
// a picture uploaded, its render in the output
export const Rendered: Story = { args: { toast: "animation", picture: true } };
// no server: every field locked
export const Disconnected: Story = { args: { toast: "all-nodes", connected: false } };
