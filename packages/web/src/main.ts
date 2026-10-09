import { mount } from "svelte";
import App from "./App.svelte";
import { session } from "./session.svelte";

session.connect();
mount(App, { target: document.getElementById("app")! });
