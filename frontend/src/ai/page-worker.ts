/**
 * The page worker: a background worker with no screen that reads and
 * changes pages not open in the window, with the window's own page code.
 * It cannot touch the user's screen; a failure here fails one page.
 */
import { handleWork, type Work } from './page-work';

self.onmessage = async (event: MessageEvent<Work>) => {
  self.postMessage(await handleWork(event.data));
};
