<script lang="ts">
  import { Panel } from "@xyflow/svelte";
  import { NODE_CATEGORIES, NODE_HINTS, NODE_LABELS, NODE_TYPE_MIME } from "../graph";
  import { groupItem, type MenuItem } from "../groups";
  import { session } from "../session.svelte";

  // dropped or not — the drag is over, the link under it isn't highlighted any more
  const ondragend = () => {
    session.menuDrag = null;
    session.dropLink = null;
  };

  const ondragstart = (event: DragEvent, item: MenuItem) => {
    hint = null;
    session.menuDrag = item;
    event.dataTransfer?.setData(NODE_TYPE_MIME, item);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };

  // the menu scrolls, and a scroll box clips what sticks out of it — so the hint isn't a child of the item
  // (uiu's css tooltip) but one fixed element beside the hovered item; gone on leave / scroll / drag
  const HINT_GAP = 4;
  let hint = $state<{ text: string; x: number; y: number } | null>(null);
  const onenter = (text: string, { currentTarget }: MouseEvent & { currentTarget: HTMLElement }) => {
    // right of the whole menu, not of the item — the scrollbar sits between them
    const { right } = (currentTarget.closest(".node-menu") ?? currentTarget).getBoundingClientRect();
    const { top, height } = currentTarget.getBoundingClientRect();
    hint = { text, x: right + HINT_GAP, y: top + height / 2 };
  };
</script>

<Panel position="top-left">
  <fieldset class="frame node-menu" onscroll={() => (hint = null)}>
    <legend><h6>nodes</h6></legend>
    {#each NODE_CATEGORIES as { name, types } (name)}
      <!-- a labeled rule (uiu) over each group, the first included -->
      <fieldset class="hr_fieldset"><legend><h6>{name}</h6></legend></fieldset>
      {#each types as type (type)}
        <!-- dragged onto the canvas, not clicked — a button only by its look (uiu), hover included.
             One animation node per graph (contract), at the root — never inside a group -->
        {@const taken = type === "animation" && (session.animationNode !== undefined || session.openGroup !== undefined)}
        <div
          class="btn_ai-generated btn-sm_ai-generated"
          draggable={!taken}
          role="listitem"
          style="justify-content: flex-start"
          style:cursor={taken ? "not-allowed" : "grab"}
          style:opacity={taken ? 0.4 : 1}
          ondragstart={(event) => ondragstart(event, type)}
          {ondragend}
          onmouseenter={(event) => onenter(NODE_HINTS[type], event)}
          onmouseleave={() => (hint = null)}
        >
          {NODE_LABELS[type]}
        </div>
      {/each}
    {/each}
    {#if session.groups.length > 0}
      <!-- the groups of this toast: each dragged out is another instance, linked to the rest; none inside a group (no
           nesting yet). One no instance uses can be deleted -->
      <fieldset class="hr_fieldset"><legend><h6>groups</h6></legend></fieldset>
      {#each session.groups as { id, name } (id)}
        {@const nested = session.openGroup !== undefined}
        {@const unused = session.instancesOf(id) === 0}
        <div class="node-menu__group">
          <div
            class="btn_ai-generated btn-sm_ai-generated"
            draggable={!nested}
            role="listitem"
            style="justify-content: flex-start; flex: 1; min-width: 0"
            style:cursor={nested ? "not-allowed" : "grab"}
            style:opacity={nested ? 0.4 : 1}
            ondragstart={(event) => ondragstart(event, groupItem(id))}
            {ondragend}
            onmouseenter={(event) =>
              onenter(nested ? "no group inside a group yet" : "another instance — an edit inside changes every one", event)}
            onmouseleave={() => (hint = null)}
          >
            {name}
          </div>
          {#if unused}
            <button
              class="btn_ai-generated btn-sm_ai-generated"
              aria-label="delete {name}"
              title="delete the group — no instance uses it"
              onclick={() => session.removeGroup(id)}>×</button
            >
          {/if}
        </div>
      {/each}
    {/if}
  </fieldset>
</Panel>

{#if hint}
  {#key hint.text}
    <span class="tooltip__content_ai-generated fixed-hint" style="left: {hint.x}px; top: {hint.y}px">{hint.text}</span>
  {/key}
{/if}
