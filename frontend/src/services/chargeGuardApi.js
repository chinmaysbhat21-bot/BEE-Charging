export async function chargeGuardRequest(path, body, signal) {
  const response = await fetch(`/api/chargeguard${path}`, {
    method: body ? 'POST' : 'GET', credentials: 'include', signal,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || 'Unable to complete this request.')
  return result
}
