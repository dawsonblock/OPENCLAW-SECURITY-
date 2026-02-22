import chokidar, { FSWatcher } from "chokidar";
import * as fs from "fs";
import * as path from "path";
import { DiskQueue } from "../../persist/queue_disk.js";

/**
 * Background Folder Watcher.
 * Automatically enqueues tasks when files change in specific directories.
 * Part of the 'Passive Productivity' workflow feature.
 */
export class FsWatcher {
  private watcher: FSWatcher;

  constructor(
    private watchTarget: string,
    private queue: DiskQueue,
    private intentMapping: string,
  ) {
    console.log(`[FsWatcher] Initializing background watcher for: ${watchTarget}`);
    this.watcher = chokidar.watch(watchTarget, {
      ignored: /(^|[/\\])\../, // ignore dotfiles
      persistent: true,
    });

    this.watcher.on("add", (filePath: string) => this.handleEvent("add", filePath));
    this.watcher.on("change", (filePath: string) => this.handleEvent("change", filePath));
  }

  private handleEvent(event: "add" | "change", filePath: string) {
    console.log(`[FsWatcher] Detected '${event}' on ${filePath}. Enqueueing action.`);

    this.queue.enqueue(
      this.intentMapping,
      {
        event,
        file: filePath,
        timestamp: Date.now(),
      },
      "normal",
      false,
    );
  }

  public stop() {
    this.watcher.close();
  }
}
