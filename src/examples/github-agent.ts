import { openProfile } from "../index.js";

const profileName = process.argv[2] ?? process.env.BROWSER_VAULT_PROFILE ?? "github";
const session = await openProfile(profileName, { headless: process.env.BROWSER_VAULT_HEADLESS !== "0" });

try {
  const page = await session.context.newPage();
  await page.goto("https://github.com/", { waitUntil: "domcontentloaded" });
  console.log(await page.title());
} finally {
  await session.close();
}
