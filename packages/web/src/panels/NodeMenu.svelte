<script lang="ts">
  import { Panel } from "@xyflow/svelte";
  import { NODE_CATEGORIES, NODE_HINTS, NODE_LABELS, NODE_TYPE_MIME, type MenuNodeType } from "../graph";

  const ondragstart = (event: DragEvent, type: string) => {
    hint = null;
    event.dataTransfer?.setData(NODE_TYPE_MIME, type);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };

  // the menu scrolls, and a scroll box clips what sticks out of it — so the hint isn't a child of the item
  // (uiu's css tooltip) but one fixed element beside the hovered item; gone on leave / scroll / drag
  const HINT_GAP = 4;
  let hint = $state<{ type: MenuNodeType; x: number; y: number } | null>(null);
  const onenter = (type: MenuNodeType, { currentTarget }: MouseEvent & { currentTarget: HTMLElement }) => {
    // right of the whole menu, not of the item — the scrollbar sits between them
    const { right } = (currentTarget.closest(".node-menu") ?? currentTarget).getBoundingClientRect();
    const { top, height } = currentTarget.getBoundingClientRect();
    hint = { type, x: right + HINT_GAP, y: top + height / 2 };
  };
</script>

<Panel position="top-left">
  <fieldset class="frame node-menu" onscroll={() => (hint = null)}>
    <legend><h6>nodes</h6></legend>
    {#each NODE_CATEGORIES as { name, types } (name)}
      <!-- a labeled rule (uiu) over each group, the first included -->
      <fieldset class="hr_fieldset"><legend><h6>{name}</h6></legend></fieldset>
      {#each types as type (type)}
        <!-- dragged onto the canvas, not clicked — a button only by its look (uiu), hover included -->
        <div
          class="btn_ai-generated btn-sm_ai-generated"
          draggable="true"
          role="listitem"
          style="justify-content: flex-start; cursor: grab"
          ondragstart={(event) => ondragstart(event, type)}
          onmouseenter={(event) => onenter(type, event)}
          onmouseleave={() => (hint = null)}
        >
          {NODE_LABELS[type]}
        </div>
      {/each}
    {/each}
  </fieldset>
</Panel>

{#if hint}
  {#key hint.type}
    <span class="tooltip__content_ai-generated fixed-hint" style="left: {hint.x}px; top: {hint.y}px">{NODE_HINTS[hint.type]}</span>
  {/key}
{/if}
