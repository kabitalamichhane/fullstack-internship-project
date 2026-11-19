const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

function token() {
  return localStorage.getItem('token');
}

/** Small fetch wrapper: adds the JWT, handles JSON and FormData, turns errors into readable messages. */
export async function api<T = any>(path: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const t = token();
  if (t) headers.set('Authorization', `Bearer ${t}`);
  let body = options.body;
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.json);
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers, body });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 401 && t) {
    localStorage.removeItem('token');
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : undefined;
  if (!res.ok) {
    const details = data?.details;
    const firstField = details && typeof details === 'object' ? Object.entries(details)[0] : undefined;
    const msg = firstField ? `${data.error}: ${firstField[0]} – ${(firstField[1] as string[])[0]}` : data?.error;
    throw new ApiError(res.status, msg ?? `Request failed (${res.status})`, details);
  }
  return data as T;
}

/** Download a protected file (e.g. PDF invoice) using the JWT. */
export async function downloadFile(path: string, filename: string) {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!res.ok) throw new ApiError(res.status, 'Download failed');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
