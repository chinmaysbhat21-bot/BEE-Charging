
import express from 'express'
import otpStore, { generateOtp } from '../utils/otpStore.js'
import Consumer from '../models/consumer.js'

const router = express.Router()

const namePattern = /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const mobilePattern = /^\d{10}$/

// ============================================================
// SHARED HELPERS
// ============================================================

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase()
}

function requireConsumer(req, res, next) {
  if (!req.session?.consumerId) {
    return res.status(401).json({
      message: 'Please log in to access your profile',
    })
  }

  next()
}

function addressPayload(body = {}) {
  const nickname = normalizeString(body.nickname)
  const houseNumber = normalizeString(body.houseNumber)
  const street = normalizeString(body.street)
  const landmark = normalizeString(body.landmark)
  const city = normalizeString(body.city)
  const state = normalizeString(body.state)
  const pincode = normalizeString(body.pincode)

  return {
    nickname,
    houseNumber,
    street,
    landmark,
    city,
    state,
    pincode,
    fullAddress: [
      houseNumber,
      street,
      landmark,
      city,
      state,
      pincode,
    ].filter(Boolean).join(', '),
  }
}

function validateAddress(address) {
  if (
    !address.nickname ||
    !address.houseNumber ||
    !address.street ||
    !address.city ||
    !address.state ||
    !/^\d{6}$/.test(address.pincode)
  ) {
    return 'Enter the address name, house/flat, street, city, state and a valid 6-digit PIN code.'
  }

  return null
}

// ============================================================
// BATTERY HELPERS
// Supports new and legacy battery fields.
// ============================================================

