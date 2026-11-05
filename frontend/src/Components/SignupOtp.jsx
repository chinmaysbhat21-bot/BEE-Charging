function SignupOtp({
  otp,
  onChange,
  onSubmit,
  loading,
  timeLeft,
  expired,
}) {
  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60

  return (
    <form className="signup-form signup-otp-form" onSubmit={onSubmit}>
      <p className={`signup-countdown ${expired ? 'is-expired' : ''}`} role="timer" aria-live="off">
        {expired
          ? 'OTP expired. Go back to request a new OTP.'
          : `OTP expires in ${String(minutes).padStart(2, '0')}:${String(
            seconds
          ).padStart(2, '0')}`}
      </p>

      <div className="signup-field">
        <label htmlFor="signup-otp">6-digit verification code</label>

        <input
          id="signup-otp"
          name="otp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          value={otp}
          onChange={onChange}
          maxLength={6}
          className="signup-otp-input"
          placeholder="Enter the 6-digit code"
          required
          disabled={loading || expired}
        />
      </div>

      <button
        type="submit"
        className="signup-button signup-button-primary signup-submit"
        disabled={loading || expired || otp.length !== 6}
      >
        {loading ? 'Verifying...' : 'Verify OTP'}
      </button>
    </form>
  )
}

export default SignupOtp