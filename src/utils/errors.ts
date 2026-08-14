export class VaultError extends Error {
  constructor(message: string, public readonly exitCode = 1, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ProfileNotFoundError extends VaultError {
  constructor(name: string) {
    super(`Profile "${name}" does not exist. Run: bv profile create ${name} --start-url <url>`);
  }
}

export class ProfileExistsError extends VaultError {
  constructor(name: string) {
    super(`Profile "${name}" already exists.`);
  }
}

export class InvalidProfileNameError extends VaultError {
  constructor(name: string) {
    super(`Invalid profile name "${name}". Names must match ^[a-z0-9][a-z0-9-_]{0,63}$.`);
  }
}

export class NoAuthStateError extends VaultError {
  constructor(name: string) {
    super(`Profile "${name}" has not been authenticated. Run: bv profile login ${name}`);
  }
}

export class InvalidMetadataError extends VaultError {
  constructor(filePath: string, options?: ErrorOptions) {
    super(`Profile metadata is invalid: ${filePath}`, 1, options);
  }
}

export class ProfileLockedError extends VaultError {
  constructor(name: string, options?: ErrorOptions) {
    super(`Profile "${name}" is already in use.`, 1, options);
  }
}

export class AuthExpiredError extends VaultError {
  constructor(name: string) {
    super(`Authentication for "${name}" appears expired. Run: bv profile login ${name}`, 2);
  }
}
