import type { ReviewEvent } from "./types";

export function encodeSse(event: ReviewEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function readSse(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ReviewEvent) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk
        .split("\n")
        .filter((row) => row.startsWith("data:"))
        .map((row) => row.slice(5).trim())
        .join("\n");
      if (!line) continue;
      onEvent(JSON.parse(line) as ReviewEvent);
    }
  }
}

export function sseResponse(stream: AsyncIterable<ReviewEvent>, paceMs = 0) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (paceMs) await sleep(paceMs);
          controller.enqueue(encoder.encode(encodeSse(event)));
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            encodeSse({
              type: "error",
              message: error instanceof Error ? error.message : "Review failed",
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
