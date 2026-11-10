// undo / redo over editor snapshots (persist's toSaved: the graph, the export settings, where the nodes stand).
// A snapshot is taken once an edit settles (App), so a drag or a typing burst is one step. Selection, the view,
// the playhead aren't in a snapshot — they never make a step and an undo leaves them be
export const HISTORY_LIMIT = 100;

export class History {
  private past: string[] = [];
  private future: string[] = [];

  constructor(
    private current: string,
    private readonly limit = HISTORY_LIMIT,
  ) {}

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  // a new state of the editor: the one before it becomes a step back, the steps forward are gone.
  // The same state again (a re-render, an undo's own echo) is no step
  record(snapshot: string): boolean {
    if (snapshot === this.current) return false;
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    this.current = snapshot;
    return true;
  }

  // the state to show, or null — nothing to undo
  undo(): string | null {
    const previous = this.past.pop();
    if (previous === undefined) return null;
    this.future.push(this.current);
    this.current = previous;
    return previous;
  }

  redo(): string | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.current = next;
    return next;
  }

  // the state an undo / redo was applied as — the editor may write it a bit differently (the order of fields);
  // keeping that as the current one stops its echo from looking like a new edit
  settle(snapshot: string) {
    this.current = snapshot;
  }
}
