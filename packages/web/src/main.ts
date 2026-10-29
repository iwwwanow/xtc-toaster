import { mount } from "svelte";
import App from "./App.svelte";
import { session } from "./session.svelte";

session.connect();
mount(App, { target: document.getElementById("app")! });

// debug: ?toast=<name> → that QA toast replaces the graph (see vite.config.ts); before the picture — the upload
// sets the imageId on whatever graph is there
const debugToastUrl: string | undefined = import.meta.env.DEBUG_TOAST_URL;
const debugToast = new URLSearchParams(location.search).get("toast");
if (debugToastUrl && debugToast) {
  const response = await fetch(`${debugToastUrl}/${encodeURIComponent(debugToast)}`);
  if (response.ok) await session.importToast(new File([await response.blob()], debugToast));
  else session.importError = `debug toast "${debugToast}": ${response.status}`;
}

// debug: DEBUG_IMAGE set → its picture goes through the normal upload right away (see vite.config.ts)
const debugImageUrl: string | null | undefined = import.meta.env.DEBUG_IMAGE_URL;
if (debugImageUrl) {
  const response = await fetch(debugImageUrl);
  if (response.ok) session.upload(new File([await response.blob()], "debug-image"));
  else console.error("debug image failed", response.status);
}
