import { chmod, mkdir, rename, unlink } from "node:fs/promises";
import { open } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** Atomically replaces targetPath with JSON encoded at mode 0600. */
export async function atomicWriteJson(targetPath: string, value: unknown): Promise<void> {
  const directory = path.dirname(targetPath);
  const temporaryPath = path.join(directory, `${path.basename(targetPath)}.tmp-${randomUUID()}`);

  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    const handle = await open(temporaryPath, "w", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
