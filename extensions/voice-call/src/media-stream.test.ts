import type { WebSocket } from "ws";
import { describe, expect, it, vi } from "vitest";
import type {
  OpenAIRealtimeSTTProvider,
  RealtimeSTTSession,
} from "./providers/stt-openai-realtime.js";
import { MediaStreamHandler } from "./media-stream.js";

const createStubSession = (): RealtimeSTTSession => ({
  connect: async () => {},
  sendAudio: () => {},
  waitForTranscript: async () => "",
  onPartial: () => {},
  onTranscript: () => {},
  onSpeechStart: () => {},
  close: () => {},
  isConnected: () => true,
});

const createStubSttProvider = (): OpenAIRealtimeSTTProvider =>
  ({
    createSession: () => createStubSession(),
  }) as unknown as OpenAIRealtimeSTTProvider;

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const waitForAbort = (signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener("abort", () => resolve(), { once: true });
  });

describe("MediaStreamHandler TTS queue", () => {
  it("serializes TTS playback and resolves in order", async () => {
    const handler = new MediaStreamHandler({
      sttProvider: createStubSttProvider(),
    });
    const started: number[] = [];
    const finished: number[] = [];

    let resolveFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const first = handler.queueTts("stream-1", async () => {
      started.push(1);
      await firstGate;
      finished.push(1);
    });
    const second = handler.queueTts("stream-1", async () => {
      started.push(2);
      finished.push(2);
    });

    await flush();
    expect(started).toEqual([1]);

    resolveFirst();
    await first;
    await second;

    expect(started).toEqual([1, 2]);
    expect(finished).toEqual([1, 2]);
  });

  it("cancels active playback and clears queued items", async () => {
    const handler = new MediaStreamHandler({
      sttProvider: createStubSttProvider(),
    });

    let queuedRan = false;
    const started: string[] = [];

    const active = handler.queueTts("stream-1", async (signal) => {
      started.push("active");
      await waitForAbort(signal);
    });
    void handler.queueTts("stream-1", async () => {
      queuedRan = true;
    });

    await flush();
    expect(started).toEqual(["active"]);

    handler.clearTtsQueue("stream-1");
    await active;
    await flush();

    expect(queuedRan).toBe(false);
  });

  it("reads Twilio stream auth token from start customParameters", async () => {
    let seenToken: string | undefined;
    const handler = new MediaStreamHandler({
      sttProvider: createStubSttProvider(),
      shouldAcceptStream: ({ token }) => {
        seenToken = token;
        return true;
      },
    });
    const ws = { close: vi.fn() } as unknown as WebSocket;
    const message = {
      event: "start",
      streamSid: "MZ123",
      start: {
        streamSid: "MZ123",
        accountSid: "AC123",
        callSid: "CA123",
        tracks: ["inbound"],
        mediaFormat: {
          encoding: "audio/x-mulaw",
          sampleRate: 8000,
          channels: 1,
        },
        customParameters: {
          auth_token: "token-from-custom-params",
        },
      },
    };

    const session = await (
      handler as unknown as {
        handleStart: (ws: WebSocket, message: unknown) => Promise<unknown>;
      }
    ).handleStart(ws, message);

    expect(session).toBeTruthy();
    expect(seenToken).toBe("token-from-custom-params");
  });
});
