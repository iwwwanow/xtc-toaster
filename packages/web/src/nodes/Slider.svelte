<script lang="ts">
  import type { ParamBounds } from "@xtc-toaster/contract";
  import { session } from "../session.svelte";
  import { DRAG_THRESHOLD, dragDelta, fillPercent, formatValue, parseTyped, snap } from "../slider";

  type Props = { label: string; bounds: ParamBounds; step: number; value: number; onchange: (value: number) => void };
  let { label, bounds, step, value, onchange }: Props = $props();

  // shown while dragging, ahead of the graph; follows the prop whenever it changes
  let current = $derived(value);

  // a change goes to the graph only when it is one — a drag back to the start renders nothing
  const commit = (next: number) => {
    current = next;
    if (next !== value) onchange(next);
  };

  // press → drag (past the threshold) or click (→ text input); `exact` keeps the unsnapped sum, so slow
  // shift moves still add up between the steps
  let press: { x: number; exact: number; dragging: boolean } | null = null;
  let editing = $state(false);

  const onpointerdown = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (session.locked || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    press = { x: event.clientX, exact: current, dragging: false };
  };
  const onpointermove = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (!press) return;
    if (!press.dragging && Math.abs(event.clientX - press.x) < DRAG_THRESHOLD) return;
    press.dragging = true;
    const { width } = event.currentTarget.getBoundingClientRect();
    press.exact += dragDelta(event.clientX - press.x, width, bounds, event.shiftKey);
    press.x = event.clientX;
    current = snap(press.exact, bounds, step);
  };
  // release → graph change → render; no live render while dragging. A press that never moved opens the input
  // on click — opened on release, the same click's mouseup lands in the input and drops its selection
  let clicked = false;
  const onpointerup = () => {
    if (!press) return;
    if (press.dragging) commit(current);
    clicked = !press.dragging;
    press = null;
  };
  const onclick = () => {
    if (clicked) editing = true;
    clicked = false;
  };

  const nudge = (direction: -1 | 1) => !session.locked && commit(snap(current + direction * step, bounds, step));

  const onkeydown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      nudge(event.key === "ArrowLeft" ? -1 : 1);
    }
    if (event.key === "Enter" && !session.locked) editing = true;
  };

  // the text input: Enter / blur keeps, Esc drops; junk keeps the old value
  const type = (text: string) => {
    if (!editing) return; // Esc already closed it — the blur that follows changes nothing
    editing = false;
    const typed = parseTyped(text, bounds);
    if (typed !== null) commit(typed);
  };
  const ontypekey = (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
    if (event.key === "Enter") type(event.currentTarget.value);
    if (event.key === "Escape") editing = false;
  };
</script>

<!-- like blender's number field: two columns — the label right-aligned, the field; drag it (shift — slower),
     ‹ › step it, a click types a value -->
<div class="param">
  <span class="param__label field__label_ai-generated">{label}</span>
  {#if editing}
    <!-- size 1: a text input is ~20 characters wide by itself and would widen the node's column — this way
         it takes the field's width (min-width in app.css) -->
    <input
      class="nodrag input_ai-generated input-sm_ai-generated drag-field__input"
      size="1"
      value={current}
      {@attach (input: HTMLInputElement) => (input.focus(), input.select())}
      onkeydown={ontypekey}
      onblur={({ currentTarget }) => type(currentTarget.value)}
    />
  {:else}
    <div
      class="nodrag drag-field"
      class:drag-field_locked={session.locked}
      role="slider"
      tabindex={session.locked ? -1 : 0}
      aria-label={label}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      aria-valuenow={current}
      {onpointerdown}
      {onpointermove}
      {onpointerup}
      {onclick}
      onpointercancel={() => (press = null)}
      {onkeydown}
    >
      <div class="drag-field__fill" style:width="{fillPercent(current, bounds)}%"></div>
      <!-- the arrows take the press themselves — it must not start a drag -->
      <button
        class="drag-field__arrow"
        type="button"
        tabindex="-1"
        aria-label="decrease"
        onpointerdown={(event) => event.stopPropagation()}
        onclick={() => nudge(-1)}>‹</button
      >
      <span class="drag-field__value">{formatValue(current, step)}</span>
      <button
        class="drag-field__arrow"
        type="button"
        tabindex="-1"
        aria-label="increase"
        onpointerdown={(event) => event.stopPropagation()}
        onclick={() => nudge(1)}>›</button
      >
    </div>
  {/if}
</div>
