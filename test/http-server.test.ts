import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { ObservabilityHttpServer } from "../src/main/http/observability-http-server";
import { ObservabilityStore } from "../src/main/runtime/observability-store";

describe("observability http server", () => {
  it("falls back to an ephemeral port when the preferred port is occupied", async () => {
    const occupied = createServer();
    const preferredPort = await new Promise<number>((resolve, reject) => {
      occupied.listen(0, () => {
        const address = occupied.address();
        if (typeof address === "object" && address) {
          resolve(address.port);
          return;
        }
        reject(new Error("no occupied port"));
      });
    });

    const server = new ObservabilityHttpServer(new ObservabilityStore(), {
      refreshNow: async () => undefined,
      getIssueDetails: async () => null,
    } as never);

    const actualPort = await server.start(preferredPort);
    expect(actualPort).not.toBe(preferredPort);

    server.stop();
    occupied.close();
  });
});
