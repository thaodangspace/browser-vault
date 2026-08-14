import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { atomicWriteJson } from "../../src/utils/atomic-write.js";
import { removeDirRecursive } from "../../src/utils/filesystem.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "browser-vault-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(removeDirRecursive));
});

describe("atomicWriteJson", () => {
  it("leaves parseable JSON after concurrent writes and sets mode 0600", async () => {
    const directory = await temporaryDirectory();
    const target = path.join(directory, "state.json");

    await Promise.all(Array.from({ length: 20 }, (_, value) => atomicWriteJson(target, { value })));

    expect(JSON.parse(await readFile(target, "utf8"))).toHaveProperty("value");
    expect((await stat(target)).mode & 0o777).toBe(0o600);
  });

  it("keeps the original target and removes its temp file when replacement fails", async () => {
    const directory = await temporaryDirectory();
    const target = path.join(directory, "target");
    await mkdir(target);
    await writeFile(path.join(target, "original.txt"), "original");

    await expect(atomicWriteJson(target, { replacement: true })).rejects.toBeInstanceOf(Error);

    expect(await readFile(path.join(target, "original.txt"), "utf8")).toBe("original");
    expect((await readdir(directory)).filter((entry) => entry.startsWith("target.tmp-"))).toEqual([]);
  });
});
