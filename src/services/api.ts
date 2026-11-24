// In-memory JWT storage prevents token persistence in localStorage/sessionStorage.
let inMemoryAccessToken: string | null = null;

const RAW_API_BASE_URL = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');

export function getApiBaseUrl(): string {
  return RAW_API_BASE_URL;
}

export function resolveAssetUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('/uploads/')) {
    return RAW_API_BASE_URL ? `${RAW_API_BASE_URL}${trimmed}` : trimmed;
  }
  if (trimmed.startsWith('/')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return trimmed;
    }
  } catch {
    // reject malformed or unsafe schemes (e.g. javascript:)
  }
  return '';
}

export function setAccessToken(token: string | null) {
  inMemoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'NexusSchoolOS');
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryAccessToken) {
    headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const requestUrl =
    path.startsWith('http://') || path.startsWith('https://')
      ? path
      : `${RAW_API_BASE_URL}${normalizedPath}`;

  const response = await fetch(requestUrl, {
    ...options,
    headers,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const fallbackMessage =
      response.status === 405 && !RAW_API_BASE_URL
        ? 'API backend URL is not configured (VITE_API_URL missing for external frontend hosting).'
        : `Request failed (${response.status})`;
    throw new ApiError(
      data?.error || fallbackMessage,
      response.status,
      data?.code
    );
  }

  if (data === null && normalizedPath.startsWith('/api/')) {
    throw new ApiError(
      'Invalid non-JSON response from API endpoint. Verify VITE_API_URL points to the backend server.',
      502,
      'API_UNREACHABLE'
    );
  }

  return data as T;
}
