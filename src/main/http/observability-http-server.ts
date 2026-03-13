import express from "express";
import type { Server } from "node:http";
import type { ObservabilityStore } from "../runtime/observability-store";
import type { Orchestrator } from "../runtime/orchestrator";

export class ObservabilityHttpServer {
  private server: Server | null = null;

  constructor(
    private store: ObservabilityStore,
    private orchestrator: Orchestrator,
  ) {}

  async start(preferredPort: number) {
    if (this.server) {
      return getListeningPort(this.server);
    }

    const app = express();
    app.get("/api/v1/state", (_request, response) => response.json(this.store.getSnapshot()));
    app.get("/api/v1/:identifier", async (request, response) =>
      response.json(await this.orchestrator.getIssueDetails(request.params.identifier)),
    );
    app.post("/api/v1/refresh", async (_request, response) => {
      await this.orchestrator.refreshNow();
      response.json({ ok: true });
    });

    this.server = await listenWithFallback(app, preferredPort);
    return getListeningPort(this.server);
  }

  stop() {
    this.server?.close();
    this.server = null;
  }
}

async function listenWithFallback(app: ReturnType<typeof express>, preferredPort: number) {
  try {
    return await listen(app, preferredPort);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EADDRINUSE") {
      throw error;
    }
    return listen(app, 0);
  }
}

function listen(app: ReturnType<typeof express>, port: number) {
  return new Promise<Server>((resolve, reject) => {
    const server = app.listen(port);
    server.once("listening", () => resolve(server));
    server.once("error", (error) => {
      server.close();
      reject(error);
    });
  });
}

function getListeningPort(server: Server) {
  const address = server.address();
  return typeof address === "object" && address ? address.port : null;
}
