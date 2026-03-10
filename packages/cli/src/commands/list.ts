import { readConfig } from "../config.js";

interface Toast {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export async function listCommand() {
  const config = readConfig();

  const res = await fetch(`${config.apiUrl}/toasts`);
  if (!res.ok) {
    console.error(`Failed to fetch toasts: ${res.statusText}`);
    process.exit(1);
  }

  const toasts = (await res.json()) as Toast[];
  if (toasts.length === 0) {
    console.log("No toasts published yet.");
    return;
  }

  for (const t of toasts) {
    const desc = t.description ? `  — ${t.description}` : "";
    console.log(`[${t.id}] ${t.name}${desc}`);
  }
}
