import { openProfile } from "../browser/session.js";
import { validateHttpUrl } from "../utils/http-url.js";

/** Open a read-only, headed profile session until interrupted. */
export async function browseProfileCommand(name: string, rawUrl: string): Promise<void> {
  const url = validateHttpUrl(rawUrl);
  const session = await openProfile(name, { headless: false });
  let stop!: () => void;
  const untilStopped = new Promise<void>((resolve) => {
    stop = resolve;
  });
  const onSignal = () => stop();

  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  session.browser.once("disconnected", stop);

  try {
    const page = await session.context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    console.log(`Opened ${page.url()}. Press Ctrl-C to close this browser session.`);
    await untilStopped;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    session.browser.off("disconnected", stop);
    await session.close();
  }
}
