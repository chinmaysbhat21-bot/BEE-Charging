const API_BASE_URL = '/api/consumer/auth'

async function postJson(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(body),
  })

  const data = await response.json()

  return {
    ok: response.ok,
    data,
  }
}

export async function requestSignupOtp(signupData) {
  return postJson('/signup/request-otp', signupData)
}

export async function verifySignupOtp(signupData) {
  return postJson('/signup/verify-otp', signupData)
}

export async function invalidateSignupOtp(contactData) {
  return postJson('/signup/invalidate-otp', contactData)
}

export async function requestLoginOtp(contactData) {
  return postJson('/login/request-otp', contactData)
}

export async function invalidateLoginOtp(contactData) {
  return postJson('/login/invalidate-otp', contactData)
}

export async function verifyLoginOtp(contactData) {
  return postJson('/login/verify-otp', contactData)
}