function batteryPayload(body = {}) {
  const connectorInput = Array.isArray(body.connectorTypes)
    ? body.connectorTypes
    : body.connectorType
      ? [body.connectorType]
      : []

  const connectorTypes = [
    ...new Set(
      connectorInput
        .filter((value) => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ]

  const connectorType =
    normalizeString(body.connectorType) ||
    connectorTypes[0] ||
    ''

  const parseOptionalNumber = (value) => {
    if (value === undefined || value === null || value === '') {
      return undefined
    }

    return Number(value)
  }

  const maxAcChargingPowerKw = parseOptionalNumber(
    body.maxAcChargingPowerKw
  )

  const maxDcChargingPowerKw = parseOptionalNumber(
    body.maxDcChargingPowerKw
  )

  const suppliedLegacyPower = parseOptionalNumber(
    body.maxChargingPowerKw
  )

  // Retain the legacy field for compatibility.
  const maxChargingPowerKw =
    suppliedLegacyPower ??
    maxDcChargingPowerKw ??
    maxAcChargingPowerKw

  return {
    name: normalizeString(body.name),
    vehicleMake: normalizeString(body.vehicleMake),
    vehicleModel: normalizeString(body.vehicleModel),
    capacityKwh: parseOptionalNumber(body.capacityKwh) ?? NaN,
    batteryChemistry:
      normalizeString(body.batteryChemistry) || 'Other/Unknown',
    connectorTypes,
    connectorType,
    maxAcChargingPowerKw,
    maxDcChargingPowerKw,
    maxChargingPowerKw,
  }
}

function validateBattery(battery) {
  const allowedChemistries = [
    'LFP',
    'NMC',
    'Other/Unknown',
  ]

  const validPower = (value) =>
    value === undefined ||
    (Number.isFinite(value) && value > 0)

  const hasPower =
    battery.maxAcChargingPowerKw !== undefined ||
    battery.maxDcChargingPowerKw !== undefined ||
    battery.maxChargingPowerKw !== undefined

  if (
    !battery.name ||
    !battery.vehicleMake ||
    !battery.vehicleModel ||
    battery.connectorTypes.length === 0 ||
    !Number.isFinite(battery.capacityKwh) ||
    battery.capacityKwh <= 0 ||
    !allowedChemistries.includes(battery.batteryChemistry) ||
    !validPower(battery.maxAcChargingPowerKw) ||
    !validPower(battery.maxDcChargingPowerKw) ||
    !validPower(battery.maxChargingPowerKw) ||
    !hasPower
  ) {
    return 'Enter a name, vehicle make, model, valid battery capacity, at least one connector type, valid battery chemistry, and at least one valid AC/DC charging power value.'
  }

  return null
}

async function getSessionConsumer(req) {
  return Consumer.findById(req.session.consumerId)
}

// ============================================================
// SIGNUP - REQUEST OTP
// ============================================================

router.post('/signup/request-otp', async (req, res) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      email,
      mobileNumber,
    } = req.body

    if (
      !firstName ||
      !namePattern.test(firstName) ||
      !lastName ||
      !namePattern.test(lastName) ||
      (middleName && !namePattern.test(middleName))
    ) {
      return res.status(400).json({
        message:
          'Name can contain only letters, spaces, apostrophes, and hyphens',
      })
    }

    const normalizedEmail = email ? normalizeEmail(email) : ''
    const normalizedMobile = normalizeString(mobileNumber)

    if (!normalizedEmail && !normalizedMobile) {
      return res.status(400).json({
        message: 'At least one contact method is required',
      })
    }

    if (normalizedEmail && !emailPattern.test(normalizedEmail)) {
      return res.status(400).json({
        message: 'Please enter a valid email address',
      })
    }

    if (normalizedMobile && !mobilePattern.test(normalizedMobile)) {
      return res.status(400).json({
        message: 'Mobile number must contain exactly 10 digits',
      })
    }

    const existingByEmail = normalizedEmail
      ? await Consumer.findOne({ email: normalizedEmail })
      : null

    const existingByMobile = normalizedMobile
      ? await Consumer.findOne({ mobileNumber: normalizedMobile })
      : null

    if (
      existingByEmail &&
      existingByMobile &&
      existingByEmail._id.toString() !== existingByMobile._id.toString()
    ) {
      return res.status(409).json({
        code: 'CONTACT_CONFLICT',
        message:
          'The email and mobile number belong to different existing accounts. They cannot be combined into one account.',
      })
    }

    if (existingByEmail || existingByMobile) {
      const loginContactType = existingByMobile ? 'mobile' : 'email'
      const loginContact = existingByMobile
        ? existingByMobile.mobileNumber
        : existingByEmail.email

      return res.status(409).json({
        code: 'ACCOUNT_EXISTS',
        message:
          'An account already exists with the supplied contact information.',
        loginContactType,
        loginContact,
      })
    }

    const otp = generateOtp()
    const otpKey = normalizedMobile
      ? `signup:mobile:${normalizedMobile}`
      : `signup:email:${normalizedEmail}`

    const expiresAt = Date.now() + 5 * 60 * 1000

    otpStore.set(otpKey, {
      otp,
      firstName: firstName.trim(),
      middleName: middleName?.trim() || null,
      lastName: lastName.trim(),
      email: normalizedEmail || null,
      mobileNumber: normalizedMobile || null,
      otpDestination: normalizedMobile ? 'mobile' : 'email',
      expiresAt,
    })

    // Local development/testing only.
    console.log(
      `Signup OTP for ${normalizedMobile || normalizedEmail}: ${otp}`
    )

    return res.status(200).json({
      message: normalizedMobile
        ? 'OTP sent to mobile number'
        : 'OTP sent to email address',
      otpDestination: normalizedMobile ? 'mobile' : 'email',
      otp,
      expiresAt,
    })
  } catch (error) {
    console.error('Signup request OTP error:', error)

    return res.status(500).json({
      message: 'Could not process signup request',
    })
  }
})

// ============================================================
// SIGNUP - INVALIDATE OTP
// ============================================================

router.post('/signup/invalidate-otp', (req, res) => {
  try {
    const normalizedEmail = req.body.email
      ? normalizeEmail(req.body.email)
      : ''

    const normalizedMobile = normalizeString(req.body.mobileNumber)

    if (!normalizedEmail && !normalizedMobile) {
      return res.status(400).json({
        message: 'Email or mobile number is required',
      })
    }

    const otpKey = normalizedMobile
      ? `signup:mobile:${normalizedMobile}`
      : `signup:email:${normalizedEmail}`

    otpStore.delete(otpKey)

    return res.status(200).json({
      message: 'Signup OTP invalidated successfully',
    })
  } catch (error) {
    console.error('Signup invalidate OTP error:', error)

    return res.status(500).json({
      message: 'Could not invalidate signup OTP',
    })
  }
})

// ============================================================
// SIGNUP - VERIFY OTP
// ============================================================

