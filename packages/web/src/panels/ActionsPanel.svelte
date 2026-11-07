<script lang="ts">
  import { Panel } from "@xyflow/svelte";
  import { onDestroy } from "svelte";
  import { session } from "../session.svelte";

  let fileInput: HTMLInputElement;

  const onchange = async ({ currentTarget }: Event & { currentTarget: HTMLInputElement }) => {
    const file = currentTarget.files?.[0];
    // the same file can be picked again (after editing it, or after an error)
    currentTarget.value = "";
    if (file) await session.importToast(file);
  };

  // «clear graph» takes two clicks — no confirm(): the first arms it for a moment, the second clears
  const ARMED_MS = 3000;
  let armed = $state(false);
  let disarm: ReturnType<typeof setTimeout> | undefined;
  const onclear = () => {
    clearTimeout(disarm);
    if (!armed) {
      armed = true;
      disarm = setTimeout(() => (armed = false), ARMED_MS);
      return;
    }
    armed = false;
    session.clearGraph();
  };
  onDestroy(() => clearTimeout(disarm));
</script>

<Panel position="top-right" style="display: flex; flex-direction: column; align-items: stretch; gap: var(--GRID-GAP-4)">
  <button class="btn_ai-generated" disabled={session.locked || !session.rendered} onclick={() => session.download()}>download png</button>
  <span class="tooltip_ai-generated tooltip-left">
    <button class="btn_ai-generated" disabled={!session.canExport} onclick={() => session.exportAnimation()}
      >{session.exporting ? `frame ${session.exporting.frame} / ${session.exporting.frames}` : "render animation"}</button
    >
    <span class="tooltip__content_ai-generated">one cycle of the animation node as .gif — needs a track with keys</span>
  </span>
  {#if session.exportError}
    <div class="field__error_ai-generated">{session.exportError}</div>
  {/if}
  <!-- the sister asked what the .json is — a hint, the button label stays short -->
  <span class="tooltip_ai-generated tooltip-left">
    <button class="btn_ai-generated" onclick={() => session.exportToast()}>export toast</button>
    <span class="tooltip__content_ai-generated">the node graph as .json, no picture</span>
  </span>
  <span class="tooltip_ai-generated tooltip-left">
    <button class="btn_ai-generated" onclick={() => fileInput.click()}>import toast</button>
    <span class="tooltip__content_ai-generated">a .json from export toast</span>
  </span>
  <input bind:this={fileInput} type="file" accept="application/json,.json" hidden {onchange} />
  {#if session.importError}
    <div class="field__error_ai-generated">{session.importError}</div>
  {/if}
  <span class="tooltip_ai-generated tooltip-left">
    <button class="btn_ai-generated" onclick={onclear}>{armed ? "sure? click again" : "clear graph"}</button>
    <span class="tooltip__content_ai-generated">input → output only, the picture stays</span>
  </span>
</Panel>
