#!/usr/bin/env node

import { Command } from "commander";
import { initializeVault } from "./commands/init.command.js";
import { createProfileCommand } from "./commands/profile-create.command.js";
import { deleteProfileCommand } from "./commands/profile-delete.command.js";
import { listProfilesCommand } from "./commands/profile-list.command.js";
import { profileStatusCommand } from "./commands/profile-status.command.js";
import { VaultError } from "./utils/errors.js";

function notImplemented(command: string): never {
  throw new Error(`${command} is not implemented`);
}

const program = new Command();

program
  .name("bv")
  .description("Local-first browser authentication vault for Playwright agents")
  .version("0.1.0");

program.command("init").description("Initialize the vault").action(() => initializeVault());

const profile = program.command("profile").description("Manage authentication profiles");
profile.action(() => profile.help());

profile
  .command("create <name>")
  .description("Create a profile")
  .requiredOption("--start-url <url>", "URL to open for interactive login")
  .option("--mode <mode>", "Profile mode", "storage-state")
  .option("--verify-url <url>", "URL used to verify authentication")
  .option("--authenticated-selector <selector>", "Selector visible only while authenticated")
  .option("--unauthenticated-url-pattern <pattern>", "URL pattern indicating an unauthenticated session")
  .action((name: string, options) => createProfileCommand(name, options));

profile.command("list").description("List profiles").action(() => listProfilesCommand());
profile.command("status <name>").description("Show profile status").action((name: string) => profileStatusCommand(name));
profile
  .command("delete <name>")
  .description("Delete a profile and its saved authentication data")
  .option("--yes", "Confirm deletion without prompting")
  .action((name: string, options) => deleteProfileCommand(name, options));

program
  .command("run <name>")
  .description("Run a command with a profile's storage state")
  .allowUnknownOption()
  .action(() => notImplemented("bv run"));

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = error instanceof VaultError ? error.exitCode : 1;
});
