import type { GraphNode, ToastGraph } from "@xtc-toaster/contract";
import { TOAST_GRAPH_VERSION } from "@xtc-toaster/contract";
import { createNode, type MenuNodeType } from "../graph";
import { session } from "../session.svelte";
// a picture to stand in for a render — lib's test fixture
import POPPIES from "../../../lib/tests/fixtures/poppies.jpg?url";

// What a story shows: a toast put into the real session, as an import would put it. Storybook has no server:
// `connected` stands in for the socket (the editor is locked without it), `picture` for an upload and its render,
// `renderError` for the server refusing the graph

// the QA toasts (tests/toasts, README there) by name
const files = import.meta.glob<ToastGraph>("../../../../tests/toasts/*.json", { eager: true, import: "default" });
export const TOASTS: Record<string, ToastGraph> = Object.fromEntries(
  Object.entries(files).map(([path, toast]) => [path.slice(path.lastIndexOf("/") + 1, -".json".length), toast]),
);

// one node of a menu type with its defaults (createNode), beside the input and the output a toast must have
export const single = (type: MenuNodeType): ToastGraph => {
  const { id, data } = createNode(type, { x: 0, y: 0 });
  return {
    version: TOAST_GRAPH_VERSION,
    nodes: [{ id: "in", type: "input", data: { imageId: null } }, { id, type, data } as GraphNode, { id: "out", type: "output", data: {} }],
    edges: [],
  };
};

export type StoryState = {
  // a toast, or a QA toast's name
  toast: ToastGraph | string;
  // the group whose inside is shown
  open?: string;
  // false — no server: every field locked
  connected?: boolean;
  // a picture uploaded and rendered (poppies) — the output shows it; without one the output asks for an upload
  picture?: boolean;
  // the server refused the graph (needs a picture): the output shows it, named by `errorNode`
  renderError?: string;
  errorNode?: string;
};

// a picture's id as an upload gives it (a uuid) — nothing on any server, the render is the poppies below
const STORY_IMAGE = "00000000-0000-4000-8000-000000000000";

let poppies: Blob | null = null;

export const loadStory = async ({ toast, open, connected = true, picture = false, renderError, errorNode }: StoryState): Promise<void> => {
  const graph = typeof toast === "string" ? TOASTS[toast] : toast;
  if (!graph) throw new Error(`no toast "${String(toast)}" in tests/toasts`);
  session.connected = connected;
  if (!(await session.importToast(new File([JSON.stringify(graph)], "story.json")))) throw new Error(session.importError ?? "import failed");
  // an import keeps the session's picture — the story's is set on the input after it, not as an edit to undo
  const input = session.nodes.find((node) => node.type === "input");
  if (input) session.setNodeData(input.id, { imageId: picture ? STORY_IMAGE : null });
  session.restartHistory();
  session.openView(open ?? null);
  session.renderError = renderError ? { message: renderError, ...(errorNode && { nodeId: errorNode }) } : null;
  poppies ??= await (await fetch(POPPIES)).blob();
  if (session.rendered) URL.revokeObjectURL(session.rendered.url);
  session.rendered = picture ? { blob: poppies, url: URL.createObjectURL(poppies) } : null;
};

// A story's toast loaded into the session once its args are known, and again whenever they change: from an effect —
// the session's state can't change in a template expression. `ready` turns false while a load is on its way
export const useStory = (args: () => StoryState) => {
  const story = $state<{ ready: boolean; error: string | null }>({ ready: false, error: null });
  $effect(() => {
    const state = $state.snapshot(args()) as StoryState;
    story.ready = false;
    let current = true;
    loadStory(state).then(
      () => current && Object.assign(story, { ready: true, error: null }),
      (error: unknown) => current && Object.assign(story, { ready: false, error: error instanceof Error ? error.message : String(error) }),
    );
    return () => (current = false);
  });
  return story;
};
