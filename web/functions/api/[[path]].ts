interface ProxyEnv {
  HERMES_ORIGIN: string;
  HERMES_SESSION_TOKEN: string;
  CF_ACCESS_CLIENT_ID: string;
  CF_ACCESS_CLIENT_SECRET: string;
}

interface PagesContext {
  request: Request;
  env: ProxyEnv;
}

type Fetcher = (request: Request) => Promise<Response>;

const ALLOWED_PATHS = new Set([
  "/api/status",
  "/api/plugins/kanban/board",
  "/api/knowledge/graph",
]);
const REQUEST_HEADERS = ["accept", "accept-language", "if-modified-since", "if-none-match"];
const RESPONSE_HEADERS = ["cache-control", "content-language", "content-type", "etag", "last-modified"];
const UPSTREAM_TIMEOUT_MS = 8_000;

function jsonError(status: number, error: string, allow?: string): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  if (allow) headers.set("allow", allow);
  return new Response(JSON.stringify({ error }), { status, headers });
}

function resolveOrigin(value: string): URL | null {
  try {
    const origin = new URL(value);
    const isRoot = origin.pathname === "/" && !origin.search && !origin.hash;
    const hasCredentials = Boolean(origin.username || origin.password);
    return origin.protocol === "https:" && isRoot && !hasCredentials ? origin : null;
  } catch {
    return null;
  }
}

function copyAllowedHeaders(source: Headers, names: string[]): Headers {
  const headers = new Headers();
  for (const name of names) {
    const value = source.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}

function upstreamRequest(request: Request, env: ProxyEnv, origin: URL, signal: AbortSignal): Request {
  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, origin);
  const headers = copyAllowedHeaders(request.headers, REQUEST_HEADERS);
  headers.set("CF-Access-Client-Id", env.CF_ACCESS_CLIENT_ID);
  headers.set("CF-Access-Client-Secret", env.CF_ACCESS_CLIENT_SECRET);
  headers.set("X-Hermes-Session-Token", env.HERMES_SESSION_TOKEN);
  return new Request(target, { method: "GET", headers, redirect: "manual", signal });
}

function safeResponse(response: Response): Response {
  const headers = copyAllowedHeaders(response.headers, RESPONSE_HEADERS);
  headers.set("cache-control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function handleApiRequest(
  request: Request,
  env: ProxyEnv,
  fetcher: Fetcher = (upstream) => fetch(upstream),
): Promise<Response> {
  if (request.method !== "GET") return jsonError(405, "method_not_allowed", "GET");
  if (request.headers.has("upgrade")) return jsonError(400, "unsupported_upgrade");
  const incoming = new URL(request.url);
  if (!ALLOWED_PATHS.has(incoming.pathname)) return jsonError(404, "not_found");
  const origin = resolveOrigin(env.HERMES_ORIGIN);
  const credentials = [
    env.HERMES_SESSION_TOKEN,
    env.CF_ACCESS_CLIENT_ID,
    env.CF_ACCESS_CLIENT_SECRET,
  ];
  if (!origin || credentials.some((value) => !value)) {
    return jsonError(502, "proxy_not_configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetcher(upstreamRequest(request, env, origin, controller.signal));
    return safeResponse(response);
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return jsonError(timedOut ? 504 : 502, timedOut ? "upstream_timeout" : "upstream_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

export const onRequest = (context: PagesContext): Promise<Response> =>
  handleApiRequest(context.request, context.env);