router.post('/signup/verify-otp', async (req, res) => {
  try {
    const { otp } = req.body
    const normalizedEmail = req.body.email
      ? normalizeEmail(req.body.email)
      : ''
    const normalizedMobile = normalizeString(req.body.mobileNumber)

    if (!otp || !/^\d{6}$/.test(String(otp))) {
      return res.status(400).json({
        message: 'OTP must contain exactly 6 digits',
      })
    }

    if (!normalizedEmail && !normalizedMobile) {
      return res.status(400).json({
        message: 'Email or mobile number is required',
      })
    }

    const otpKey = normalizedMobile
      ? `signup:mobile:${normalizedMobile}`
      : `signup:email:${normalizedEmail}`

    const signupData = otpStore.get(otpKey)

    if (!signupData) {
      return res.status(400).json({
        message: 'OTP not found or expired. Please request a new OTP.',
      })
    }

    if (Date.now() > signupData.expiresAt) {
      otpStore.delete(otpKey)

      return res.status(400).json({
        message: 'OTP has expired. Please request a new OTP.',
      })
    }

    if (String(signupData.otp) !== String(otp)) {
      return res.status(400).json({
        message: 'Invalid OTP',
      })
    }

    const savedEmail = signupData.email || ''
    const savedMobile = signupData.mobileNumber || ''

    if (
      normalizedEmail !== savedEmail ||
      normalizedMobile !== savedMobile
    ) {
      return res.status(400).json({
        message:
          'Contact information changed. Please request a new OTP.',
      })
    }

    const existingByEmail = savedEmail
      ? await Consumer.findOne({ email: savedEmail })
      : null

    const existingByMobile = savedMobile
      ? await Consumer.findOne({ mobileNumber: savedMobile })
      : null

    if (
      existingByEmail &&
      existingByMobile &&
      existingByEmail._id.toString() !== existingByMobile._id.toString()
    ) {
      otpStore.delete(otpKey)

      return res.status(409).json({
        code: 'CONTACT_CONFLICT',
        message:
          'The email and mobile number belong to different accounts. Please change your contact information.',
      })
    }

    if (existingByEmail || existingByMobile) {
      otpStore.delete(otpKey)

      return res.status(409).json({
        code: 'ACCOUNT_EXISTS',
        message: 'An account already exists with this contact information.',
      })
    }

    const consumer = await Consumer.create({
      firstName: signupData.firstName,
      middleName: signupData.middleName || null,
      lastName: signupData.lastName,
      email: savedEmail || undefined,
      mobileNumber: savedMobile || undefined,
      role: 'CONSUMER',
    })

    req.session.consumerId = consumer._id.toString()
    req.session.role = consumer.role

    await new Promise((resolve, reject) => {
      req.session.save((error) => {
        if (error) reject(error)
        else resolve()
      })
    })

    otpStore.delete(otpKey)

    return res.status(201).json({
      message: 'Consumer account created successfully',
      consumer: {
        _id: consumer._id,
        firstName: consumer.firstName,
        middleName: consumer.middleName,
        lastName: consumer.lastName,
        email: consumer.email || null,
        mobileNumber: consumer.mobileNumber || null,
        role: consumer.role,
      },
    })
  } catch (error) {
    console.error('Signup verify OTP error:', error)

    if (error.code === 11000) {
      return res.status(409).json({
        code: 'ACCOUNT_EXISTS',
        message: 'An account already exists with this contact information.',
      })
    }

    return res.status(500).json({
      message: 'Could not complete signup',
    })
  }
})

// ============================================================
// LOGIN - REQUEST OTP
// ============================================================

