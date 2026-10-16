<script lang="ts">
  import { Panel, useSvelteFlow } from "@xyflow/svelte";
  import { session } from "../session.svelte";

  const { fitView } = useSvelteFlow();
  let fileInput: HTMLInputElement;

  const onchange = async ({ currentTarget }: Event & { currentTarget: HTMLInputElement }) => {
    const file = currentTarget.files?.[0];
    // the same file can be picked again (after editing it, or after an error)
    currentTarget.value = "";
    // the layout is rebuilt — show all of it, like on page open
    if (file && (await session.importToast(file))) void fitView({ maxZoom: 1 });
  };
</script>

<Panel position="top-right" style="display: flex; flex-direction: column; gap: 4px">
  <button disabled={session.locked || !session.rendered} onclick={() => session.download()}>download png</button>
  <button onclick={() => session.exportToast()}>export toast</button>
  <button onclick={() => fileInput.click()}>import toast</button>
  <input bind:this={fileInput} type="file" accept="application/json,.json" hidden {onchange} />
  {#if session.importError}
    <div style="color: crimson">{session.importError}</div>
  {/if}
</Panel>
