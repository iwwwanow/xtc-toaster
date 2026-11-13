<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import type { FlowNodeOf } from "../graph";
  import { exposedParams, stepOf } from "../groups";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  // A group's instance: its group's inside stands behind it (expanded for the render), one pixel input and output, a
  // field per exposed param — this instance's own value, else the inner node's — wired out like any param. Every
  // instance shares the inside: double click or `open` goes into it
  let { id, data }: NodeProps<FlowNodeOf<"group">> = $props();

  let group = $derived(session.groups.find(({ id }) => id === data.group));
  let params = $derived(exposedParams(group));
  const innerType = (node: string) => group?.nodes.find(({ id }) => id === node)?.type;

  const open = () => session.openView(data.group);
  // a double click on a field types into it — only the frame itself opens the group
  const ondblclick = (event: MouseEvent) => {
    if (!(event.target instanceof Element) || !event.target.closest(".nodrag")) open();
  };
</script>

<Handle type="target" position={Position.Left} />
<Handle type="source" position={Position.Right} />
<!-- svelte-ignore a11y_no_noninteractive_element_interactions — `open` is the keyboard's way in -->
<fieldset class="frame" {ondblclick}>
  <legend><h6>{group?.name ?? "group"}</h6></legend>
  {#each params as param (param.id)}
    <Slider
      label={param.name}
      hint="{param.name} inside the group, this instance's own value"
      node={id}
      param={param.id}
      bounds={param.bounds}
      step={stepOf(param.bounds, innerType(param.node))}
      value={data.params?.[param.id] ?? param.value}
      onchange={(value) => session.setNodeData(id, { ...data, params: { ...data.params, [param.id]: value } })}
    />
  {/each}
  <button class="nodrag btn_ai-generated btn-sm_ai-generated" title="into the group — an edit there changes every instance" onclick={open}
    >open</button
  >
</fieldset>