router.post('/login/request-otp', async (req, res) => {
  try {
    const normalizedEmail = req.body.email
      ? normalizeEmail(req.body.email)
      : ''
    const normalizedMobile = normalizeString(req.body.mobileNumber)

    if (!normalizedEmail && !normalizedMobile) {
      return res.status(400).json({
        message: 'Mobile number or email is required',
      })
    }

    if (normalizedEmail && !emailPattern.test(normalizedEmail)) {
      return res.status(400).json({
        message: 'Please enter a valid email address',
      })
    }

    if (normalizedMobile && !mobilePattern.test(normalizedMobile)) {
      return res.status(400).json({
        message: 'Mobile number must contain exactly 10 digits',
      })
    }

    const existingByEmail = normalizedEmail
      ? await Consumer.findOne({ email: normalizedEmail })
      : null

    const existingByMobile = normalizedMobile
      ? await Consumer.findOne({ mobileNumber: normalizedMobile })
      : null

    if (
      existingByEmail &&
      existingByMobile &&
      existingByEmail._id.toString() !== existingByMobile._id.toString()
    ) {
      return res.status(409).json({
        code: 'CONTACT_CONFLICT',
        message:
          'The email and mobile number belong to different accounts. Change your contact details and try again.',
      })
    }

    if (
      normalizedEmail &&
      normalizedMobile &&
      (!existingByEmail || !existingByMobile)
    ) {
      return res.status(404).json({
        code: 'ACCOUNT_NOT_FOUND',
        message:
          'Both contact details must belong to the same existing account. Check your details or sign up using these details.',
      })
    }

    const consumer = normalizedMobile
      ? existingByMobile
      : existingByEmail

    if (!consumer) {
      return res.status(404).json({
        code: 'ACCOUNT_NOT_FOUND',
        message:
          'No account was found with these contact details. Check your details or sign up.',
      })
    }

    const useMobile = Boolean(normalizedMobile)
    const otpDestination = useMobile ? normalizedMobile : normalizedEmail
    const loginKey = useMobile
      ? `login:${normalizedMobile}`
      : `login:${normalizedEmail}`

    otpStore.delete(loginKey)

    const otp = generateOtp()
    const expiresAt = Date.now() + 5 * 60 * 1000

    otpStore.set(loginKey, {
      otp,
      mobileNumber: normalizedMobile || null,
      email: normalizedEmail || null,
      otpDestination: useMobile ? 'mobile' : 'email',
      consumerId: consumer._id.toString(),
      expiresAt,
    })

    // Local development/testing only.
    console.log(`Login OTP for ${otpDestination}: ${otp}`)

    return res.status(200).json({
      message: useMobile
        ? 'Login OTP generated for mobile number'
        : 'Login OTP generated for email address',
      otpDestination: useMobile ? 'mobile' : 'email',
      otp,
      expiresAt,
    })
  } catch (error) {
    console.error('Login request OTP error:', error)

    return res.status(500).json({
      message: 'Could not process login request',
    })
  }
})

// ============================================================
// LOGIN - INVALIDATE OTP
// ============================================================

router.post('/login/invalidate-otp', (req, res) => {
  try {
    const normalizedEmail = req.body.email
      ? normalizeEmail(req.body.email)
      : ''
    const normalizedMobile = normalizeString(req.body.mobileNumber)

    if (!normalizedEmail && !normalizedMobile) {
      return res.status(400).json({
        message: 'Mobile number or email is required',
      })
    }

    const loginKey = normalizedMobile
      ? `login:${normalizedMobile}`
      : `login:${normalizedEmail}`

    otpStore.delete(loginKey)

    return res.status(200).json({
      message: 'Login OTP invalidated successfully',
    })
  } catch (error) {
    console.error('Login invalidate OTP error:', error)

    return res.status(500).json({
      message: 'Could not invalidate login OTP',
    })
  }
})

// ============================================================
// LOGIN - VERIFY OTP
// ============================================================

