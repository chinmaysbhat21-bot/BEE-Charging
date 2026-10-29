import { useEffect, useState } from 'react'

function Login({
    formData,
    onChange,
    onSubmit,
    onBack,
    loading = false,
    message = '',
    progressStep = 1,
}) {
    const [showMobile, setShowMobile] = useState(
        Boolean(formData.mobileNumber)
    )

    const [showEmail, setShowEmail] = useState(
        Boolean(formData.email)
    )

    useEffect(() => {
        if (formData.email) {
            setShowEmail(true)
        }

        if (formData.mobileNumber) {
            setShowMobile(true)
        }
    }, [formData.email, formData.mobileNumber])

    const email = (formData.email || '').trim()
    const mobileNumber = (formData.mobileNumber || '').trim()

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const mobileRegex = /^\d{10}$/

    const isEmailValid = emailRegex.test(email)
    const isMobileValid = mobileRegex.test(mobileNumber)

    const hasValidContact = isEmailValid || isMobileValid

    const handleSubmit = (event) => {
        event.preventDefault()

        if (loading || !hasValidContact) {
            return
        }

        onSubmit(event)
    }

    const handleRemoveEmail = () => {
        setShowEmail(false)

        onChange({
            target: {
                name: 'email',
                value: '',
            },
        })
    }

    const handleRemoveMobile = () => {
        setShowMobile(false)

        onChange({
            target: {
                name: 'mobileNumber',
                value: '',
            },
        })
    }

    return (
        <section className="signup-page">
            <section
                className="signup-card"
                aria-labelledby="login-page-title"
            >
                <div className="signup-brand-mark" aria-hidden="true">
                    EV
                </div>

                <p className="signup-eyebrow">
                    BEE CHARGING
                </p>

                <div className="signup-heading">
                    <h1 id="login-page-title">
                        {progressStep === 1
                            ? 'Welcome back'
                            : 'Verify your account'}
                    </h1>

                    <p>
                        Enter your registered email address, mobile number,
                        or both to log in.
                    </p>
                </div>

                <div
                    className="signup-progress"
                    aria-label={`Step ${progressStep} of 2`}
                >
                    <div className="signup-progress-track">
                        {['Contact details', 'Verify OTP'].map(
                            (label, index) => {
                                const stepNumber = index + 1
                                const isComplete =
                                    stepNumber < progressStep
                                const isCurrent =
                                    stepNumber === progressStep

                                return (
                                    <div
                                        className="signup-progress-item"
                                        key={label}
                                    >
                                        <div
                                            className={[
                                                'signup-progress-node',
                                                isComplete
                                                    ? 'is-complete'
                                                    : '',
                                                isCurrent
                                                    ? 'is-current'
                                                    : '',
                                            ]
                                                .filter(Boolean)
                                                .join(' ')}
                                        >
                                            {isComplete
                                                ? '✓'
                                                : stepNumber}
                                        </div>

                                        <span
                                            className={
                                                isCurrent
                                                    ? 'is-current-label'
                                                    : ''
                                            }
                                        >
                                            {label}
                                        </span>
                                    </div>
                                )
                            }
                        )}
                    </div>

                    <div className="signup-progress-bar">
                        <span
                            style={{
                                width:
                                    progressStep === 2 ? '100%' : '0%',
                            }}
                        />
                    </div>
                </div>

                {progressStep === 1 && (
                    <form
                        className="signup-form"
                        noValidate
                        onSubmit={handleSubmit}
                    >
                        <div className="signup-field">
                            {!showEmail && (
                                <button
                                    type="button"
                                    onClick={() => setShowEmail(true)}
                                >
                                    + Add email address
                                </button>
                            )}

                            {showEmail && (
                                <div className="signup-contact-row">
                                    <div className="signup-contact-input">
                                        <label htmlFor="login-email">
                                            Email address
                                        </label>

                                        <input
                                            id="login-email"
                                            type="email"
                                            name="email"
                                            placeholder="you@example.com"
                                            value={formData.email || ''}
                                            onChange={onChange}
                                            autoComplete="email"
                                        />
                                    </div>

                                    <button
                                        type="button"
                                        className="signup-remove-contact"
                                        aria-label="Remove email address"
                                        onClick={handleRemoveEmail}
                                    >
                                        🗑️
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="signup-field">
                            {!showMobile && (
                                <button
                                    type="button"
                                    onClick={() => setShowMobile(true)}
                                >
                                    + Add mobile number
                                </button>
                            )}

                            {showMobile && (
                                <div className="signup-contact-row">
                                    <div className="signup-contact-input">
                                        <label htmlFor="login-mobile">
                                            Mobile number
                                        </label>

                                        <input
                                            id="login-mobile"
                                            type="tel"
                                            name="mobileNumber"
                                            placeholder="10-digit mobile number"
                                            value={
                                                formData.mobileNumber || ''
                                            }
                                            onChange={onChange}
                                            maxLength={10}
                                            inputMode="numeric"
                                            autoComplete="tel"
                                        />
                                    </div>

                                    <button
                                        type="button"
                                        className="signup-remove-contact"
                                        aria-label="Remove mobile number"
                                        onClick={handleRemoveMobile}
                                    >
                                        🗑️
                                    </button>
                                </div>
                            )}
                        </div>

                        <p className="signup-form-hint">
                            Enter at least one valid email address or
                            10-digit mobile number.
                        </p>

                        {message && (
                            <p
                                className="signup-message"
                                role="alert"
                            >
                                {message}
                            </p>
                        )}

                        <button
                            type="submit"
                            className="signup-button signup-button-primary signup-submit"
                            disabled={loading || !hasValidContact}
                        >
                            {loading
                                ? 'Checking details...'
                                : 'Send OTP'}
                        </button>

                        <button
                            type="button"
                            onClick={onBack}
                            disabled={loading}
                            className="signup-back-link"
                        >
                            ← Back to Home
                        </button>
                    </form>
                )}

                {progressStep === 2 && (
                    <div className="signup-form">
                        {message && (
                            <p
                                className="signup-message"
                                role="status"
                            >
                                {message}
                            </p>
                        )}
                    </div>
                )}
            </section>
        </section>
    )
}

export default Login