#!/usr/bin/env node

import { Command } from "commander";
import { initializeVault } from "./commands/init.command.js";
import { createProfileCommand } from "./commands/profile-create.command.js";
import { deleteProfileCommand } from "./commands/profile-delete.command.js";
import { listProfilesCommand } from "./commands/profile-list.command.js";
import { profileLoginCommand } from "./commands/profile-login.command.js";
import { profileStatusCommand } from "./commands/profile-status.command.js";
import { profileVerifyCommand } from "./commands/profile-verify.command.js";
import { runProfileCommand } from "./commands/run.command.js";
import { closeDockerBrowserCommand, openProfileInDockerCommand } from "./commands/open.command.js";
import { browseProfileCommand } from "./commands/browse.command.js";
import { VaultError } from "./utils/errors.js";

const program = new Command();
program.enablePositionalOptions();

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
  .command("login <name>")
  .description("Interactively log in and save browser authentication state")
  .option("--reuse-state", "Seed the login browser from existing storage state")
  .option("--headless", "Run Chromium headlessly")
  .action((name: string, options) => profileLoginCommand(name, options));
profile.command("verify <name>").description("Verify profile authentication").action((name: string) => profileVerifyCommand(name));
profile
  .command("delete <name>")
  .description("Delete a profile and its saved authentication data")
  .option("--yes", "Confirm deletion without prompting")
  .action((name: string, options) => deleteProfileCommand(name, options));

program
  .command("run <name> [command...]")
  .description("Run a command with a profile's storage state")
  .allowExcessArguments()
  .passThroughOptions()
  .action((name: string, command: string[]) => runProfileCommand(name, command));

program
  .command("open <name> <url>")
  .description("Open a URL with a profile in local Docker/noVNC")
  .action((name: string, url: string) => openProfileInDockerCommand(name, url));

program
  .command("browse <name> <url>")
  .description("Open a URL with a headed profile session")
  .action((name: string, url: string) => browseProfileCommand(name, url));

program.command("close").description("Stop the Docker/noVNC browser service").action(() => closeDockerBrowserCommand());

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = error instanceof VaultError ? error.exitCode : 1;
});