router.post('/login/verify-otp', async (req, res) => {
  try {
    const normalizedEmail = req.body.email
      ? normalizeEmail(req.body.email)
      : ''
    const normalizedMobile = normalizeString(req.body.mobileNumber)
    const { otp } = req.body

    if (!normalizedEmail && !normalizedMobile) {
      return res.status(400).json({
        message: 'Mobile number or email is required',
      })
    }

    if (normalizedEmail && !emailPattern.test(normalizedEmail)) {
      return res.status(400).json({
        message: 'Please enter a valid email address',
      })
    }

    if (normalizedMobile && !mobilePattern.test(normalizedMobile)) {
      return res.status(400).json({
        message: 'Mobile number must contain exactly 10 digits',
      })
    }

    if (!otp || !/^\d{6}$/.test(String(otp))) {
      return res.status(400).json({
        message: 'OTP must contain exactly 6 digits',
      })
    }

    const loginKey = normalizedMobile
      ? `login:${normalizedMobile}`
      : `login:${normalizedEmail}`

    const loginData = otpStore.get(loginKey)

    if (!loginData) {
      return res.status(400).json({
        message: 'OTP not found or expired. Please request a new OTP.',
      })
    }

    if (Date.now() > loginData.expiresAt) {
      otpStore.delete(loginKey)

      return res.status(400).json({
        message: 'OTP has expired. Please request a new OTP.',
      })
    }

    if (String(loginData.otp) !== String(otp)) {
      return res.status(400).json({
        message: 'Invalid OTP',
      })
    }

    if (
      (loginData.email || '') !== normalizedEmail ||
      (loginData.mobileNumber || '') !== normalizedMobile
    ) {
      return res.status(400).json({
        message:
          'Contact details changed. Go back and request a new OTP.',
      })
    }

    const consumer = await Consumer.findById(loginData.consumerId)

    if (!consumer) {
      otpStore.delete(loginKey)

      return res.status(404).json({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Consumer account was not found.',
      })
    }

    if (
      (normalizedEmail && consumer.email !== normalizedEmail) ||
      (normalizedMobile && consumer.mobileNumber !== normalizedMobile)
    ) {
      otpStore.delete(loginKey)

      return res.status(409).json({
        code: 'CONTACT_CONFLICT',
        message:
          'These contact details no longer match the same account. Please try again.',
      })
    }

    req.session.consumerId = consumer._id.toString()
    req.session.role = consumer.role

    req.session.save((error) => {
      if (error) {
        console.error('Login session save error:', error)

        return res.status(500).json({
          message: 'Could not create login session',
        })
      }

      otpStore.delete(loginKey)

      return res.status(200).json({
        message: 'Login successful',
        consumer: {
          _id: consumer._id,
          firstName: consumer.firstName,
          middleName: consumer.middleName,
          lastName: consumer.lastName,
          email: consumer.email || null,
          mobileNumber: consumer.mobileNumber || null,
          role: consumer.role,
        },
      })
    })
  } catch (error) {
    console.error('Login verify OTP error:', error)

    return res.status(500).json({
      message: 'Could not complete login',
    })
  }
})

// ============================================================
// PROFILE - GET CURRENT CONSUMER
// ============================================================

router.get('/profile', requireConsumer, async (req, res) => {
  try {
    const consumer = await getSessionConsumer(req)

    if (!consumer) {
      return res.status(404).json({
        message: 'Consumer account was not found',
      })
    }

    return res.status(200).json({ consumer })
  } catch (error) {
    console.error('Get profile error:', error)

    return res.status(500).json({
      message: 'Could not load profile',
    })
  }
})

// ============================================================
// PROFILE - UPDATE PERSONAL DETAILS
// ============================================================

router.put('/profile', requireConsumer, async (req, res) => {
  try {
    const { firstName, middleName, lastName, profilePhoto } = req.body

    if (
      typeof firstName !== 'string' ||
      !namePattern.test(firstName.trim()) ||
      typeof lastName !== 'string' ||
      !namePattern.test(lastName.trim()) ||
      (middleName &&
        (typeof middleName !== 'string' ||
          !namePattern.test(middleName.trim())))
    ) {
      return res.status(400).json({
        message: 'Please enter valid first, middle and last names',
      })
    }

    const updates = {
      firstName: firstName.trim(),
      middleName: middleName?.trim() || null,
      lastName: lastName.trim(),
    }

    if (typeof profilePhoto === 'string') {
      updates.profilePhoto = profilePhoto.trim()
    }

    const consumer = await Consumer.findByIdAndUpdate(
      req.session.consumerId,
      { $set: updates },
      { returnDocument: 'after', runValidators: true }
    )

    if (!consumer) {
      return res.status(404).json({
        message: 'Consumer account was not found',
      })
    }

    return res.status(200).json({
      message: 'Personal details saved successfully',
      consumer,
    })
  } catch (error) {
    console.error('Update profile error:', error)

    return res.status(500).json({
      message: 'Could not save personal details',
    })
  }
})

// ============================================================
// ADD ADDRESS
// ============================================================

