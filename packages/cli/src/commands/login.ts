import { readConfig, writeConfig } from "../config.js";

export async function loginCommand(login: string, password: string) {
  const config = readConfig();

  const res = await fetch(`${config.apiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password }),
  });

  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    console.error(`Login failed: ${err.error ?? res.statusText}`);
    process.exit(1);
  }

  const { token } = (await res.json()) as { token: string };
  writeConfig({ token });
  console.log("Logged in successfully.");
}
