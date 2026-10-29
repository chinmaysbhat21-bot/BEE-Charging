import { useEffect,useState } from 'react'
import './App.css'

function App() {
const [page, setPage] = useState('home')
const [step, setStep] = useState(1)

  const [formData, setFormData] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    mobileNumber: '',
  })

  const [otp, setOtp] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [signupComplete, setSignupComplete] = useState(false)

const [loginMobileNumber, setLoginMobileNumber] = useState('')
const [loginOtp, setLoginOtp] = useState('')
const [loginStep, setLoginStep] = useState(1)
const [loginComplete, setLoginComplete] = useState(false)
const [loggedInConsumer, setLoggedInConsumer] = useState(null)
useEffect(() => {
  const checkSession = async () => {
    try {
      const response = await fetch(
        'http://localhost:5001/api/consumer/auth/me',
        {
          credentials: 'include',
        }
      )

      if (response.ok) {
        const data = await response.json()
        setLoggedInConsumer(data.consumer)
        setLoginComplete(true)
      }
    } catch (error) {
      console.error('Session check failed:', error)
    }
  }

  checkSession()
}, [])

  const handleChange = (event) => {
    const { name, value } = event.target

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }))
  }

  const requestOtp = async (event) => {
    event.preventDefault()

    setMessage('')

    if (!/^\d{10}$/.test(formData.mobileNumber)) {
      setMessage('Mobile number must contain exactly 10 digits')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(
        'http://localhost:5001/api/consumer/auth/signup/request-otp',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        setMessage(data.message || 'Could not send OTP')
        return
      }

      setStep(2)
      setMessage('OTP sent successfully')
    } catch (error) {
      console.error(error)
      setMessage('Could not connect to backend')
    } finally {
      setLoading(false)
    }
  }
  const requestLoginOtp = async (event) => {
  event.preventDefault()

  setMessage('')

  if (!/^\d{10}$/.test(loginMobileNumber)) {
    setMessage('Mobile number must contain exactly 10 digits')
    return
  }

  setLoading(true)

  try {
    const response = await fetch(
      'http://localhost:5001/api/consumer/auth/login/request-otp',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          mobileNumber: loginMobileNumber,
        }),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      setMessage(data.message || 'Could not send login OTP')
      return
    }

    setLoginStep(2)
    setMessage('Login OTP sent successfully')
  } catch (error) {
    console.error(error)
    setMessage('Could not connect to backend')
  } finally {
    setLoading(false)
  }
}
const verifyLoginOtp = async (event) => {
  event.preventDefault()

  setMessage('')

  if (!/^\d{6}$/.test(loginOtp)) {
    setMessage('OTP must contain exactly 6 digits')
    return
  }

  setLoading(true)

  try {
    const response = await fetch(
      'http://localhost:5001/api/consumer/auth/login/verify-otp',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          mobileNumber: loginMobileNumber,
          otp: loginOtp,
        }),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      setMessage(data.message || 'Login OTP verification failed')
      return
    }

    setLoggedInConsumer(data.consumer)
    setLoginComplete(true)
    setMessage('Login successful')
  } catch (error) {
    console.error(error)
    setMessage('Could not connect to backend')
  } finally {
    setLoading(false)
  }
}

  const verifyOtp = async (event) => {
    event.preventDefault()

    setMessage('')

    if (!/^\d{6}$/.test(otp)) {
      setMessage('OTP must contain exactly 6 digits')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(
        'http://localhost:5001/api/consumer/auth/signup/verify-otp',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mobileNumber: formData.mobileNumber,
            otp,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        setMessage(data.message || 'OTP verification failed')
        return
      }

      setSignupComplete(true)
      setMessage('Signup successful! Consumer account created.')
    } catch (error) {
      console.error(error)
      setMessage('Could not connect to backend')
    } finally {
      setLoading(false)
    }
  }
  const logout = async () => {
  setMessage('')

  try {
    const response = await fetch(
      'http://localhost:5001/api/consumer/auth/logout',
      {
        method: 'POST',
        credentials: 'include',
      }
    )

    const data = await response.json()

    if (!response.ok) {
      setMessage(data.message || 'Could not log out')
      return
    }

    setLoginComplete(false)
    setPage('home')
    setLoginStep(1)
    setLoginMobileNumber('')
    setLoginOtp('')
    setMessage('')
  } catch (error) {
    console.error(error)
    setMessage('Could not connect to backend')
  }
}

  if (loginComplete) {
  return (
    <div className="app">
      <div className="card">
        <h1>Community EV Charging</h1>

        <h2>Welcome, {loggedInConsumer?.firstName}</h2>

        <p className="subtitle">
          You are logged in to your consumer account.
        </p>

        <p>
          Mobile Number: {loggedInConsumer?.mobileNumber || loginMobileNumber}
        </p>

        <p>
          Email: {loggedInConsumer?.email}
        </p>

        <button
          className="button button-primary"
          onClick={logout}
        >
          Logout
        </button>
      </div>
    </div>
  )
}