router.post('/profile/addresses', requireConsumer, async (req, res) => {
  try {
    const address = addressPayload(req.body)
    const validationError = validateAddress(address)

    if (validationError) {
      return res.status(400).json({ message: validationError })
    }

    const consumer = await getSessionConsumer(req)

    if (!consumer) {
      return res.status(404).json({
        message: 'Consumer account was not found',
      })
    }

    const duplicateName = consumer.addresses.some(
      (saved) =>
        saved.nickname.toLowerCase() === address.nickname.toLowerCase()
    )

    if (duplicateName) {
      return res.status(409).json({
        code: 'ADDRESS_NAME_EXISTS',
        message:
          'An address with this name already exists. Please choose another name.',
      })
    }

    const normalizeAddress = (value) =>
      value.trim().toLowerCase().replace(/\s+/g, ' ')

    const duplicateAddress = consumer.addresses.some((saved) => {
      const savedAddress = [
        saved.houseNumber,
        saved.street,
        saved.city,
        saved.state,
        saved.pincode,
      ].map((part) => normalizeAddress(part || '')).join('|')

      const newAddress = [
        address.houseNumber,
        address.street,
        address.city,
        address.state,
        address.pincode,
      ].map((part) => normalizeAddress(part || '')).join('|')

      return savedAddress === newAddress
    })

    if (duplicateAddress) {
      return res.status(409).json({
        code: 'ADDRESS_ALREADY_EXISTS',
        message:
          'This address appears to be saved already. Review your saved addresses before adding it again.',
      })
    }

    consumer.addresses.push(address)
    await consumer.save()

    return res.status(201).json({
      message: 'Address saved successfully',
      addresses: consumer.addresses,
    })
  } catch (error) {
    console.error('Add address error:', error)

    return res.status(500).json({
      message: 'Could not save address',
    })
  }
})

// ============================================================
// EDIT ADDRESS
// ============================================================

router.put(
  '/profile/addresses/:addressId',
  requireConsumer,
  async (req, res) => {
    try {
      const address = addressPayload(req.body)
      const validationError = validateAddress(address)

      if (validationError) {
        return res.status(400).json({ message: validationError })
      }

      const consumer = await getSessionConsumer(req)

      if (!consumer) {
        return res.status(404).json({
          message: 'Consumer account was not found',
        })
      }

      const currentAddress = consumer.addresses.id(req.params.addressId)

      if (!currentAddress) {
        return res.status(404).json({
          message: 'Address was not found',
        })
      }

      const duplicateName = consumer.addresses.some(
        (saved) =>
          saved._id.toString() !== req.params.addressId &&
          saved.nickname.toLowerCase() === address.nickname.toLowerCase()
      )

      if (duplicateName) {
        return res.status(409).json({
          code: 'ADDRESS_NAME_EXISTS',
          message:
            'An address with this name already exists. Please choose another name.',
        })
      }

      const normalizeAddress = (value) =>
        value.trim().toLowerCase().replace(/\s+/g, ' ')

      const newAddressKey = [
        address.houseNumber,
        address.street,
        address.city,
        address.state,
        address.pincode,
      ].map((part) => normalizeAddress(part || '')).join('|')

      const duplicateAddress = consumer.addresses.some((saved) => {
        if (saved._id.toString() === req.params.addressId) return false

        const savedKey = [
          saved.houseNumber,
          saved.street,
          saved.city,
          saved.state,
          saved.pincode,
        ].map((part) => normalizeAddress(part || '')).join('|')

        return savedKey === newAddressKey
      })

      if (duplicateAddress) {
        return res.status(409).json({
          code: 'ADDRESS_ALREADY_EXISTS',
          message: 'Another saved address already has these details.',
        })
      }

      currentAddress.set(address)
      await consumer.save()

      return res.status(200).json({
        message: 'Address updated successfully',
        addresses: consumer.addresses,
      })
    } catch (error) {
      console.error('Edit address error:', error)

      return res.status(500).json({
        message: 'Could not update address',
      })
    }
  }
)

// ============================================================
// DELETE ADDRESS
// ============================================================

router.delete(
  '/profile/addresses/:addressId',
  requireConsumer,
  async (req, res) => {
    try {
      const consumer = await getSessionConsumer(req)

      if (!consumer) {
        return res.status(404).json({
          message: 'Consumer account was not found',
        })
      }

      const address = consumer.addresses.id(req.params.addressId)

      if (!address) {
        return res.status(404).json({
          message: 'Address was not found',
        })
      }

      address.deleteOne()
      await consumer.save()

      return res.status(200).json({
        message: 'Address deleted successfully',
        addresses: consumer.addresses,
      })
    } catch (error) {
      console.error('Delete address error:', error)

      return res.status(500).json({
        message: 'Could not delete address',
      })
    }
  }
)

// ============================================================
// ADD BATTERY PROFILE
// ============================================================

