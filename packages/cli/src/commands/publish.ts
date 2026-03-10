import { readFileSync } from "fs";
import { readConfig } from "../config.js";

interface PublishOptions {
  name: string;
  description?: string;
  preview: string;
}

export async function publishCommand(opts: PublishOptions) {
  const config = readConfig();

  if (!config.token) {
    console.error("Not logged in. Run: toast login <login> <password>");
    process.exit(1);
  }

  const previewData = readFileSync(opts.preview);
  const form = new FormData();
  form.append("name", opts.name);
  if (opts.description) form.append("description", opts.description);
  form.append("preview", new Blob([previewData], { type: "image/gif" }), `${opts.name}.gif`);

  const res = await fetch(`${config.apiUrl}/toasts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}` },
    body: form,
  });

  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    console.error(`Publish failed: ${err.error ?? res.statusText}`);
    process.exit(1);
  }

  const toast = (await res.json()) as { id: string; name: string };
  console.log(`Toast published: [${toast.id}] ${toast.name}`);
}
