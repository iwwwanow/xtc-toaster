// reordering rows inside a node by drag & drop (layers rows, animation tracks); a menu drop onto the canvas uses
// another mime, so it doesn't land here
export class RowDrag {
  dragged = $state<number | null>(null);
  over = $state<number | null>(null);

  constructor(
    private readonly mime: string,
    private readonly move: (from: number, to: number) => void,
  ) {}

  start = (index: number) => (event: DragEvent) => {
    this.dragged = index;
    event.dataTransfer?.setData(this.mime, String(index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };
  dragover = (index: number) => (event: DragEvent) => {
    if (this.dragged === null) return;
    event.preventDefault();
    this.over = index;
  };
  drop = (index: number) => (event: DragEvent) => {
    if (this.dragged === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.dragged !== index) this.move(this.dragged, index);
    this.end();
  };
  end = () => {
    this.dragged = this.over = null;
  };
}
