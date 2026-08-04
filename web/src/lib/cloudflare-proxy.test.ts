import { afterEach, describe, expect, it, vi } from "vitest";

import { handleApiRequest } from "../../functions/api/[[path]]";

const env = {
  HERMES_ORIGIN: "https://hermes-origin.example",
  HERMES_SESSION_TOKEN: "server-hermes-token",
  CF_ACCESS_CLIENT_ID: "client-id",
  CF_ACCESS_CLIENT_SECRET: "client-secret",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Cloudflare read-only API proxy", () => {
  it("forwards an allowlisted GET with server-side credentials", async () => {
    const upstream = vi.fn(async (request: Request) => {
      expect(request).toBeInstanceOf(Request);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json", "set-cookie": "private=1" },
      });
    });
    const request = new Request(
      "https://hermes-knowledge.pages.dev/api/knowledge/graph?source=obsidian",
      {
        headers: {
          authorization: "browser-secret",
          cookie: "session=private",
          "x-hermes-session-token": "browser-hermes-token",
        },
      },
    );

    const response = await handleApiRequest(request, env, upstream);
    const forwarded = upstream.mock.calls[0]?.[0];

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(forwarded?.url).toBe(
      "https://hermes-origin.example/api/knowledge/graph?source=obsidian",
    );
    expect(forwarded?.headers.get("authorization")).toBeNull();
    expect(forwarded?.headers.get("cookie")).toBeNull();
    expect(forwarded?.headers.get("X-Hermes-Session-Token")).toBe("server-hermes-token");
    expect(forwarded?.headers.get("CF-Access-Client-Id")).toBe("client-id");
    expect(forwarded?.headers.get("CF-Access-Client-Secret")).toBe("client-secret");
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "rejects %s before contacting the origin",
    async (method) => {
      const upstream = vi.fn();
      const request = new Request("https://example.com/api/knowledge/graph", { method });

      const response = await handleApiRequest(request, env, upstream);

      expect(response.status).toBe(405);
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  it("rejects non-allowlisted API paths", async () => {
    const upstream = vi.fn();
    const response = await handleApiRequest(
      new Request("https://example.com/api/config"),
      env,
      upstream,
    );

    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects WebSocket upgrades because no read endpoint supports them", async () => {
    const upstream = vi.fn();
    const response = await handleApiRequest(
      new Request("https://example.com/api/status", { headers: { upgrade: "websocket" } }),
      env,
      upstream,
    );

    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("sanitizes origin failures", async () => {
    const upstream = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.8:9119");
    });

    const response = await handleApiRequest(
      new Request("https://example.com/api/status"),
      env,
      upstream,
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "upstream_unavailable" });
  });

  it("returns a sanitized timeout response", async () => {
    vi.useFakeTimers();
    const upstream = vi.fn(
      (request: Request) =>
        new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener("abort", () =>
            reject(new DOMException("origin details", "AbortError")),
          );
        }),
    );
    const responsePromise = handleApiRequest(
      new Request("https://example.com/api/plugins/kanban/board"),
      env,
      upstream,
    );

    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "upstream_timeout" });
    vi.useRealTimers();
  });
});
