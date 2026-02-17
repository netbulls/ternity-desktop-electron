export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  _apiBaseUrl: string,
  envId: string,
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const result = await window.electronAPI.apiFetch(envId, path, options);

  if (result.error) {
    throw new ApiError(result.status, result.error);
  }

  return result.data as T;
}