router.post('/profile/batteries', requireConsumer, async (req, res) => {
  try {
    const battery = batteryPayload(req.body)
    const validationError = validateBattery(battery)

    if (validationError) {
      return res.status(400).json({ message: validationError })
    }

    const consumer = await getSessionConsumer(req)

    if (!consumer) {
      return res.status(404).json({
        message: 'Consumer account was not found',
      })
    }

    const duplicateName = consumer.batteries.some(
      (saved) =>
        saved.name.toLowerCase() === battery.name.toLowerCase()
    )

    if (duplicateName) {
      return res.status(409).json({
        code: 'BATTERY_NAME_EXISTS',
        message:
          'A battery profile with this name already exists. Please choose another name.',
      })
    }

    consumer.batteries.push(battery)
    await consumer.save()

    return res.status(201).json({
      message: 'Battery profile saved successfully',
      batteries: consumer.batteries,
    })
  } catch (error) {
    console.error('Add battery error:', error)

    return res.status(500).json({
      message: 'Could not save battery profile',
    })
  }
})

// ============================================================
// EDIT BATTERY PROFILE
// ============================================================

router.put(
  '/profile/batteries/:batteryId',
  requireConsumer,
  async (req, res) => {
    try {
      const battery = batteryPayload(req.body)
      const validationError = validateBattery(battery)

      if (validationError) {
        return res.status(400).json({ message: validationError })
      }

      const consumer = await getSessionConsumer(req)

      if (!consumer) {
        return res.status(404).json({
          message: 'Consumer account was not found',
        })
      }

      const currentBattery = consumer.batteries.id(req.params.batteryId)

      if (!currentBattery) {
        return res.status(404).json({
          message: 'Battery profile was not found',
        })
      }

      const duplicateName = consumer.batteries.some(
        (saved) =>
          saved._id.toString() !== req.params.batteryId &&
          saved.name.toLowerCase() === battery.name.toLowerCase()
      )

      if (duplicateName) {
        return res.status(409).json({
          code: 'BATTERY_NAME_EXISTS',
          message:
            'A battery profile with this name already exists. Please choose another name.',
        })
      }

      currentBattery.set(battery)
      await consumer.save()

      return res.status(200).json({
        message: 'Battery profile updated successfully',
        batteries: consumer.batteries,
      })
    } catch (error) {
      console.error('Edit battery error:', error)

      return res.status(500).json({
        message: 'Could not update battery profile',
      })
    }
  }
)

// ============================================================
// DELETE BATTERY PROFILE
// ============================================================

router.delete(
  '/profile/batteries/:batteryId',
  requireConsumer,
  async (req, res) => {
    try {
      const consumer = await getSessionConsumer(req)

      if (!consumer) {
        return res.status(404).json({
          message: 'Consumer account was not found',
        })
      }

      const battery = consumer.batteries.id(req.params.batteryId)

      if (!battery) {
        return res.status(404).json({
          message: 'Battery profile was not found',
        })
      }

      battery.deleteOne()
      await consumer.save()

      return res.status(200).json({
        message: 'Battery profile deleted successfully',
        batteries: consumer.batteries,
      })
    } catch (error) {
      console.error('Delete battery error:', error)

      return res.status(500).json({
        message: 'Could not delete battery profile',
      })
    }
  }
)

// ============================================================
// CURRENT SESSION
// ============================================================

router.get('/me', async (req, res) => {
  try {
    if (!req.session.consumerId) {
      return res.status(401).json({
        message: 'Not logged in',
      })
    }

    const consumer = await Consumer.findById(req.session.consumerId)

    if (!consumer) {
      return res.status(404).json({
        message: 'Consumer not found',
      })
    }

    return res.status(200).json({ consumer })
  } catch (error) {
    console.error('Session check error:', error)

    return res.status(500).json({
      message: 'Could not check session',
    })
  }
})

// ============================================================
// LOGOUT
// ============================================================

router.post('/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error('Logout error:', error)

      return res.status(500).json({
        message: 'Could not log out',
      })
    }

    res.clearCookie('connect.sid')

    return res.status(200).json({
      message: 'Logout successful',
    })
  })
})

// ============================================================
// TEST ROUTE
// ============================================================

router.get('/test', (req, res) => {
  res.json({
    message: 'Consumer auth routes are working',
  })
})

export default router
