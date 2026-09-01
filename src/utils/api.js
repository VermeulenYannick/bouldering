/**
 * Send a JSON request to the application's backend API.
 * Credentials are included so HttpOnly session cookies are sent with every request.
 */
export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    credentials: 'include',
  });

  if (!response.ok) {
    let message = 'Request failed';
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      // Ignore non-JSON error responses and use the generic message.
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}
