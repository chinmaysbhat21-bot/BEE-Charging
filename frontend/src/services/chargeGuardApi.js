export async function chargeGuardRequest(path, body, signal) {
  const response = await fetch(`/api/chargeguard${path}`, {
    method: body ? 'POST' : 'GET', credentials: 'include', signal,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = response.ok ? await response.json() : await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(result.message || 'Unable to complete this request.'), { status: response.status })
  return result
}
