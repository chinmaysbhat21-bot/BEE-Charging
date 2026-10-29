import { useEffect, useState } from 'react'
import SignupDetails from './SignupDetails'
import SignupOtp from './SignupOtp'
import {
    requestSignupOtp,
    verifySignupOtp,
    invalidateSignupOtp,
    requestLoginOtp,
} from '../services/authApi'

const OTP_VALIDITY_SECONDS = 5 * 60

const emptyForm = {
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    mobileNumber: '',
}

function Signup({
    onLogin,
    onBack,
    initialFormData,
    onFormDataChange,
}) {
    const [step, setStep] = useState(1)
    const [existingAccount, setExistingAccount] = useState(false)
    const [loginContact, setLoginContact] = useState('')
    const [loginContactType, setLoginContactType] = useState('')
    const [conflict, setConflict] = useState(false)

    const [formData, setFormData] = useState(() => ({
        ...emptyForm,
        ...initialFormData,
    }))

    const [otp, setOtp] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [otpExpiresAt, setOtpExpiresAt] = useState(null)
    const [timeLeft, setTimeLeft] = useState(OTP_VALIDITY_SECONDS)

    const expired =
        step === 2 &&
        (otpExpiresAt === null || Date.now() >= otpExpiresAt || timeLeft <= 0)

    useEffect(() => {
        if (step !== 2 || otpExpiresAt === null) return

        const updateCountdown = () => {
            const remaining = Math.max(
                0,
                Math.ceil((otpExpiresAt - Date.now()) / 1000)
            )

            setTimeLeft(remaining)

            if (remaining === 0) {
                setMessage('OTP has expired. Go back and request a new OTP.')
            }
        }

        updateCountdown()

        const timerId = setInterval(updateCountdown, 1000)

        return () => clearInterval(timerId)
    }, [step, otpExpiresAt])

    const updateFormData = (nextData) => {
        setFormData(nextData)
        onFormDataChange?.(nextData)
    }

    const clearAccountMessages = () => {
        setExistingAccount(false)
        setConflict(false)
        setLoginContact('')
        setLoginContactType('')
    }

    const handleChange = (event) => {
        const { name, value } = event.target

        const nextData = {
            ...formData,
            [name]: value,
        }

        updateFormData(nextData)
        setMessage('')
        clearAccountMessages()
    }

    const handleSubmit = async (event) => {
        event.preventDefault()

        setMessage('')
        clearAccountMessages()

        const namePattern = /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        const mobilePattern = /^\d{10}$/

        if (!namePattern.test(formData.firstName.trim())) {
            setMessage(
                'First name can contain only letters, spaces, apostrophes, and hyphens.'
            )
            return
        }

        if (
            formData.middleName.trim() &&
            !namePattern.test(formData.middleName.trim())
        ) {
            setMessage(
                'Middle name can contain only letters, spaces, apostrophes, and hyphens.'
            )
            return
        }

        if (!namePattern.test(formData.lastName.trim())) {
            setMessage(
                'Last name can contain only letters, spaces, apostrophes, and hyphens.'
            )
            return
        }

        const trimmedEmail = formData.email.trim()
        const trimmedMobile = formData.mobileNumber.trim()

        const validEmail =
            trimmedEmail !== '' && emailPattern.test(trimmedEmail)

        const validMobile =
            trimmedMobile !== '' && mobilePattern.test(trimmedMobile)

        if (!validEmail && !validMobile) {
            setMessage('Enter at least one valid email or mobile number.')
            return
        }

        const validatedFormData = {
            ...formData,
            firstName: formData.firstName.trim(),
            middleName: formData.middleName.trim(),
            lastName: formData.lastName.trim(),
            email: validEmail ? trimmedEmail.toLowerCase() : '',
            mobileNumber: validMobile ? trimmedMobile : '',
        }

        updateFormData(validatedFormData)
        setLoading(true)

        try {
            const result = await requestSignupOtp(validatedFormData)

            if (!result.ok) {
                if (result.data.code === 'CONTACT_CONFLICT') {
                    setConflict(true)
                    setMessage(
                        result.data.message ||
                        'These contact details belong to different accounts. They cannot be combined.'
                    )
                    return
                }

                if (result.data.code === 'ACCOUNT_EXISTS') {
                    setLoginContact(result.data.loginContact || '')
                    setLoginContactType(result.data.loginContactType || '')
                    setExistingAccount(true)
                    setMessage('')
                    return
                }

                setMessage(result.data.message || 'Could not send OTP.')
                return
            }

            const serverExpiry = Number(result.data.expiresAt)
            const expiry =
                Number.isFinite(serverExpiry) && serverExpiry > Date.now()
                    ? serverExpiry
                    : Date.now() + OTP_VALIDITY_SECONDS * 1000

            setOtp('')
            setOtpExpiresAt(expiry)
            setTimeLeft(Math.max(0, Math.ceil((expiry - Date.now()) / 1000)))
            setStep(2)
            setMessage('OTP sent successfully.')
        } catch (error) {
            console.error(error)
            setMessage('Could not connect to backend.')
        } finally {
            setLoading(false)
        }
    }

    const handleOtpSubmit = async (event) => {
        event.preventDefault()

        if (expired) {
            setMessage('OTP has expired. Go back and request a new OTP.')
            return
        }

        setMessage('')
        setLoading(true)

        try {
            const result = await verifySignupOtp({
                ...formData,
                otp,
            })

            if (!result.ok) {
                setMessage(
                    result.data.message || 'OTP verification failed.'
                )
                return
            }

            // The backend has already saved the authenticated session.
            // Let App move directly to the authenticated dashboard.
            updateFormData({ ...emptyForm })
            setOtp('')
            setOtpExpiresAt(null)
            setTimeLeft(0)
            onLogin?.(result.data.consumer, { signupSuccess: true })
        } catch (error) {
            console.error(error)
            setMessage('Could not connect to backend.')
        } finally {
            setLoading(false)
        }
    }

    const handleChangeOption = () => {
        clearAccountMessages()
        setMessage('')
    }

    const handleLoginOption = async () => {
        if (!loginContact || loading) return

        setLoading(true)
        setMessage('')

        try {
            const contactData = loginContactType === 'mobile'
                ? { mobileNumber: loginContact }
                : { email: loginContact.toLowerCase() }
            const result = await requestLoginOtp(contactData)

            if (!result.ok) {
                setMessage(result.data.message || 'Could not send login OTP.')
                return
            }

            const serverExpiry = Number(result.data.expiresAt)
            const expiresAt = Number.isFinite(serverExpiry) && serverExpiry > Date.now()
                ? serverExpiry
                : Date.now() + OTP_VALIDITY_SECONDS * 1000

            onLogin?.(loginContact, { expiresAt, loginStartedFromSignup: true })
        } catch (error) {
            console.error(error)
            setMessage('Could not connect to backend.')
        } finally {
            setLoading(false)
        }
    }

    const maskLoginContact = () => {
        if (!loginContact) return ''
        if (loginContactType === 'mobile') {
            return `******${loginContact.slice(-4)}`
        }
        const [localPart, domain] = loginContact.split('@')
        if (!domain) return 'your registered contact'
        const visible = localPart.slice(0, 1)
        return `${visible}${'*'.repeat(Math.max(2, localPart.length - 1))}@${domain}`
    }

    const handleBack = () => {
        if (loading) return

        setMessage('')
        clearAccountMessages()
        // Preserve the existing App-level navigation behavior.
        onBack?.()
    }

    const progressStep = step
    const progressTotal = 2
    const progressLabels = ['Contact details', 'Verify OTP']


    const handleBackToDetails = async () => {
        if (loading) return

        setLoading(true)
        setMessage('')

        try {
            const result = await invalidateSignupOtp({
                email: formData.email,
                mobileNumber: formData.mobileNumber,
            })

            if (!result.ok) {
                setMessage(
                    result.data.message ||
                    'Could not invalidate the OTP. Please try again.'
                )
                return
            }

            setStep(1)
            setOtp('')
            setOtpExpiresAt(null)
            setTimeLeft(OTP_VALIDITY_SECONDS)
            clearAccountMessages()
            setMessage('')
        } catch (error) {
            console.error(error)
            setMessage(
                'Could not connect to the backend to invalidate the OTP. Please try again.'
            )
        } finally {
            setLoading(false)
        }
    }


    return (
        <div className="signup-page">
            <section className="signup-card" aria-labelledby="signup-page-title">
                <div className="signup-brand-mark" aria-hidden="true">EV</div>
                <p className="signup-eyebrow">BEE CHARGING</p>

                <>
                    <div className="signup-heading">
                        <h1 id="signup-page-title">
                            {step === 1 ? 'Create your account' : 'Verify your account'}
                        </h1>
                        <p>
                            {step === 1
                                ? 'Enter your details to get started.'
                                : 'Enter the one-time password sent to your contact details.'}
                        </p>
                    </div>

                    <div
                        className="signup-progress"
                        aria-label={`Step ${progressStep} of ${progressTotal}`}
                    >
                        <div className="signup-progress-track" aria-hidden="true">
                            {progressLabels.map((label, index) => {
                                const number = index + 1
                                const completed = number < progressStep
                                const current = number === progressStep
                                return (
                                    <div className="signup-progress-item" key={label}>
                                        <div
                                            className={[
                                                'signup-progress-node',
                                                completed ? 'is-complete' : '',
                                                current ? 'is-current' : '',
                                            ].filter(Boolean).join(' ')}
                                        >
                                            {completed ? '✓' : number}
                                        </div>
                                        <span className={current ? 'is-current-label' : ''}>
                                            {label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                        <div className="signup-progress-bar">
                            <span style={{ width: `${((progressStep - 1) / (progressTotal - 1)) * 100}%` }} />
                        </div>
                    </div>

                    {step === 1 && (
                        <>
                            <SignupDetails
                                formData={formData}
                                onChange={handleChange}
                                onSubmit={handleSubmit}
                                loading={loading}
                            />

                            {existingAccount && (
                                <div className="signup-feedback signup-feedback-warning">
                                    <p>An account already exists. We can send a verification code to {maskLoginContact()}.</p>
                                    <div className="signup-feedback-actions">
                                        <button
                                            type="button"
                                            className="signup-button signup-button-secondary"
                                            onClick={handleChangeOption}
                                            disabled={loading}
                                        >
                                            Change details
                                        </button>
                                        <button
                                            type="button"
                                            className="signup-button signup-button-primary"
                                            onClick={handleLoginOption}
                                            disabled={!loginContact || loading}
                                        >
                                            {loading ? 'Sending OTP...' : 'Send OTP and Verify'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {conflict && (
                                <div className="signup-feedback signup-feedback-error" role="alert">
                                    <p>{message}</p>
                                    <button
                                        type="button"
                                        className="signup-button signup-button-secondary"
                                        onClick={handleChangeOption}
                                        disabled={loading}
                                    >
                                        Change details
                                    </button>
                                </div>
                            )}

                            {message && !conflict && (
                                <p className="signup-message" role="alert">{message}</p>
                            )}

                            <button
                                type="button"
                                onClick={handleBack}
                                disabled={loading}
                                className="signup-back-link"
                            >
                                ← Back
                            </button>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <SignupOtp
                                otp={otp}
                                onChange={(event) => {
                                    setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))
                                }}
                                onSubmit={handleOtpSubmit}
                                loading={loading}
                                timeLeft={timeLeft}
                                expired={expired}
                            />

                            {message && <p className="signup-message" role="status">{message}</p>}

                            <button
                                type="button"
                                onClick={handleBackToDetails}
                                disabled={loading}
                                className="signup-back-link"
                            >
                                {loading ? 'Please wait...' : '← Back to details'}
                            </button>
                        </>
                    )}
                </>
            </section>
        </div>
    )
}

export default Signup