"use client";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; form?: FormData; timeoutMs?: number } = {}
): Promise<T> {
  const init: RequestInit = { method: opts.method || (opts.body || opts.form ? "POST" : "GET") };
  if (opts.form) {
    init.body = opts.form;
  } else if (opts.body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(opts.body);
  }
  // İstek asla sonsuza kadar askıda kalmasın: taşınabilir timeout (AbortSignal.timeout
  // tüm modern tarayıcılarda desteklenir). Süre dolarsa TimeoutError fırlar → çağıran
  // taraf bunu ağ hatası olarak görür.
  if (opts.timeoutMs) init.signal = AbortSignal.timeout(opts.timeoutMs);
  const res = await fetch(path, init);
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const code = (data as { error?: string })?.error || `HTTP_${res.status}`;
    throw new ApiError(code, res.status);
  }
  return data as T;
}
