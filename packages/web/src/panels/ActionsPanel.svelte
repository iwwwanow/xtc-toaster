<script lang="ts">
  import { Panel } from "@xyflow/svelte";
  import { onDestroy } from "svelte";
  import { ANIMATION_FORMATS, type AnimationFormat, type AnimationLoop } from "@xtc-toaster/contract";
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

  // the export dropdown: open / closed is ui only
  let exportOpen = $state(false);
  let settings = $derived(session.exportSettings);
  const set = (next: Partial<typeof settings>) => {
    const merged = { ...settings, ...next };
    // a field set back to its default leaves the toast
    session.setExportSettings(Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined)));
  };

  // the loop: reps or seconds or neither — the format's default: gif forever, mp4 one cycle
  type LoopMode = "default" | "reps" | "seconds";
  const LOOP_INITIAL = { reps: { reps: 3 }, seconds: { seconds: 15 } } as const satisfies Record<string, AnimationLoop>;
  let loopMode = $derived<LoopMode>(!settings.loop ? "default" : "reps" in settings.loop ? "reps" : "seconds");
  const onloopmode = ({ currentTarget }: Event & { currentTarget: HTMLSelectElement }) => {
    const mode = currentTarget.value as LoopMode;
    set({ loop: mode === "default" ? undefined : LOOP_INITIAL[mode] });
  };

  // a typed number: the toast takes only a valid one, else the field shows the old one back
  const numberField =
    (current: () => number, parse: (value: number) => number | null, apply: (value: number) => void) =>
    ({ currentTarget }: Event & { currentTarget: HTMLInputElement }) => {
      const value = currentTarget.valueAsNumber;
      const parsed = Number.isFinite(value) ? parse(value) : null;
      currentTarget.value = String(parsed ?? current());
      if (parsed !== null) apply(parsed);
    };
</script>

<Panel position="top-right" style="display: flex; flex-direction: column; align-items: stretch; gap: var(--GRID-GAP-4)">
  <button class="btn_ai-generated" disabled={session.locked || !session.rendered} onclick={() => session.download()}>download png</button>
  <!-- TODO(uiu): hand-written — uiu has no button group / dropdown: the render button and its ▾ side by side -->
  <div class="export-group">
    <span class="tooltip_ai-generated tooltip-left export-group__main">
      <button class="btn_ai-generated" disabled={!session.canExport} onclick={() => session.exportAnimation()}
        >{session.exporting
          ? `frame ${session.exporting.frame} / ${session.exporting.frames}`
          : `render ${session.exportFormat}`}</button
      >
      <span class="tooltip__content_ai-generated"
        >one cycle of the animation node as .{session.exportFormat} — needs a track with keys</span
      >
    </span>
    <button
      class="btn_ai-generated"
      aria-expanded={exportOpen}
      title={exportOpen ? "hide the export settings" : "export settings: format, loop"}
      onclick={() => (exportOpen = !exportOpen)}>{exportOpen ? "▴" : "▾"}</button
    >
  </div>
  {#if exportOpen}
    {@const locked = session.exporting !== null}
    <fieldset class="frame export-settings">
      <legend><h6>export</h6></legend>
      <label class="param">
        <span class="param__label field__label_ai-generated">format</span>
        <select
          class="select_ai-generated input-sm_ai-generated"
          value={session.exportFormat}
          disabled={locked}
          onchange={({ currentTarget }) => set({ format: currentTarget.value as AnimationFormat })}
        >
          {#each ANIMATION_FORMATS as format (format)}
            <option value={format}>{format}</option>
          {/each}
        </select>
      </label>
      <label class="param">
        <span class="param__label field__label_ai-generated">loop</span>
        <select class="select_ai-generated input-sm_ai-generated" value={loopMode} disabled={locked} onchange={onloopmode}>
          <option value="default">{session.exportFormat === "gif" ? "forever" : "once"}</option>
          <option value="reps">reps</option>
          <option value="seconds">seconds</option>
        </select>
      </label>
      {#if settings.loop && "reps" in settings.loop}
        {@const { reps } = settings.loop}
        <label class="param">
          <span class="param__label field__label_ai-generated">reps</span>
          <input
            class="input_ai-generated input-sm_ai-generated"
            type="number"
            min="1"
            value={reps}
            disabled={locked}
            onchange={numberField(
              () => reps,
              (value) => (Number.isInteger(value) && value >= 1 ? value : null),
              (reps) => set({ loop: { reps } }),
            )}
          />
        </label>
      {:else if settings.loop}
        {@const loop = settings.loop}
        <label class="param">
          <span class="param__label field__label_ai-generated">seconds</span>
          <input
            class="input_ai-generated input-sm_ai-generated"
            type="number"
            step="any"
            min="0"
            value={loop.seconds}
            disabled={locked}
            onchange={numberField(
              () => loop.seconds,
              (value) => (value > 0 ? value : null),
              (seconds) => set({ loop: { ...loop, seconds } }),
            )}
          />
        </label>
        <label
          class="checkbox_ai-generated"
          title="on — the length rounds to whole cycles; off — exactly these seconds, the last cycle cut on a frame"
        >
          <input
            type="checkbox"
            checked={loop.wholeCycles !== false}
            disabled={locked}
            onchange={({ currentTarget }) => {
              const { wholeCycles: _, ...rest } = loop;
              set({ loop: currentTarget.checked ? rest : { ...rest, wholeCycles: false } });
            }}
          />
          whole cycles
        </label>
      {/if}
    </fieldset>
  {/if}
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
