<script lang="ts">
  import type { ParamBounds } from "@xtc-toaster/contract";
  import { session } from "../session.svelte";

  type Props = { label: string; bounds: ParamBounds; step: number; value: number; onchange: (value: number) => void };
  let { label, bounds, step, value, onchange }: Props = $props();

  // shown while dragging, ahead of the graph; follows the prop whenever it changes
  let current = $derived(value);
  let decimals = $derived(Math.max(0, -Math.floor(Math.log10(step))));
</script>

<!-- release → graph change → render; no live render while dragging (next release) -->
<label class="field_ai-generated">
  <span class="field__label_ai-generated">{label}: {current.toFixed(decimals)}</span>
  <input
    class="nodrag range_ai-generated"
    type="range"
    min={bounds.min}
    max={bounds.max}
    {step}
    value={current}
    disabled={session.locked}
    oninput={({ currentTarget }) => (current = currentTarget.valueAsNumber)}
    onchange={() => onchange(current)}
  />
</label>