if (page === 'home') {
  return (
    <div className="app">
      <div className="card">
        <h1>Community EV Charging</h1>

        <p className="subtitle">
          Charge your EV. Connect with your community.
        </p>

        <h2>Welcome</h2>

        <button
          className="button button-primary"
          onClick={() => {
            setPage('login')
            setMessage('')
          }}
        >
          Login
        </button>

        <button
          className="button button-secondary"
          onClick={() => {
            setPage('signup')
            setStep(1)
            setMessage('')
          }}
        >
          Sign Up
        </button>
      </div>
    </div>
  )
}

  if (signupComplete) {
    return (
      <div>
        <h1>Community EV Charging</h1>

        <h2>Signup Successful</h2>

        <p>Your consumer account has been created successfully.</p>

        <p>
          Welcome, {formData.firstName} {formData.lastName}.
        </p>
      </div>
    )
  }
  if (page === 'login') {
  return (
    <div className="app">
      <div className="card">
        <h1>Community EV Charging</h1>

        <h2>Login</h2>

        <p className="subtitle">
          Enter your mobile number to continue.
        </p>

        {loginStep === 1 && (
          <form onSubmit={requestLoginOtp}>
            <div className="form-group">
              <label htmlFor="loginMobileNumber">
                Mobile Number
              </label>

              <input
                id="loginMobileNumber"
                type="tel"
                placeholder="10-digit Mobile Number"
                value={loginMobileNumber}
                onChange={(event) => {
                  setLoginMobileNumber(event.target.value)
                  setMessage('')
                }}
                maxLength="10"
                required
              />
            </div>

            <button
              type="submit"
              className="button button-primary"
              disabled={loading}
            >
              {loading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        )}

        {loginStep === 2 && (
          <form onSubmit={verifyLoginOtp}>
            <div className="form-group">
              <label htmlFor="loginOtp">
                Enter OTP
              </label>

              <input
                id="loginOtp"
                type="text"
                inputMode="numeric"
                placeholder="Enter 6-digit OTP"
                value={loginOtp}
                onChange={(event) => {
                  setLoginOtp(event.target.value)
                  setMessage('')
                }}
                maxLength="6"
                required
              />
            </div>

            <button
              type="submit"
              className="button button-primary"
              disabled={loading}
            >
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>

            <button
              type="button"
              className="back-button"
              onClick={() => {
                setLoginStep(1)
                setLoginOtp('')
                setMessage('')
              }}
            >
              Back
            </button>
          </form>
        )}

        {message && <p className="message">{message}</p>}

        <button
          type="button"
          className="back-button"
          onClick={() => {
            setPage('home')
            setLoginStep(1)
            setLoginMobileNumber('')
            setLoginOtp('')
            setMessage('')
          }}
        >
          Back to Home
        </button>
      </div>
    </div>
  )
}

    if (page === 'signup') {
    return (
      <div className="app">
        <div className="card">
          <h1>Community EV Charging</h1>

          {step === 1 && (
            <>
              <h2>Create Consumer Account</h2>

              <p className="subtitle">
                Enter your details to create your account.
              </p>

              <form onSubmit={requestOtp}>
                <div className="form-group">
                  <label htmlFor="firstName">
                    First Name
                  </label>

                  <input
                    id="firstName"
                    type="text"
                    name="firstName"
                    placeholder="First Name"
                    value={formData.firstName}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="middleName">
                    Middle Name
                  </label>

                  <input
                    id="middleName"
                    type="text"
                    name="middleName"
                    placeholder="Middle Name"
                    value={formData.middleName}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="lastName">
                    Last Name
                  </label>

                  <input
                    id="lastName"
                    type="text"
                    name="lastName"
                    placeholder="Last Name"
                    value={formData.lastName}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email">
                    Email
                  </label>

                  <input
                    id="email"
                    type="email"
                    name="email"
                    placeholder="Email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="mobileNumber">
                    Mobile Number
                  </label>

                  <input
                    id="mobileNumber"
                    type="tel"
                    name="mobileNumber"
                    placeholder="10-digit Mobile Number"
                    value={formData.mobileNumber}
                    onChange={handleChange}
                    maxLength="10"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="button button-primary"
                  disabled={loading}
                >
                  {loading ? 'Sending OTP...' : 'Send OTP'}
                </button>
              </form>
            </>
          )}

          {step === 2 && (
            <>
              <h2>Verify Mobile Number</h2>

              <p className="subtitle">
                OTP sent to {formData.mobileNumber}
              </p>

              <form onSubmit={verifyOtp}>
                <div className="form-group">
                  <label htmlFor="signupOtp">
                    Enter OTP
                  </label>

                  <input
                    id="signupOtp"
                    type="text"
                    inputMode="numeric"
                    placeholder="Enter 6-digit OTP"
                    value={otp}
                    onChange={(event) => {
                      setOtp(event.target.value)
                      setMessage('')
                    }}
                    maxLength="6"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="button button-primary"
                  disabled={loading}
                >
                  {loading ? 'Verifying...' : 'Verify OTP'}
                </button>

                <button
                  type="button"
                  className="back-button"
                  onClick={() => {
                    setStep(1)
                    setOtp('')
                    setMessage('')
                  }}
                >
                  Back
                </button>
              </form>
            </>
          )}

          {message && <p className="message">{message}</p>}

          <button
            type="button"
            className="back-button"
            onClick={() => {
              setPage('home')
              setStep(1)
              setOtp('')
              setMessage('')
            }}
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }


      {step === 2 && (
        <form onSubmit={verifyOtp}>
          <h2>Verify Mobile Number</h2>

          <p>
            OTP sent to: {formData.mobileNumber}
          </p>

          <input
            type="text"
            inputMode="numeric"
            placeholder="Enter 6-digit OTP"
            value={otp}
            onChange={(event) => setOtp(event.target.value)}
            maxLength="6"
            required
          />

          <br />
          <br />

          <button type="submit" disabled={loading}>
            {loading ? 'Verifying...' : 'Verify OTP'}
          </button>

          <br />
          <br />

          <button
            type="button"
            onClick={() => {
              setStep(1)
              setOtp('')
              setMessage('')
            }}
          >
            Back
          </button>
        </form>
      )
    }


}

export default App