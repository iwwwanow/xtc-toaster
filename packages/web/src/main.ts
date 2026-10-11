import { mount } from "svelte";
import App from "./App.svelte";
import { session } from "./session.svelte";

session.connect();
mount(App, { target: document.getElementById("app")! });

// debug: DEBUG_IMAGE set → its picture goes through the normal upload right away (see vite.config.ts)
const debugImageUrl: string | null | undefined = import.meta.env.DEBUG_IMAGE_URL;
if (debugImageUrl) {
  const response = await fetch(debugImageUrl);
  if (response.ok) session.upload(new File([await response.blob()], "debug-image"));
  else console.error("debug image failed", response.status);
}
