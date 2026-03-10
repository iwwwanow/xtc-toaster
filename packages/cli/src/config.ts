import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".config", "xtc-toaster");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface Config {
  apiUrl: string;
  token?: string;
}

const DEFAULTS: Config = {
  apiUrl: process.env["XTC_API_URL"] ?? "http://localhost:3000",
};

export function readConfig(): Config {
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Config>) };
  } catch {
    return DEFAULTS;
  }
}

export function writeConfig(config: Partial<Config>): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const current = readConfig();
  writeFileSync(CONFIG_FILE, JSON.stringify({ ...current, ...config }, null, 2));
}
