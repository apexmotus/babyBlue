import { MESSAGES } from "./messages";

export interface ProblemDetailsPayload {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  request_id?: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  readonly detail?: string;

  constructor(payload: ProblemDetailsPayload, fallbackStatus = 500) {
    const code = payload.code ?? payload.title ?? "internal_error";
    const status = payload.status ?? fallbackStatus;
    const friendly = MESSAGES[code] ?? payload.detail ?? code;
    super(friendly);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.requestId = payload.request_id;
    this.detail = payload.detail;
  }
}

export interface ApiCallInit extends RequestInit {
  token?: string | null;
  tenantHost?: string | null;
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
}

export function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
}

export function hasRemoteApi(): boolean {
  return getApiBaseUrl().length > 0;
}

export async function call<T>(path: string, init: ApiCallInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new ApiError({ code: "api_not_configured", status: 500 }, 500);
  }

  const { token, tenantHost, headers: extraHeaders, cache, next, body, ...rest } = init;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const headers: Record<string, string> = {};
  if (!isFormData && body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (token) {
    headers["authorization"] = `Bearer ${token}`;
  }
  if (tenantHost) {
    headers["x-tenant-host"] = tenantHost;
  } else if (typeof window !== "undefined" && window.location?.host) {
    headers["x-tenant-host"] = window.location.host;
  }

  if (extraHeaders) {
    const normalized = new Headers(extraHeaders);
    normalized.forEach((value, key) => {
      headers[key] = value;
    });
  }

  const fetchInit: RequestInit & { next?: ApiCallInit["next"] } = {
    ...rest,
    body,
    headers,
  };

  if (next && !token) {
    fetchInit.next = next;
  } else {
    fetchInit.cache = cache ?? "no-store";
  }

  const res = await fetch(`${baseUrl}${path}`, fetchInit);
  if (!res.ok) {
    let payload: ProblemDetailsPayload = { status: res.status };
    try {
      payload = (await res.json()) as ProblemDetailsPayload;
    } catch {
      payload = { status: res.status, code: res.status === 401 ? "not_authenticated" : "internal_error" };
    }
    throw new ApiError(payload, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}
