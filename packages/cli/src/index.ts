import { Command } from "commander";

const program = new Command();

program
  .name("toast")
  .description("xtc-toaster CLI — publish and manage toasts")
  .version("0.0.0");

// TODO: toast publish --name <name> [--description <desc>] --preview <gif>
// TODO: toast login  — store credentials locally
// TODO: toast list   — list published toasts

program.parse();
