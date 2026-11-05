import { useState } from 'react'

function SignupDetails({ formData, onChange, onSubmit, loading }) {
    const [showMobile, setShowMobile] = useState(!!formData.mobileNumber)
    const [showEmail, setShowEmail] = useState(!!formData.email)

    const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const mobileRegex = /^\d{10}$/

    const firstName = (formData.firstName || '').trim()
    const middleName = (formData.middleName || '').trim()
    const lastName = (formData.lastName || '').trim()
    const email = (formData.email || '').trim()
    const mobileNumber = (formData.mobileNumber || '').trim()

    const isFirstNameValid =
        firstName.length > 0 && nameRegex.test(firstName)

    const isMiddleNameValid =
        middleName.length === 0 || nameRegex.test(middleName)

    const isLastNameValid =
        lastName.length > 0 && nameRegex.test(lastName)

    const isEmailValid = emailRegex.test(email)
    const isMobileValid = mobileRegex.test(mobileNumber)

    const hasValidContact = isEmailValid || isMobileValid

    const isFormValid =
        isFirstNameValid &&
        isMiddleNameValid &&
        isLastNameValid &&
        hasValidContact

    const handleSubmit = (event) => {
        event.preventDefault()

        if (loading || !isFormValid) {
            return
        }

        onSubmit(event)
    }

    return (
        <form className="signup-form" noValidate onSubmit={handleSubmit}>
            <div className="signup-field">
                <label htmlFor="signup-first-name">First name <span>*</span></label>
                <input
                    id="signup-first-name"
                    type="text"
                    name="firstName"
                    placeholder="Enter your first name"
                    pattern="[A-Za-zÀ-ÖØ-öø-ÿ' -]+"
                    value={formData.firstName}
                    onChange={onChange}
                    required
                />
            </div>

            <div className="signup-field">
                <label htmlFor="signup-middle-name">Middle name <span className="signup-optional">(optional)</span></label>
                <input
                    id="signup-middle-name"
                    type="text"
                    name="middleName"
                    placeholder="Enter your middle name"
                    pattern="[A-Za-zÀ-ÖØ-öø-ÿ' -]+"
                    value={formData.middleName}
                    onChange={onChange}
                />
            </div>

            <div className="signup-field">
                <label htmlFor="signup-last-name">Last name <span>*</span></label>
                <input
                    id="signup-last-name"
                    type="text"
                    name="lastName"
                    placeholder="Enter your last name"
                    pattern="[A-Za-zÀ-ÖØ-öø-ÿ' -]+"
                    value={formData.lastName}
                    onChange={onChange}
                    required
                />
            </div>

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
                            <label htmlFor="signup-email">Email address <span className="signup-optional">(optional)</span></label>

                            <input
                                id="signup-email"
                                type="email"
                                name="email"
                                placeholder="you@example.com"
                                value={formData.email}
                                onChange={onChange}
                            />

                        </div>
                        <button
                            type="button"
                            className="signup-remove-contact"
                            aria-label="Remove email address"
                            onClick={() => {
                                setShowEmail(false)
                                onChange({
                                    target: {
                                        name: 'email',
                                        value: '',
                                    },
                                })
                            }}
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
                            <label htmlFor="signup-mobile">Mobile number <span className="signup-optional">(optional)</span></label>

                            <input
                                id="signup-mobile"
                                type="tel"
                                name="mobileNumber"
                                placeholder="10-digit mobile number"
                                value={formData.mobileNumber}
                                onChange={onChange}
                                maxLength={10}
                                inputMode="numeric"
                            />

                        </div>
                        <button
                            type="button"
                            className="signup-remove-contact"
                            aria-label="Remove mobile number"
                            onClick={() => {
                                setShowMobile(false)
                                onChange({
                                    target: {
                                        name: 'mobileNumber',
                                        value: '',
                                    },
                                })
                            }}
                        >
                            🗑️
                        </button>
                    </div>
                )}
            </div>

            <p className="signup-form-hint">Add at least one valid contact method. Fields marked * are required.</p>
            <button
                type="submit"
                className="signup-button signup-button-primary signup-submit"
                disabled={loading || !isFormValid}
            >
                {loading ? 'Checking details...' : 'Continue'}
            </button>
        </form>
    )
}

export default SignupDetails