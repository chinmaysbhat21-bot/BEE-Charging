import React, { useEffect, useState } from 'react'
import './App.css'
import './reference-tokens.css'
import './reference-theme.css'
import './responsive-polish.css'
import './redesign-navigation.css'
import './ev-profile-picker.css'
import './product-polish.css'
import Signup from './Components/Signup'
import Login from './Components/Login'
import {
  EV_BATTERY_PROFILES,
  getBatteryFormValuesForProfile,
} from './data/evBatteryProfiles'

const API_BASE_URL = '/api/consumer/auth'

const emptySignupForm = {
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  mobileNumber: '',
}

const emptyLoginForm = {
  email: '',
  mobileNumber: '',
}

async function profileApiRequest(path, options = {}) {
  const requestOptions = {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  }
  const response = await fetch(`${API_BASE_URL}${path}`, requestOptions)
  const data = await response.json().catch(() => ({}))
  return { ok: response.ok, status: response.status, data }
}

function normalizeSavedAddress(address) {
  return {
    id: String(address._id || address.id || ''),
    nickname: address.nickname || '',
    house: address.houseNumber ?? address.house ?? '',
    street: address.street || '',
    landmark: address.landmark || '',
    city: address.city || '',
    state: address.state || '',
    pincode: address.pincode || '',
    // Preserve coordinates if the backend already stores them.
    latitude: address.latitude ?? address.lat ?? address.location?.coordinates?.[1] ?? null,
    longitude: address.longitude ?? address.lon ?? address.lng ?? address.location?.coordinates?.[0] ?? null,
  }
}

function normalizeSavedBattery(battery) {
  const legacyConnector = battery.connectorType || ''
  const connectorTypes = Array.isArray(battery.connectorTypes) && battery.connectorTypes.length
    ? battery.connectorTypes
    : legacyConnector ? [legacyConnector] : []

  return {
    id: String(battery._id || battery.id || ''),
    name: battery.name || '',
    vehicleMake: battery.vehicleMake || '',
    vehicleModel: battery.vehicleModel || '',
    capacityKwh: battery.capacityKwh ?? '',
    batteryChemistry: battery.batteryChemistry || 'Other/Unknown',
    connectorType: legacyConnector || connectorTypes[0] || '',
    connectorTypes,
    maxAcChargingPowerKw: battery.maxAcChargingPowerKw ?? '',
    maxDcChargingPowerKw: battery.maxDcChargingPowerKw ?? '',
    maxChargingPowerKw: battery.maxChargingPowerKw ?? '',
  }
}

function getDistanceKm(fromLat, fromLon, toLat, toLon) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRadians(toLat - fromLat)
  const dLon = toRadians(toLon - fromLon)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLon / 2) ** 2
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function describeStationPricing(pricing) {
  if (!pricing || typeof pricing !== 'object') return 'Not provided'
  const price = (value) => Number.isFinite(Number(value)) ? `₹${Number(value).toFixed(2)}` : 'Price unavailable'
  if (pricing.pricingModel === 'per_kwh') return `${price(pricing.pricePerKWh)}/kWh`
  if (pricing.pricingModel === 'per_minute') return `${price(pricing.pricePerMinute)}/minute`
  if (pricing.pricingModel === 'per_session') return `${price(pricing.sessionFee)}/session`
  if (pricing.pricingModel === 'per_kwh_plus_time') {
    return `${price(pricing.pricePerKWh)}/kWh + ${price(pricing.pricePerMinute)}/minute${Number(pricing.sessionFee) > 0 ? ` + ${price(pricing.sessionFee)} session fee` : ''}`
  }
  return 'Tariff unavailable'
}

function stationIsAvailable(station) {
  return !station.status || station.status === 'available'
}

function getCompatibleCharger(station, battery) {
  const vehicleConnectors = (battery?.connectorTypes?.length ? battery.connectorTypes : battery?.connectorType ? [battery.connectorType] : []).map((connector) => connector.trim().toLowerCase())
  if (!vehicleConnectors.length) return null
  return (station.chargers || []).find((charger) => (charger.connectorTypes || []).some((connector) => vehicleConnectors.includes(String(connector).trim().toLowerCase()))) || null
}

function getStationEstimate(station, battery, initialCharge, finalCharge, address) {
  const charger = getCompatibleCharger(station, battery)
  if (!charger) return null
  const capacityKwh = Number(battery?.capacityKwh)
  const start = Number(initialCharge)
  const end = Number(finalCharge)
  const energyKwh = capacityKwh > 0 && end > start ? capacityKwh * ((end - start) / 100) : 0
  const chargingMode = String(charger.chargingMode).toUpperCase()
  const hasModeSpecificPower = Boolean(
    (battery?.maxAcChargingPowerKw !== '' && battery?.maxAcChargingPowerKw != null) ||
    (battery?.maxDcChargingPowerKw !== '' && battery?.maxDcChargingPowerKw != null)
  )
  let vehiclePower = Number(chargingMode === 'DC' ? battery?.maxDcChargingPowerKw : battery?.maxAcChargingPowerKw)
  if ((!Number.isFinite(vehiclePower) || vehiclePower <= 0) && !hasModeSpecificPower) {
    vehiclePower = Number(battery?.maxChargingPowerKw || 0)
  }
  const chargerPower = Number(charger.powerOutputKW || 0)
  const effectivePower = Math.min(vehiclePower, chargerPower)
  const durationMinutes = energyKwh > 0 && effectivePower > 0 ? Math.ceil((energyKwh / effectivePower) * 60 / 0.9) : null
  const pricing = station.pricing || {}
  let estimatedCost = null
  if (pricing.pricingModel === 'per_kwh') estimatedCost = energyKwh * Number(pricing.pricePerKWh || 0)
  else if (pricing.pricingModel === 'per_minute') estimatedCost = durationMinutes == null ? null : durationMinutes * Number(pricing.pricePerMinute || 0)
  else if (pricing.pricingModel === 'per_session') estimatedCost = Number(pricing.sessionFee || 0)
  else if (pricing.pricingModel === 'per_kwh_plus_time') estimatedCost = energyKwh * Number(pricing.pricePerKWh || 0) + (durationMinutes == null ? 0 : durationMinutes * Number(pricing.pricePerMinute || 0)) + Number(pricing.sessionFee || 0)
  const coordinates = station.location?.coordinates || station.coordinates
  const hasOrigin = address?.latitude !== null && address?.latitude !== undefined && address?.latitude !== '' && address?.longitude !== null && address?.longitude !== undefined && address?.longitude !== '' && Number.isFinite(Number(address.latitude)) && Number.isFinite(Number(address.longitude))
  const hasStationCoordinates = Array.isArray(coordinates) && coordinates.length >= 2 && coordinates[0] !== null && coordinates[1] !== null && Number.isFinite(Number(coordinates[0])) && Number.isFinite(Number(coordinates[1]))
  const distanceKm = hasOrigin && hasStationCoordinates ? getDistanceKm(Number(address.latitude), Number(address.longitude), Number(coordinates[1]), Number(coordinates[0])) : null
  return { charger, energyKwh, durationMinutes, estimatedCost, distanceKm, effectivePower }
}

function formatClockTime(time) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim())
  if (!match) return String(time || '')
  const hours = Number(match[1])
  const minutes = match[2]
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  return `${String(displayHour).padStart(2, '0')}:${minutes} ${period}`
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return 'Unavailable'
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours && remainingMinutes) return `${hours} hr ${remainingMinutes} min`
  if (hours) return `${hours} hr`
  return `${remainingMinutes} min`
}

function getAvailableSlotWindows(
  station,
  durationMinutes,
  selectedDate,
  bookings = [],
  selectedBatteryId
) {
  const slots = Array.isArray(station?.timeSlots)
    ? station.timeSlots
    : []

  const requiredMinutes = Math.max(1, Number(durationMinutes || 30))
  const now = new Date()

  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const parseMinutes = (time) => {
    const match = /^(\d{2}):(\d{2})$/.exec(String(time || ''))
    return match ? Number(match[1]) * 60 + Number(match[2]) : null
  }

  const formatTime = (minutes) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

  const dateKey = (value) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  console.log('[Battery availability debug]', {
    selectedBatteryId,
    bookings: (Array.isArray(bookings) ? bookings : []).map((booking) => ({
      bookingId: booking._id,
      batteryId: booking.batteryId,
      battery: booking.battery,
      status: booking.status,
      date: booking.date,
      startAt: booking.startAt,
      endAt: booking.endAt,
    })),
  })

  // Find confirmed bookings belonging to this battery, at ANY station.
  const batteryBookings = (Array.isArray(bookings) ? bookings : [])
    .filter((booking) => {
      const bookingBatteryId =
        booking.batteryId?._id ??
        booking.batteryId ??
        booking.battery?._id ??
        booking.battery

      return (
        String(bookingBatteryId ?? '') === String(selectedBatteryId ?? '') &&
        booking.status === 'confirmed' &&
        booking.startAt &&
        booking.endAt &&
        new Date(booking.endAt) > now
      )
    })
    .map((booking) => ({
      date: dateKey(booking.date || booking.startAt),
      start: new Date(booking.startAt).getHours() * 60 +
        new Date(booking.startAt).getMinutes(),
      end: new Date(booking.endAt).getHours() * 60 +
        new Date(booking.endAt).getMinutes(),
    }))
    .filter((booking) => booking.date && booking.end > booking.start)

  const available = slots
    .filter((slot) => slot.status === 'available')
    .map((slot) => ({
      ...slot,
      day: dateKey(slot.date),
      start: parseMinutes(slot.startTime),
      end: parseMinutes(slot.endTime),
    }))
    .filter(
      (slot) =>
        slot.day &&
        slot.start !== null &&
        slot.end !== null &&
        slot.end > slot.start &&
        slot.day >= todayKey &&
        (!selectedDate || slot.day === selectedDate)
    )
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        a.start - b.start ||
        a.end - b.end
    )

  // Merge available windows before subtracting battery booking conflicts.
  const mergedWindows = []

  for (const slot of available) {
    const previous = mergedWindows[mergedWindows.length - 1]

    if (
      previous &&
      previous.date === slot.day &&
      slot.start <= previous.endMinutes
    ) {
      previous.endMinutes = Math.max(previous.endMinutes, slot.end)
    } else {
      mergedWindows.push({
        date: slot.day,
        startMinutes: slot.start,
        endMinutes: slot.end,
      })
    }
  }

  // Remove every overlapping interval reserved for this battery.
  const freeWindows = []

  for (const window of mergedWindows) {
    let remainingWindows = [{
      startMinutes: window.startMinutes,
      endMinutes: window.endMinutes,
    }]

    const conflicts = batteryBookings
      .filter((booking) => booking.date === window.date)
      .sort((a, b) => a.start - b.start)

    for (const conflict of conflicts) {
      const nextWindows = []

      for (const free of remainingWindows) {
        // No overlap.
        if (
          conflict.end <= free.startMinutes ||
          conflict.start >= free.endMinutes
        ) {
          nextWindows.push(free)
          continue
        }

        // Keep the free section before the booking.
        if (conflict.start > free.startMinutes) {
          nextWindows.push({
            startMinutes: free.startMinutes,
            endMinutes: conflict.start,
          })
        }

        // Keep the free section after the booking.
        if (conflict.end < free.endMinutes) {
          nextWindows.push({
            startMinutes: conflict.end,
            endMinutes: free.endMinutes,
          })
        }
      }

      remainingWindows = nextWindows

      if (remainingWindows.length === 0) break
    }

    freeWindows.push(
      ...remainingWindows.map((free) => ({
        date: window.date,
        ...free,
      }))
    )
  }

  return freeWindows
    .map((window) => {
      const startMinutes =
        window.date === todayKey
          ? Math.max(
            window.startMinutes,
            currentMinutes + (now.getSeconds() > 0 ? 1 : 0)
          )
          : window.startMinutes

      return {
        date: window.date,
        startMinutes,
        endMinutes: window.endMinutes,
      }
    })
    .filter(
      (window) =>
        window.endMinutes - window.startMinutes >= requiredMinutes
    )
    .map((window) => ({
      date: window.date,
      startTime: formatTime(window.startMinutes),
      endTime: formatTime(window.endMinutes),
      durationMinutes: window.endMinutes - window.startMinutes,
      id: `${window.date}-${formatTime(window.startMinutes)}-${formatTime(window.endMinutes)}`,
    }))
}

function getLocalDateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function NavigationIcon({ name }) {
  const paths = {
    stations: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    orders: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h7" /></>,
    vehicle: <><path d="m5 11 1.5-4h11L19 11" /><path d="M4 11h16v7H4zM7 18v2m10-2v2M7 14h.01M17 14h.01" /></>,
  }
  return <svg className="primary-nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function App() {
  const [myBookings, setMyBookings] = useState([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [bookingsError, setBookingsError] = useState('')
  const [page, setPage] = useState('home')
  const [signupReturnPage, setSignupReturnPage] = useState('home')
  const [previousPage, setPreviousPage] = useState('home')
  const [loginStartedFromSignup, setLoginStartedFromSignup] = useState(false)
  const [expandedOrderIds, setExpandedOrderIds] = useState([])
  const [signupDraft, setSignupDraft] = useState({ ...emptySignupForm })
  const [loginForm, setLoginForm] = useState({ ...emptyLoginForm })

  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const [loginOtp, setLoginOtp] = useState('')
  const [loginStep, setLoginStep] = useState(1)
  const [loginOtpExpiresAt, setLoginOtpExpiresAt] = useState(null)
  const [loginOtpSecondsLeft, setLoginOtpSecondsLeft] = useState(0)

  const [loginComplete, setLoginComplete] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')
  const [bookSelectionView, setBookSelectionView] = useState('main')
  const [selectedBookingAddress, setSelectedBookingAddress] = useState(null)
  const [selectedBookingBattery, setSelectedBookingBattery] = useState(null)
  const [initialCharge, setInitialCharge] = useState(20)
  const [finalCharge, setFinalCharge] = useState(80)
  const [bookingFilters, setBookingFilters] = useState(['distance'])
  const [selectedBookingDate, setSelectedBookingDate] = useState(() => getLocalDateInputValue())
  const [bookingSelectionsReady, setBookingSelectionsReady] = useState(false)
  const [bookReturnTo, setBookReturnTo] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('main')
  // Host module
  const [hostedStations, setHostedStations] = useState([])
  const [hostStationsLoading, setHostStationsLoading] = useState(false)
  const [hostStationsError, setHostStationsError] = useState('')
  const [showHostStationForm, setShowHostStationForm] = useState(false)
  const [hostStationSaving, setHostStationSaving] = useState(false)
  const [hostCoordinatesLoading, setHostCoordinatesLoading] = useState(false)
  const [hostStationError, setHostStationError] = useState('')
  const [hostStationMessage, setHostStationMessage] = useState('')
  const [hostStationToDelete, setHostStationToDelete] = useState(null)

  const emptyHostStationForm = {
    name: '',
    address: '',
    area: '',
    city: '',
    state: '',
    pincode: '',
    stationType: 'residential',
    description: '',
    openingTime: '09:00',
    closingTime: '21:00',
    chargerType: 'AC',
    connectorTypes: ['Type 2'],
    powerOutputKW: '7.4',
    totalPorts: '1',
    pricePerKwh: '0',
    amenities: [],
    latitude: '',
    longitude: '',
  }

  const [hostStationForm, setHostStationForm] = useState({
    ...emptyHostStationForm,
  })
  const [loggedInConsumer, setLoggedInConsumer] = useState(null)
  const [signupSuccessNotice, setSignupSuccessNotice] = useState(false)
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
  })
  const [editingNameField, setEditingNameField] = useState(null)
  const [nameDraft, setNameDraft] = useState('')
  const [photoSaving, setPhotoSaving] = useState(false)

  const [savedAddresses, setSavedAddresses] = useState([])
  const [savedBatteries, setSavedBatteries] = useState([])
  const [profileMode, setProfileMode] = useState('view')
  const [addressForm, setAddressForm] = useState({
    nickname: '',
    house: '',
    street: '',
    landmark: '',
    city: '',
    state: '',
    pincode: '',
  })
  const emptyBatteryForm = {
    name: '',
    vehicleMake: '',
    vehicleModel: '',
    capacityKwh: '',
    batteryChemistry: '',
    connectorTypes: [],
    maxAcChargingPowerKw: '',
    maxDcChargingPowerKw: '',
  }
  const [batteryForm, setBatteryForm] = useState({ ...emptyBatteryForm })
  const [evProfileMode, setEvProfileMode] = useState('choose')
  const [evProfileSearch, setEvProfileSearch] = useState('')
  const [selectedEvProfileId, setSelectedEvProfileId] = useState('')
  const [selectedEvVariantId, setSelectedEvVariantId] = useState('')
  const [evProfileReviewed, setEvProfileReviewed] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [editingAddressId, setEditingAddressId] = useState(null)
  const [editingBatteryId, setEditingBatteryId] = useState(null)
  const [chargingStations, setChargingStations] = useState([])
  const [roadDistancesKm, setRoadDistancesKm] = useState({})
  const [stationsLoading, setStationsLoading] = useState(false)
  const [stationsError, setStationsError] = useState('')
  const [selectedStationId, setSelectedStationId] = useState(null)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(null)
  const [bookingModalDraft, setBookingModalDraft] = useState(null)
  const [bookingModalError, setBookingModalError] = useState('')
  const [bookingInProgress, setBookingInProgress] = useState(false)
  const [bookingToCancel, setBookingToCancel] = useState(null)
  const [cancellingBookingId, setCancellingBookingId] = useState(null)
  const [cancelDialogError, setCancelDialogError] = useState('')

  const [accountNotFound, setAccountNotFound] = useState(false)
  const [contactConflict, setContactConflict] = useState(false)

  const loginContact = {
    email: loginForm.email.trim().toLowerCase(),
    mobileNumber: loginForm.mobileNumber.trim(),
  }

  const hasEmail = Boolean(loginContact.email)
  const hasMobile = Boolean(loginContact.mobileNumber)

  const isEmailValid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginContact.email)

  const isMobileValid = /^\d{10}$/.test(loginContact.mobileNumber)

  const selectedEvProfile = EV_BATTERY_PROFILES.find(
    (profile) => profile.id === selectedEvProfileId
  ) || null
  const hasValidLoginContact =
    (hasEmail && isEmailValid) || (hasMobile && isMobileValid)

  const getLoginContactData = () => {
    const data = {}

    if (isEmailValid) {
      data.email = loginContact.email
    }

    if (isMobileValid) {
      data.mobileNumber = loginContact.mobileNumber
    }

    return data
  }


  const resolveHostCoordinates = async () => {
    const address = hostStationForm.address?.trim()
    const area = hostStationForm.area?.trim()
    const city = hostStationForm.city?.trim()
    const state = hostStationForm.state?.trim()
    const pincode = hostStationForm.pincode?.trim()

    if (!address || !city) {
      setHostStationError('Please enter the station address and city first.')
      return
    }

    setHostCoordinatesLoading(true)
    setHostStationError('')
    setHostStationMessage('')

    try {
      const query = [
        address,
        area,
        city,
        state,
        pincode,
        'India',
      ].filter(Boolean).join(', ')

      const url =
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`

      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      })

      if (!response.ok) {
        throw new Error('The geocoding service could not be reached.')
      }

      const results = await response.json()
      const match = Array.isArray(results) ? results[0] : null

      if (!match) {
        setHostStationError(
          'Coordinates could not be found. Try adding a landmark or a more complete address.'
        )
        return
      }

      const latitude = Number(match.lat)
      const longitude = Number(match.lon)

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        throw new Error('The service returned invalid coordinates.')
      }

      setHostStationForm(current => ({
        ...current,
        latitude: String(latitude),
        longitude: String(longitude),
      }))

      setHostStationMessage(
        'Coordinates found. Please check the map location before saving.'
      )
    } catch (error) {
      console.error('Host address geocoding failed:', error)
      setHostStationError(
        'Could not find coordinates right now. You can enter latitude and longitude manually.'
      )
    } finally {
      setHostCoordinatesLoading(false)
    }
  }


  useEffect(() => {

    let cancelled = false

    const fetchMyBookings = async () => {
      setBookingsLoading(true)
      setBookingsError('')

      try {
        const response = await fetch(
          '/api/bookings/my',
          {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.message || 'Failed to load bookings.')
        }

        if (!cancelled) {
          setMyBookings(Array.isArray(data.bookings) ? data.bookings : [])
        }
      } catch (error) {
        if (!cancelled) {
          setBookingsError(error.message || 'Failed to load bookings.')
        }
      } finally {
        if (!cancelled) {
          setBookingsLoading(false)
        }
      }
    }

    fetchMyBookings()

    return () => {
      cancelled = true
    }
  }, [activeSection])

  useEffect(() => {
    if (page !== 'login' || loginStep !== 2 || !loginOtpExpiresAt) {
      setLoginOtpSecondsLeft(0)
      return undefined
    }

    const updateCountdown = () => {
      const secondsLeft = Math.max(
        0,
        Math.ceil((loginOtpExpiresAt - Date.now()) / 1000)
      )

      setLoginOtpSecondsLeft(secondsLeft)

      if (secondsLeft === 0) {
        setLoginOtp('')
        setMessage('OTP has expired. Go back and request a new OTP.')
      }
    }

    updateCountdown()

    const timerId = window.setInterval(updateCountdown, 1000)

    return () => window.clearInterval(timerId)
  }, [page, loginStep, loginOtpExpiresAt])

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/me`, {
          credentials: 'include',
        })

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

  useEffect(() => {
    if (!loginComplete) return undefined
    let cancelled = false
    const loadChargingStations = async () => {
      setStationsLoading(true)
      setStationsError('')
      try {
        const response = await fetch('/api/charging-stations', {
          credentials: 'include',
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || data.success === false) throw new Error(data.message || 'Could not load charging stations.')
        if (!cancelled) setChargingStations(Array.isArray(data.stations) ? data.stations : [])
      } catch (error) {
        console.error('Charging stations load failed:', error)
        if (!cancelled) setStationsError('Could not load charging stations. Check that the backend is running and try again.')
      } finally {
        if (!cancelled) setStationsLoading(false)
      }
    }
    loadChargingStations()
    return () => { cancelled = true }
  }, [loginComplete])

  // The host screen must show the signed-in owner's stations, not every
  // publicly available charger. This uses the existing authenticated endpoint.
  const fetchHostedStations = async () => {
    setHostStationsLoading(true)
    setHostStationsError('')
    try {
      const response = await fetch('/api/charging-stations/my', { credentials: 'include' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || 'Could not load your stations.')
      setHostedStations(Array.isArray(payload.stations) ? payload.stations : [])
    } catch (error) {
      setHostStationsError(error.message || 'Could not load your stations.')
    } finally {
      setHostStationsLoading(false)
    }
  }

  useEffect(() => {
    if (loginComplete && activeSection === 'host') fetchHostedStations()
  }, [loginComplete, activeSection])

  // Saved profile addresses are text-based, so geocode them before calculating
  // station distances. Try the full address first, then a broader locality query
  // when a demo/test street address is not recognized by the geocoder.
  useEffect(() => {
    const address = selectedBookingAddress
    if (!address || address.id === 'current-location') return
    const hasCoordinates = address.latitude !== null && address.latitude !== undefined && address.latitude !== '' && address.longitude !== null && address.longitude !== undefined && address.longitude !== '' && Number.isFinite(Number(address.latitude)) && Number.isFinite(Number(address.longitude))
    if (hasCoordinates) return

    const fullQuery = [address.house, address.street, address.landmark, address.city, address.state, address.pincode, 'India'].filter(Boolean).join(', ')
    const localityQuery = [address.landmark, address.city, address.state, address.pincode, 'India'].filter(Boolean).join(', ')
    const cityQuery = [address.city, address.state, 'India'].filter(Boolean).join(', ')
    const queries = [...new Set([fullQuery, localityQuery, cityQuery].filter(Boolean))]
    if (!queries.length || !address.city) return

    let cancelled = false
    const resolveAddressCoordinates = async () => {
      for (const query of queries) {
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`
          const response = await fetch(url, { headers: { Accept: 'application/json' } })
          if (!response.ok) continue
          const results = await response.json()
          const match = Array.isArray(results) ? results[0] : null
          const latitude = Number(match?.lat)
          const longitude = Number(match?.lon)
          if (!match || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
          if (cancelled) return
          setSelectedBookingAddress((current) => current && current.id === address.id && (current.latitude == null || current.longitude == null)
            ? { ...current, latitude, longitude, coordinatesApproximate: query !== fullQuery }
            : current)
          return
        } catch (error) {
          console.warn('Address geocoding attempt failed.', error)
        }
      }
      if (!cancelled) console.warn('Could not resolve this saved address to map coordinates. Distance will remain unavailable until valid coordinates are available.')
    }
    resolveAddressCoordinates()
    return () => { cancelled = true }
  }, [selectedBookingAddress])

  // Calculate road distances for the station cards using OSRM and OpenStreetMap.
  // This is intentionally separate from the existing station-detail estimate logic.
  useEffect(() => {
    const address = selectedBookingAddress
    const originLat = Number(address?.latitude)
    const originLon = Number(address?.longitude)
    const hasOrigin = address?.latitude !== null && address?.latitude !== undefined && address?.latitude !== '' &&
      address?.longitude !== null && address?.longitude !== undefined && address?.longitude !== '' &&
      Number.isFinite(originLat) && Number.isFinite(originLon)

    if (!hasOrigin || !chargingStations.length) {
      setRoadDistancesKm({})
      return undefined
    }

    const stationsWithCoordinates = chargingStations.map((station) => {
      const coordinates = station.location?.coordinates || station.coordinates
      const hasCoordinates = Array.isArray(coordinates) && coordinates.length >= 2 &&
        Number.isFinite(Number(coordinates[0])) && Number.isFinite(Number(coordinates[1]))
      return hasCoordinates ? {
        id: String(station._id || station.stationCode || ''),
        longitude: Number(coordinates[0]),
        latitude: Number(coordinates[1]),
      } : null
    }).filter((station) => station && station.id)

    if (!stationsWithCoordinates.length) {
      setRoadDistancesKm({})
      return undefined
    }

    let cancelled = false
    const calculateRoadDistances = async () => {
      setRoadDistancesKm({})
      try {
        // OSRM expects longitude,latitude; the first point is the address origin.
        const coordinates = [[originLon, originLat], ...stationsWithCoordinates.map((station) => [station.longitude, station.latitude])]
          .map(([longitude, latitude]) => `${longitude},${latitude}`).join(';')
        const destinations = stationsWithCoordinates.map((_, index) => index + 1).join(';')
        const url = `https://router.project-osrm.org/table/v1/driving/${coordinates}?sources=0&destinations=${destinations}&annotations=distance`
        const response = await fetch(url)
        if (!response.ok) throw new Error(`OSRM returned ${response.status}`)
        const result = await response.json()
        if (result.code !== 'Ok' || !Array.isArray(result.distances?.[0])) throw new Error('OSRM did not return road distances')

        const nextDistances = {}
        stationsWithCoordinates.forEach((station, index) => {
          const metres = result.distances[0][index]
          if (Number.isFinite(metres)) nextDistances[station.id] = metres / 1000
        })
        if (!cancelled) setRoadDistancesKm(nextDistances)
      } catch (error) {
        console.warn('Could not calculate driving distances from OSRM.', error)
        if (!cancelled) setRoadDistancesKm({})
      }
    }

    calculateRoadDistances()
    return () => { cancelled = true }
  }, [selectedBookingAddress, chargingStations])

  useEffect(() => {
    if (!loggedInConsumer) return

    setProfileForm({
      firstName: loggedInConsumer.firstName || '',
      middleName: loggedInConsumer.middleName || '',
      lastName: loggedInConsumer.lastName || '',
    })
  }, [loggedInConsumer])

  useEffect(() => {
    if (!loginComplete) return undefined
    let cancelled = false

    const loadProfileFromBackend = async () => {
      try {
        const { ok, data } = await profileApiRequest('/profile')
        if (!ok) {
          if (!cancelled) setProfileMessage(data.message || 'Could not load your saved profile.')
          return
        }
        const consumer = data.consumer || {}
        if (cancelled) return
        setLoggedInConsumer(consumer)
        setProfileForm({
          firstName: consumer.firstName || '',
          middleName: consumer.middleName || '',
          lastName: consumer.lastName || '',
        })
        const normalizedAddresses = (consumer.addresses || []).map(normalizeSavedAddress)
        const normalizedBatteries = (consumer.batteries || []).map(normalizeSavedBattery)
        setSavedAddresses(normalizedAddresses)
        setSavedBatteries(normalizedBatteries)

        // Restore the last Book Slot selections for this signed-in consumer.
        const consumerId = String(consumer._id || consumer.id || consumer.email || consumer.mobileNumber || '')
        const storageKey = consumerId ? `communityEvCharging.bookingSelections.${consumerId}` : ''
        if (storageKey) {
          try {
            const stored = JSON.parse(localStorage.getItem(storageKey) || '{}')
            if (stored.address?.id === 'current-location') {
              setSelectedBookingAddress(stored.address)
            } else if (stored.address?.id) {
              setSelectedBookingAddress(normalizedAddresses.find((item) => item.id === stored.address.id) || stored.address)
            }
            if (stored.battery?.id) {
              setSelectedBookingBattery(normalizedBatteries.find((item) => item.id === stored.battery.id) || stored.battery)
            }
            if (Number.isFinite(Number(stored.initialCharge))) setInitialCharge(Math.min(100, Math.max(0, Number(stored.initialCharge))))
            if (Number.isFinite(Number(stored.finalCharge))) setFinalCharge(Math.min(100, Math.max(0, Number(stored.finalCharge))))
            if (Array.isArray(stored.filters)) {
              const allowedFilters = ['distance', 'chargingTime', 'cost']
              const validFilters = stored.filters.filter((filter) => allowedFilters.includes(filter))
              setBookingFilters(validFilters.length ? validFilters : ['distance'])
            }
          } catch (storageError) {
            console.warn('Could not restore Book Slot selections.', storageError)
          }
        }
        setBookingSelectionsReady(true)
      } catch (error) {
        console.error('Profile load failed:', error)
        if (!cancelled) setProfileMessage('Could not connect to the backend to load your profile.')
      }
    }

    loadProfileFromBackend()
    return () => { cancelled = true }
  }, [loginComplete])

  useEffect(() => {
    if (!loginComplete || !bookingSelectionsReady || !loggedInConsumer) return
    const consumerId = String(loggedInConsumer._id || loggedInConsumer.id || loggedInConsumer.email || loggedInConsumer.mobileNumber || '')
    if (!consumerId) return
    const storageKey = `communityEvCharging.bookingSelections.${consumerId}`
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        address: selectedBookingAddress,
        battery: selectedBookingBattery,
        initialCharge,
        finalCharge,
        filters: bookingFilters,
      }))
    } catch (storageError) {
      console.warn('Could not save Book Slot selections.', storageError)
    }
  }, [loginComplete, bookingSelectionsReady, loggedInConsumer, selectedBookingAddress, selectedBookingBattery, initialCharge, finalCharge, bookingFilters])

  const confirmCancelBooking = async () => {
    if (!bookingToCancel || cancellingBookingId) return

    const bookingId = bookingToCancel._id

    try {
      setCancellingBookingId(bookingId)
      setCancelDialogError('')

      const response = await fetch(
        `/api/bookings/${bookingId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Unable to cancel booking.')
      }

      setMyBookings((previousBookings) =>
        previousBookings.filter(
          (booking) => booking._id !== bookingId
        )
      )

      setBookingToCancel(null)
    } catch (error) {
      setCancelDialogError(
        error.message || 'Unable to cancel booking.'
      )
    } finally {
      setCancellingBookingId(null)
    }
  }

  const handleSaveName = async (event, field) => {
    event?.preventDefault()
    const nextForm = { ...profileForm, [field]: nameDraft.trim() }
    if (!nextForm.firstName.trim() || !nextForm.lastName.trim()) return
    try {
      const { ok, data } = await profileApiRequest('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          firstName: nextForm.firstName.trim(),
          middleName: nextForm.middleName.trim(),
          lastName: nextForm.lastName.trim(),
        }),
      })
      if (!ok) {
        setProfileMessage(data.message || 'Could not save this name.')
        return
      }
      setLoggedInConsumer(data.consumer)
      setProfileForm({
        firstName: data.consumer.firstName || '',
        middleName: data.consumer.middleName || '',
        lastName: data.consumer.lastName || '',
      })
      setEditingNameField(null)
      setNameDraft('')
      setProfileMessage('')
    } catch (error) {
      console.error('Save name failed:', error)
      setProfileMessage('Could not connect to the backend to save this name.')
    }
  }

  const handleSaveProfilePhoto = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setProfileMessage('Please choose an image file.')
      event.target.value = ''
      return
    }
    if (file.size > 1_500_000) {
      setProfileMessage('Choose an image smaller than 1.5 MB.')
      event.target.value = ''
      return
    }
    setPhotoSaving(true)
    setProfileMessage('')
    try {
      const photoDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const { ok, data } = await profileApiRequest('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          firstName: profileForm.firstName.trim(),
          middleName: profileForm.middleName.trim(),
          lastName: profileForm.lastName.trim(),
          profilePhoto: photoDataUrl,
        }),
      })
      if (!ok) {
        setProfileMessage(data.message || 'Could not save profile photo.')
        return
      }
      setLoggedInConsumer(data.consumer)
      setProfileMessage('')
    } catch (error) {
      console.error('Save profile photo failed:', error)
      setProfileMessage('Could not save profile photo. Please try again.')
    } finally {
      setPhotoSaving(false)
      event.target.value = ''
    }
  }

  const handleSaveAddress = async (event) => {
    event.preventDefault()
    setProfileMessage('')
    const payload = {
      nickname: addressForm.nickname.trim(),
      houseNumber: addressForm.house.trim(),
      street: addressForm.street.trim(),
      landmark: addressForm.landmark.trim(),
      city: addressForm.city.trim(),
      state: addressForm.state.trim(),
      pincode: addressForm.pincode.trim(),
    }
    try {
      const path = editingAddressId
        ? `/profile/addresses/${encodeURIComponent(editingAddressId)}`
        : '/profile/addresses'
      const { ok, data } = await profileApiRequest(path, {
        method: editingAddressId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      })
      if (!ok) {
        setProfileMessage(data.message || 'Could not save this address.')
        return
      }
      setSavedAddresses((data.addresses || []).map(normalizeSavedAddress))
      setAddressForm({ nickname: '', house: '', street: '', landmark: '', city: '', state: '', pincode: '' })
      setEditingAddressId(null)
      setProfileMode('view')
      setProfileMessage('')
      if (bookReturnTo === 'address') {
        setActiveTab('book')
        setBookSelectionView('address')
        setBookReturnTo(null)
      }
    } catch (error) {
      console.error('Save address failed:', error)
      setProfileMessage('Could not connect to the backend to save this address.')
    }
  }

  const handleDeleteAddress = async (addressId) => {
    setProfileMessage('')
    try {
      const { ok, data } = await profileApiRequest(
        `/profile/addresses/${encodeURIComponent(addressId)}`,
        { method: 'DELETE' }
      )
      if (!ok) {
        setProfileMessage(data.message || 'Could not delete this address.')
        return
      }
      setSavedAddresses((data.addresses || []).map(normalizeSavedAddress))
      setProfileMessage('')
    } catch (error) {
      console.error('Delete address failed:', error)
      setProfileMessage('Could not connect to the backend to delete this address.')
    }
  }

  const handleSaveBattery = async (event) => {
    event.preventDefault()
    setProfileMessage('')

    const connectorTypes = batteryForm.connectorTypes
    const maxAcChargingPowerKw = batteryForm.maxAcChargingPowerKw === ''
      ? null
      : Number(batteryForm.maxAcChargingPowerKw)
    const maxDcChargingPowerKw = batteryForm.maxDcChargingPowerKw === ''
      ? null
      : Number(batteryForm.maxDcChargingPowerKw)

    if (selectedEvProfile && !evProfileReviewed) {
      setProfileMessage('Review the selected vehicle profile and confirm the details before saving.')
      return
    }
    if (!(Number(batteryForm.capacityKwh) > 0)) {
      setProfileMessage('Enter the battery capacity for your exact vehicle variant.')
      return
    }
    if (!batteryForm.batteryChemistry) {
      setProfileMessage('Please select the battery chemistry.')
      return
    }
    if (!connectorTypes.length) {
      setProfileMessage('Select at least one supported connector type.')
      return
    }
    if (!(maxAcChargingPowerKw > 0) && !(maxDcChargingPowerKw > 0)) {
      setProfileMessage('Enter a maximum AC power, DC power, or both.')
      return
    }
    const payload = {
      name: batteryForm.name.trim(),
      vehicleMake: batteryForm.vehicleMake.trim(),
      vehicleModel: batteryForm.vehicleModel.trim(),
      capacityKwh: Number(batteryForm.capacityKwh),
      batteryChemistry: batteryForm.batteryChemistry,
      connectorTypes,
      connectorType: connectorTypes[0],
      maxAcChargingPowerKw,
      maxDcChargingPowerKw,
      maxChargingPowerKw: Math.max(maxAcChargingPowerKw || 0, maxDcChargingPowerKw || 0),
    }

    try {
      const path = editingBatteryId
        ? `/profile/batteries/${encodeURIComponent(editingBatteryId)}`
        : '/profile/batteries'
      const { ok, data } = await profileApiRequest(path, {
        method: editingBatteryId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      })
      if (!ok) {
        setProfileMessage(data.message || 'Could not save this battery profile.')
        return
      }
      setSavedBatteries((data.batteries || []).map(normalizeSavedBattery))
      setBatteryForm({ ...emptyBatteryForm })
      setEditingBatteryId(null)
      setSelectedEvProfileId('')
      setSelectedEvVariantId('')
      setEvProfileMode('choose')
      setEvProfileReviewed(false)
      setProfileMode('view')
      setProfileMessage('')
      if (bookReturnTo === 'battery') {
        setActiveTab('book')
        setBookSelectionView('battery')
        setBookReturnTo(null)
      }
    } catch (error) {
      console.error('Save battery profile failed:', error)
      setProfileMessage('Could not connect to the backend to save this battery profile.')
    }
  }

  const chooseEvProfile = (profile) => {
    setSelectedEvProfileId(profile.id)
    setSelectedEvVariantId('')
    setEvProfileMode('profile')
    setEvProfileReviewed(false)
    setBatteryForm(getBatteryFormValuesForProfile(profile))
    setProfileMessage('')
  }

  const chooseEvVariant = (variantId) => {
    setSelectedEvVariantId(variantId)
    setEvProfileReviewed(false)
    if (!selectedEvProfile) return
    const variant = selectedEvProfile.variants.find((item) => item.id === variantId)
    if (variant) {
      setBatteryForm(getBatteryFormValuesForProfile(selectedEvProfile, variant))
      setProfileMessage('')
    }
  }

  const clearEvProfile = () => {
    setSelectedEvProfileId('')
    setSelectedEvVariantId('')
    setEvProfileMode('choose')
    setEvProfileReviewed(false)
    setBatteryForm({ ...emptyBatteryForm, name: `Battery ${savedBatteries.length + 1}` })
    setProfileMessage('')
  }

  const chooseCustomEv = () => {
    setSelectedEvProfileId('')
    setSelectedEvVariantId('')
    setEvProfileMode('custom')
    setEvProfileReviewed(false)
    setBatteryForm({ ...emptyBatteryForm, name: `Battery ${savedBatteries.length + 1}` })
    setProfileMessage('')
  }

  const handleDeleteBattery = async (batteryId) => {
    setProfileMessage('')
    try {
      const { ok, data } = await profileApiRequest(
        `/profile/batteries/${encodeURIComponent(batteryId)}`,
        { method: 'DELETE' }
      )
      if (!ok) {
        setProfileMessage(data.message || 'Could not delete this battery profile.')
        return
      }
      setSavedBatteries((data.batteries || []).map(normalizeSavedBattery))
      setProfileMessage('')
    } catch (error) {
      console.error('Delete battery profile failed:', error)
      setProfileMessage('Could not connect to the backend to delete this battery profile.')
    }
  }

  const invalidateLoginOtp = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/login/invalidate-otp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(getLoginContactData()),
        }
      )

      return response.ok
    } catch (error) {
      console.error('Login OTP invalidation failed:', error)
      return false
    }
  }

  const clearLoginMessages = () => {
    setMessage('')
    setAccountNotFound(false)
    setContactConflict(false)
  }

  const handleLoginChange = (event) => {
    const { name, value } = event.target

    setLoginForm((current) => ({
      ...current,
      [name]: value,
    }))

    clearLoginMessages()
  }

  const requestLoginOtp = async (event) => {
    event.preventDefault()
    clearLoginMessages()

    const email = loginContact.email
    const mobileNumber = loginContact.mobileNumber

    if (!email && !mobileNumber) {
      setMessage('Enter an email address or mobile number.')
      return
    }

    if (email && !isEmailValid) {
      setMessage('Please enter a valid email address or remove it.')
      return
    }

    if (mobileNumber && !isMobileValid) {
      setMessage(
        'Mobile number must contain exactly 10 digits, or remove it.'
      )
      return
    }

    setLoading(true)

    try {
      const response = await fetch(
        `${API_BASE_URL}/login/request-otp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(getLoginContactData()),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        const errorCode = data.code || data.error || ''

        if (
          errorCode === 'CONTACT_CONFLICT' ||
          errorCode === 'CONTACTS_CONFLICT'
        ) {
          setContactConflict(true)
          setMessage(
            data.message ||
            'These contact details belong to different accounts. Change the details and try again.'
          )
          return
        }

        if (
          response.status === 404 ||
          errorCode === 'CONSUMER_NOT_FOUND' ||
          errorCode === 'ACCOUNT_NOT_FOUND'
        ) {
          setAccountNotFound(true)
          setMessage(
            data.message ||
            'No account was found with these contact details.'
          )
          return
        }

        setMessage(data.message || 'Could not send login OTP.')
        return
      }

      setLoginOtp('')
      setLoginOtpExpiresAt(
        Number(data.expiresAt) > Date.now()
          ? Number(data.expiresAt)
          : Date.now() + 5 * 60 * 1000
      )
      setLoginStep(2)
      setMessage('OTP sent successfully. Enter the 6-digit code.')
    } catch (error) {
      console.error('Login OTP request failed:', error)
      setMessage('Could not connect to the backend.')
    } finally {
      setLoading(false)
    }
  }

  const verifyLoginOtp = async (event) => {
    event.preventDefault()
    setMessage('')

    if (loginOtpSecondsLeft <= 0) {
      setLoginOtp('')
      setMessage('OTP has expired. Go back and request a new OTP.')
      return
    }

    if (!/^\d{6}$/.test(loginOtp)) {
      setMessage('OTP must contain exactly 6 digits.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(
        `${API_BASE_URL}/login/verify-otp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            ...getLoginContactData(),
            otp: loginOtp,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        setMessage(data.message || 'Login OTP verification failed.')
        return
      }

      setLoginOtpExpiresAt(null)
      setLoginOtpSecondsLeft(0)
      setLoggedInConsumer(data.consumer)
      setLoginComplete(true)
      setSignupSuccessNotice(false)
      setMessage('')
    } catch (error) {
      console.error('Login OTP verification failed:', error)
      setMessage('Could not connect to the backend.')
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    setMessage('')
    setLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/logout`, {
        method: 'POST',
        credentials: 'include',
      })

      const data = await response.json()

      if (!response.ok) {
        setMessage(data.message || 'Could not log out.')
        return
      }

      setLoginComplete(false)
      setBookingSelectionsReady(false)
      setSelectedBookingAddress(null)
      setSelectedBookingBattery(null)
      setLoggedInConsumer(null)
      setSignupSuccessNotice(false)
      setPage('home')
      setPreviousPage('home')
      setSignupReturnPage('home')
      setLoginStartedFromSignup(false)
      setLoginStep(1)
      setLoginForm({ ...emptyLoginForm })
      setLoginOtp('')
      setLoginOtpExpiresAt(null)
      setLoginOtpSecondsLeft(0)
      setSignupDraft({ ...emptySignupForm })
      clearLoginMessages()
    } catch (error) {
      console.error('Logout failed:', error)
      setMessage('Could not connect to the backend.')
    } finally {
      setLoading(false)
    }
  }

  const openHomeLogin = () => {
    setLoginStartedFromSignup(false)
    setPreviousPage('home')
    setPage('login')
    setLoginStep(1)
    setLoginOtp('')
    setLoginOtpExpiresAt(null)
    setLoginOtpSecondsLeft(0)
    clearLoginMessages()
  }

  const openSignup = () => {
    setLoginStartedFromSignup(false)
    setSignupReturnPage('home')
    setPreviousPage('home')

    setSignupDraft({
      ...emptySignupForm,
      email: isEmailValid ? loginContact.email : '',
      mobileNumber: isMobileValid ? loginContact.mobileNumber : '',
    })

    setPage('signup')
    clearLoginMessages()
  }

  const openSignupWithLoginContacts = () => {
    setSignupDraft({
      ...emptySignupForm,
      email: isEmailValid ? loginContact.email : '',
      mobileNumber: isMobileValid ? loginContact.mobileNumber : '',
    })

    setSignupReturnPage('login')
    setPreviousPage('login')
    setLoginStep(1)
    setLoginOtp('')
    setLoginOtpExpiresAt(null)
    setLoginOtpSecondsLeft(0)
    setPage('signup')
    clearLoginMessages()
  }

  const openLoginFromSignup = (contact, options = {}) => {
    if (options.signupSuccess) {
      setLoggedInConsumer(contact || null)
      setLoginComplete(true)
      setSignupSuccessNotice(true)
      setSignupDraft({ ...emptySignupForm })
      setMessage('')
      setPage('dashboard')
      return
    }

    const selectedContact = String(contact || '').trim()

    setLoginStartedFromSignup(
      Boolean(options.loginStartedFromSignup)
    )

    setPreviousPage('signup')

    if (selectedContact.includes('@')) {
      setLoginForm({
        email: selectedContact.toLowerCase(),
        mobileNumber: '',
      })
    } else {
      setLoginForm({
        email: '',
        mobileNumber: selectedContact,
      })
    }

    setLoginStep(2)
    setLoginOtp('')
    setLoginOtpExpiresAt(
      options.expiresAt || Date.now() + 5 * 60 * 1000
    )
    setLoginOtpSecondsLeft(
      Math.max(
        0,
        Math.ceil(
          ((options.expiresAt || Date.now() + 5 * 60 * 1000) -
            Date.now()) /
          1000
        )
      )
    )
    setMessage(
      'Login OTP sent successfully. Enter the code to verify your account.'
    )
    setPage('login')
  }

  const returnFromLoginOtp = async () => {
    if (loading) return

    setLoading(true)

    try {
      const invalidated = await invalidateLoginOtp()

      if (!invalidated) {
        setMessage('Could not invalidate the OTP. Please try again.')
        return
      }

      setLoginStep(1)
      setLoginOtp('')
      setLoginOtpExpiresAt(null)
      setLoginOtpSecondsLeft(0)
      clearLoginMessages()
    } finally {
      setLoading(false)
    }
  }

  const returnFromLogin = async () => {
    if (loading) return

    setLoading(true)

    try {
      if (loginStep === 2) {
        const invalidated = await invalidateLoginOtp()

        if (!invalidated) {
          setMessage('Could not invalidate the OTP. Please try again.')
          return
        }
      }

      setPage('home')
      setLoginStep(1)
      setLoginOtp('')
      setLoginOtpExpiresAt(null)
      setLoginOtpSecondsLeft(0)
      setLoginStartedFromSignup(false)
      clearLoginMessages()
    } finally {
      setLoading(false)
    }
  }

  const returnFromSignup = () => {
    setPage('home')
    setMessage('')
  }

  const startBatteryRegistration = () => {
    setBookReturnTo(null)
    setActiveTab('profile')
    setActiveSection('main')
    setProfileMode('battery')
    setEditingBatteryId(null)
    setSelectedEvProfileId('')
    setSelectedEvVariantId('')
    setEvProfileMode('choose')
    setEvProfileSearch('')
    setEvProfileReviewed(false)
    setBatteryForm({ ...emptyBatteryForm, name: `Battery ${savedBatteries.length + 1}` })
    setProfileMessage('')
  }


  if (loginComplete) {
    return (
      <div className={`consumer-shell${activeTab === 'profile' ? ' profile-shell' : ' book-shell'}`}>
        <header className={`consumer-header${activeTab === 'book' ? ' booking-main-header' : ''}${activeTab === 'book' && selectedStationId ? ' station-details-header' : ''}`}>
          <h1>BEE Charging</h1>
          <span className="consumer-header-spacer" aria-hidden="true" />
          {activeSection !== 'host' && (
            <nav className="primary-navigation" aria-label="Main navigation">
              <button type="button" className={activeSection === 'main' && activeTab === 'book' ? 'active' : ''} aria-current={activeSection === 'main' && activeTab === 'book' ? 'page' : undefined} onClick={() => { setActiveSection('main'); setActiveTab('book') }}>
                <NavigationIcon name="stations" /><span>Find stations</span>
              </button>
              <button type="button" className={activeSection === 'orders' ? 'active' : ''} aria-current={activeSection === 'orders' ? 'page' : undefined} onClick={() => setActiveSection('orders')}>
                <NavigationIcon name="orders" /><span>My Orders</span>
              </button>
              <button type="button" className={activeSection === 'main' && activeTab === 'profile' ? 'active' : ''} aria-current={activeSection === 'main' && activeTab === 'profile' ? 'page' : undefined} onClick={() => { setActiveSection('main'); setActiveTab('profile') }}>
                <NavigationIcon name="vehicle" /><span>My EV &amp; profile</span>
              </button>
            </nav>
          )}
          <button
            type="button"
            className="menu-toggle"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            ☰
          </button>
        </header>

        {menuOpen && (
          <nav className="consumer-menu" aria-label="More options">
            <button
              type="button"
              onClick={() => {
                setActiveSection('orders')
                setMenuOpen(false)
              }}
            >
              My Orders
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSection('history')
                setMenuOpen(false)
              }}
            >
              History
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSection('host')
                setMenuOpen(false)
              }}
            >
              Host
            </button>

            <button
              type="button"
              onClick={logout}
              disabled={loading}
            >
              {loading ? 'Logging out...' : 'Logout'}
            </button>
          </nav>
        )}

        <main className={`consumer-content${activeTab === 'profile' ? ' profile-content-scroll' : ''}`}>
          {activeSection === 'orders' ? (
            <section className="my-orders-page">
              <h2 className="my-orders-title">My Orders</h2>

              {bookingsLoading ? (
                <p className="my-orders-message">Loading your bookings...</p>
              ) : bookingsError ? (
                <p className="booking-error">{bookingsError}</p>
              ) : myBookings.filter(
                (booking) =>
                  booking.status === 'confirmed' &&
                  new Date(booking.endAt) > new Date()
              ).length === 0 ? (
                <div className="orders-empty-state">
                  <NavigationIcon name="orders" />
                  <h3>No upcoming charging reservations</h3>
                  <p>Once you book a charging session, its status and details will appear here.</p>
                  <button type="button" className="button button-primary" onClick={() => { setActiveSection('main'); setActiveTab('book') }}>Find a Charging Station</button>
                </div>
              ) : (
                <div className="my-orders-list">
                  {myBookings
                    .filter(
                      (booking) =>
                        booking.status === 'confirmed' &&
                        new Date(booking.endAt) > new Date()
                    )
                    .map((booking) => {
                      const formatTime = (time) => {
                        const [hours, minutes] = time.split(':').map(Number)
                        const suffix = hours >= 12 ? 'P.M' : 'A.M'
                        const displayHour = hours % 12 || 12

                        return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`
                      }

                      const bookingStart = new Date(booking.startAt)
                      const cancellationDeadline =
                        bookingStart.getTime() - 60 * 60 * 1000
                      const canCancel = Date.now() < cancellationDeadline

                      return (
                        <article className="my-order-card" key={booking._id}>
                          <button
                            type="button"
                            className="order-details-toggle"
                            aria-expanded={expandedOrderIds.includes(booking._id)}
                            aria-label={
                              expandedOrderIds.includes(booking._id)
                                ? 'Hide booking details'
                                : 'Show booking details'
                            }
                            onClick={() => {
                              setExpandedOrderIds((previous) =>
                                previous.includes(booking._id)
                                  ? previous.filter((id) => id !== booking._id)
                                  : [...previous, booking._id]
                              )
                            }}
                          >
                            {expandedOrderIds.includes(booking._id) ? '▲' : '▼'}
                          </button>

                          <div className="my-order-details">
                            <h3>{booking.station?.name || 'Charging Station'}</h3>

                            <p>
                              {new Date(`${booking.date}T00:00:00`).toLocaleDateString(
                                'en-GB',
                                {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                }
                              )}
                              {`, ${formatTime(booking.startTime)} to ${formatTime(booking.endTime)}, ${booking.durationMinutes} minutes`}
                            </p>

                            {expandedOrderIds.includes(booking._id) && (
                              <div className="order-extra-details">
                                <p>
                                  <strong>Initial charge:</strong>{' '}
                                  {booking.initialCharge ?? 'Not available'}%
                                </p>

                                <p>
                                  <strong>Final charge:</strong>{' '}
                                  {booking.finalCharge ?? 'Not available'}%
                                </p>

                                <p>
                                  <strong>Battery:</strong>{' '}
                                  {booking.battery?.name ||
                                    booking.batteryName ||
                                    (typeof booking.battery === 'string'
                                      ? booking.battery
                                      : null) ||
                                    'Battery details unavailable'}
                                </p>
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            className="cancel-booking-button"
                            disabled={!canCancel}
                            title={
                              canCancel
                                ? 'Cancel booking'
                                : 'Bookings can only be cancelled until one hour before the start time'
                            }
                            onClick={() => {
                              setBookingToCancel(booking)
                              setCancelDialogError('')
                            }}
                          >
                            Cancel
                          </button>

                          <button
                            type="button"
                            className="booking-map-button"
                            onClick={() => {
                              const coordinates =
                                booking.station?.location?.coordinates ||
                                booking.station?.coordinates

                              const destination =
                                Array.isArray(coordinates) && coordinates.length >= 2
                                  ? `${coordinates[1]},${coordinates[0]}`
                                  : booking.station?.address

                              if (!destination) {
                                alert('Station location is not available.')
                                return
                              }

                              const mapUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent('Current Location')}&destination=${encodeURIComponent(destination)}&travelmode=driving`

                              window.open(mapUrl, '_blank', 'noopener,noreferrer')
                            }}
                          >
                            Map
                          </button>

                          {bookingToCancel?._id === booking._id && (
                            <div className="cancel-dialog-backdrop">
                              <div
                                className="cancel-dialog"
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="cancel-dialog-title"
                              >
                                <h3 id="cancel-dialog-title">Cancel booking?</h3>

                                <p>
                                  Are you sure you want to cancel your charging reservation
                                  at {booking.station?.name || 'this station'}?
                                </p>

                                {cancelDialogError && (
                                  <p className="cancel-dialog-error">
                                    {cancelDialogError}
                                  </p>
                                )}

                                <div className="cancel-dialog-actions">
                                  <button
                                    type="button"
                                    className="cancel-dialog-no"
                                    disabled={cancellingBookingId === booking._id}
                                    onClick={() => {
                                      setBookingToCancel(null)
                                      setCancelDialogError('')
                                    }}
                                  >
                                    No
                                  </button>

                                  <button
                                    type="button"
                                    className="cancel-dialog-yes"
                                    disabled={cancellingBookingId === booking._id}
                                    onClick={confirmCancelBooking}
                                  >
                                    {cancellingBookingId === booking._id
                                      ? 'Cancelling...'
                                      : 'Yes, cancel'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </article>
                      )
                    })}
                </div>
              )}

              <nav className="my-orders-bottom-nav">
                <button
                  type="button"
                  className="my-orders-back-arrow"
                  aria-label="Back to dashboard"
                  onClick={() => setActiveSection('main')}
                >
                  →
                </button>
              </nav>
            </section>


          ) : activeSection === 'history' ? (
            <section className="my-orders-page history-page">
              <button
                type="button"
                className="consumer-back"
                onClick={() => setActiveSection('main')}
              >
                ← Back
              </button>

              <h2 className="my-orders-title">Booking History</h2>

              <p className="history-subtitle">
                Your completed and cancelled charging reservations
              </p>

              {bookingsLoading ? (
                <p className="my-orders-message">
                  Loading your booking history...
                </p>
              ) : bookingsError ? (
                <p className="booking-error">{bookingsError}</p>
              ) : (
                (() => {
                  const now = new Date()

                  const historyBookings = myBookings
                    .filter((booking) => {
                      if (booking.status === 'cancelled') return true

                      return (
                        booking.status === 'confirmed' &&
                        booking.endAt &&
                        new Date(booking.endAt) <= now
                      )
                    })
                    .sort(
                      (a, b) =>
                        new Date(b.startAt || b.date).getTime() -
                        new Date(a.startAt || a.date).getTime()
                    )

                  if (historyBookings.length === 0) {
                    return (
                      <div className="history-empty">
                        <h3>No booking history yet</h3>
                        <p>
                          Your completed and cancelled reservations will
                          appear here.
                        </p>
                      </div>
                    )
                  }

                  const formatTime = (time) => {
                    if (!time) return 'N/A'

                    const [hours, minutes] = time.split(':').map(Number)
                    const suffix = hours >= 12 ? 'PM' : 'AM'
                    const displayHour = hours % 12 || 12

                    return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`
                  }

                  const formatDate = (date) => {
                    if (!date) return 'N/A'

                    return new Date(`${date}T00:00:00`).toLocaleDateString(
                      'en-GB',
                      {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      }
                    )
                  }

                  return (
                    <div className="my-orders-list history-list">
                      {historyBookings.map((booking) => {
                        const isCancelled = booking.status === 'cancelled'

                        return (
                          <article
                            className="my-order-card history-order-card"
                            key={booking._id}
                          >
                            <button
                              type="button"
                              className="order-details-toggle"
                              aria-expanded={expandedOrderIds.includes(booking._id)}
                              aria-label={
                                expandedOrderIds.includes(booking._id)
                                  ? 'Hide booking details'
                                  : 'Show booking details'
                              }
                              onClick={() => {
                                setExpandedOrderIds((previous) =>
                                  previous.includes(booking._id)
                                    ? previous.filter((id) => id !== booking._id)
                                    : [...previous, booking._id]
                                )
                              }}
                            >
                              {expandedOrderIds.includes(booking._id) ? '▲' : '▼'}
                            </button>

                            <div className="my-order-details">
                              <h3>
                                {booking.station?.name || 'Charging Station'}
                              </h3>

                              <p>
                                {formatDate(booking.date)}
                                {`, ${formatTime(booking.startTime)} to ${formatTime(booking.endTime)}, `}
                                {booking.durationMinutes != null
                                  ? `${booking.durationMinutes} minutes`
                                  : booking.startTime && booking.endTime
                                    ? (() => {
                                      const toMinutes = (time) => {
                                        const [hours, minutes] = time
                                          .split(':')
                                          .map(Number)

                                        return hours * 60 + minutes
                                      }

                                      return `${toMinutes(booking.endTime) -
                                        toMinutes(booking.startTime)
                                        } minutes`
                                    })()
                                    : 'Duration unavailable'}
                              </p>

                              {expandedOrderIds.includes(booking._id) && (
                                <div className="order-extra-details">
                                  <p>
                                    <strong>Initial charge:</strong>{' '}
                                    {booking.initialCharge ?? 'Not available'}%
                                  </p>

                                  <p>
                                    <strong>Final charge:</strong>{' '}
                                    {booking.finalCharge ?? 'Not available'}%
                                  </p>

                                  <p>
                                    <strong>Battery:</strong>{' '}
                                    {booking.battery?.name ||
                                      booking.batteryName ||
                                      (typeof booking.battery === 'string'
                                        ? booking.battery
                                        : null) ||
                                      'Battery details unavailable'}
                                  </p>
                                </div>
                              )}
                            </div>

                            <span
                              className={`history-status ${isCancelled
                                ? 'history-status-cancelled'
                                : 'history-status-completed'
                                }`}
                            >
                              {isCancelled ? 'Cancelled' : 'Completed'}
                            </span>
                          </article>
                        )
                      })}
                    </div>
                  )
                })()
              )}

            </section>

          ) : activeSection === 'host' ? (
            <section className="consumer-placeholder host-page">
              <div className="host-dashboard">
                <h2>Host Dashboard</h2>
                <p>Make your charger available to local EV drivers and manage your station details here.</p>

                <button
                  type="button"
                  className="consumer-back"
                  onClick={() => setActiveSection('main')}
                >
                  ← Back to Dashboard
                </button>

                <div className="host-dashboard-actions">
                  <h3>Manage Your Charging Stations</h3>
                  <p>Add your charging station and make it available for EV drivers.</p>

                  <button
                    type="button"
                    onClick={() => {
                      setHostStationForm({ ...emptyHostStationForm })
                      setShowHostStationForm(true)
                      setHostStationError('')
                      setHostStationMessage('')
                      setHostStationToDelete(null)
                    }}
                  >
                    + Add Charging Station
                  </button>
                  <div className="host-setup-steps">
                    <strong>How hosting works</strong>
                    <span>Add your charger details</span>
                    <span>Drivers find it in station search</span>
                    <span>Update the listing when details change</span>
                  </div>
                </div>


                <div className="host-station-list">
                  {hostStationsLoading ? (
                    <p role="status">Loading your charging stations...</p>
                  ) : hostStationsError ? (
                    <p className="booking-error" role="alert">{hostStationsError}</p>
                  ) : hostedStations.length === 0 ? (
                    <div className="host-empty-state">
                      <h3>Your station listings will appear here</h3>
                      <p>You have not added a charging station yet. Start with the charger type, connector, power, and location.</p>
                      <button type="button" onClick={() => {
                        setHostStationForm({ ...emptyHostStationForm })
                        setShowHostStationForm(true)
                        setHostStationError('')
                        setHostStationMessage('')
                        setHostStationToDelete(null)
                      }}>Add your first station</button>
                    </div>
                  ) : (
                    hostedStations.map((station) => (
                      <div
                        className="host-station-card"
                        key={station._id || station.id || station.stationCode}
                      >
                        <div className="host-station-card-details">
                          <h4>{station.name}</h4>

                          <p>
                            <strong>Address:</strong> {station.address || 'Not provided'}
                          </p>

                          <p>
                            <strong>Description:</strong> {station.description || 'Not provided'}
                          </p>

                          <p>
                            <strong>Area:</strong> {station.area || 'Not provided'}
                          </p>

                          <p>
                            <strong>Station type:</strong>{' '}
                            {station.stationType || 'Not provided'}
                          </p>

                          <p>
                            <strong>Opening hours:</strong>{' '}
                            {station.openingHours || 'Not provided'}
                          </p>

                          <p>
                            <strong>Chargers:</strong>{' '}
                            {Array.isArray(station.chargers) && station.chargers.length > 0
                              ? station.chargers
                                .map((charger) =>
                                  typeof charger === 'string'
                                    ? charger
                                    : `${charger.powerOutputKW != null ? `${charger.powerOutputKW} kW ` : ''}${charger.chargingMode || charger.chargerType || 'Charger'}${charger.connectorTypes?.length ? ` · ${charger.connectorTypes.join(', ')}` : ''}`
                                )
                                .join('; ')
                              : 'Not provided'}
                          </p>

                          <p>
                            <strong>Pricing:</strong>{' '}
                            {describeStationPricing(station.pricing)}
                          </p>

                          <p>
                            <strong>Amenities:</strong>{' '}
                            {Array.isArray(station.amenities) && station.amenities.length > 0
                              ? station.amenities
                                .map((amenity) =>
                                  typeof amenity === 'string'
                                    ? amenity
                                    : amenity.name || amenity.label || 'Amenity'
                                )
                                .join(', ')
                              : 'Not provided'}
                          </p>
                        </div>

                        <div className="host-station-card-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setHostStationError('')
                              setHostStationMessage('')
                              setHostStationToDelete(null)
                              const firstCharger = station.chargers?.[0] || {}
                              const [openingTime = '09:00', closingTime = '21:00'] = (station.openingHours || '').split('-')
                              setHostStationForm({
                                ...emptyHostStationForm,
                                name: station.name || '',
                                address: station.address || '',
                                area: station.area || '',
                                city: station.city || '',
                                state: station.state || '',
                                pincode: station.pincode || '',
                                description: station.description || '',
                                stationType: station.stationType || 'residential',
                                openingTime,
                                closingTime,
                                chargerType: firstCharger.chargerType || 'AC',
                                connectorTypes: firstCharger.connectorTypes || ['Type 2'],
                                powerOutputKW: String(firstCharger.powerOutputKW ?? 7.4),
                                totalPorts: String(firstCharger.totalPorts ?? 1),
                                pricePerKwh: String(station.pricing?.pricePerKWh ?? 0),
                                amenities: station.amenities || [],
                                latitude: String(station.location?.coordinates?.[1] ?? ''),
                                longitude: String(station.location?.coordinates?.[0] ?? ''),
                              })
                              setShowHostStationForm(true)
                            }}
                          >
                            Use as template
                          </button>

                          {/* <button
                            type="button"
                            onClick={() => {
                              setHostStationError('')
                              setHostStationMessage('')
                              setHostStationToDelete(station)
                            }}
                          >
                            Delete
                          </button> */}
                        </div>
                      </div>
                    ))
                  )}
                </div>


                {showHostStationForm && (

                  <div className="host-station-form">
                    <h3>Add Charging Station</h3>

                    {hostStationError && (
                      <p className="booking-error">{hostStationError}</p>
                    )}

                    {hostStationMessage && (
                      <p className="success-message">{hostStationMessage}</p>
                    )}

                    <form

                      onSubmit={async (event) => {
                        event.preventDefault()

                        setHostStationError('')
                        setHostStationMessage('')
                        setHostStationSaving(true)

                        try {
                          const response = await fetch(
                            '/api/charging-stations',
                            {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              credentials: 'include',
                              body: JSON.stringify(hostStationForm),
                            }
                          )

                          const data = await response.json()

                          if (!response.ok) {
                            throw new Error(data.message || 'Failed to save charging station.')
                          }

                          setHostStationMessage('Charging station saved successfully.')
                          console.log('Saved charging station:', data.station)

                          await fetchHostedStations()
                          setShowHostStationForm(false)
                          setHostStationForm({ ...emptyHostStationForm })
                        } catch (error) {
                          console.error('Error saving charging station:', error)
                          setHostStationError(error.message || 'Failed to save charging station.')
                        } finally {
                          setHostStationSaving(false)
                        }
                      }}



                    >



                      <label>
                        Station Name *
                        <input
                          type="text"
                          required
                          value={hostStationForm.name}
                          onChange={(event) =>
                            setHostStationForm({ ...hostStationForm, name: event.target.value })
                          }
                        />
                      </label>

                      <label>
                        Address *
                        <input
                          type="text"
                          required
                          value={hostStationForm.address}
                          onChange={(event) =>
                            setHostStationForm({ ...hostStationForm, address: event.target.value })
                          }
                        />
                      </label>

                      <div>
                        <button
                          type="button"
                          onClick={resolveHostCoordinates}
                          disabled={hostCoordinatesLoading}
                        >
                          {hostCoordinatesLoading ? 'Finding Coordinates...' : 'Find Coordinates'}
                        </button>

                        {hostStationForm.latitude && hostStationForm.longitude && (
                          <p>
                            Coordinates: {hostStationForm.latitude}, {hostStationForm.longitude}
                          </p>
                        )}
                      </div>

                      <label>
                        Area *
                        <input
                          type="text"
                          required
                          value={hostStationForm.area}
                          onChange={(event) =>
                            setHostStationForm({ ...hostStationForm, area: event.target.value })
                          }
                        />
                      </label>

                      <label>
                        City *
                        <input
                          type="text"
                          required
                          value={hostStationForm.city}
                          onChange={(event) =>
                            setHostStationForm({ ...hostStationForm, city: event.target.value })
                          }
                        />
                      </label>

                      <label>
                        State *
                        <input
                          type="text"
                          required
                          value={hostStationForm.state}
                          onChange={(event) =>
                            setHostStationForm({ ...hostStationForm, state: event.target.value })
                          }
                        />
                      </label>

                      <label>
                        PIN Code *
                        <input
                          type="text"
                          required
                          pattern="[0-9]{6}"
                          maxLength={6}
                          value={hostStationForm.pincode}
                          onChange={(event) =>
                            setHostStationForm({ ...hostStationForm, pincode: event.target.value })
                          }
                        />
                      </label>

                      <label>
                        Station Type
                        <select
                          value={hostStationForm.stationType}
                          onChange={(event) =>
                            setHostStationForm({ ...hostStationForm, stationType: event.target.value })
                          }
                        >
                          <option value="residential">Residential</option>
                          <option value="commercial">Commercial</option>
                          <option value="public">Public</option>
                        </select>
                      </label>

                      <label>
                        Description
                        <textarea
                          value={hostStationForm.description}
                          onChange={(event) =>
                            setHostStationForm({ ...hostStationForm, description: event.target.value })
                          }
                        />
                      </label>

                      <label>
                        Opening Time *
                        <input
                          type="time"
                          required
                          value={hostStationForm.openingTime}
                          onChange={(event) =>
                            setHostStationForm({ ...hostStationForm, openingTime: event.target.value })
                          }
                        />
                      </label>

                      <label>
                        Closing Time *
                        <input
                          type="time"
                          required
                          value={hostStationForm.closingTime}
                          onChange={(event) =>
                            setHostStationForm({ ...hostStationForm, closingTime: event.target.value })
                          }
                        />
                      </label>

                      <label>
                        Charger Type
                        <select
                          value={hostStationForm.chargerType}
                          onChange={(event) =>
                            setHostStationForm({ ...hostStationForm, chargerType: event.target.value })
                          }
                        >
                          <option value="AC">AC</option>
                          <option value="DC">DC</option>
                        </select>
                      </label>

                      <label>
                        Connector Types
                        <input
                          type="text"
                          value={(hostStationForm.connectorTypes || []).join(', ')}
                          placeholder="Type 2, CCS2"
                          onChange={(event) =>
                            setHostStationForm({
                              ...hostStationForm,
                              connectorTypes: event.target.value
                                .split(',')
                                .map((item) => item.trim())
                                .filter(Boolean)
                            })
                          }
                        />
                      </label>

                      <label>
                        Power Output (kW) *
                        <input
                          type="number"
                          required
                          min="0.1"
                          step="0.1"
                          value={hostStationForm.powerOutputKW}
                          onChange={(event) =>
                            setHostStationForm({ ...hostStationForm, powerOutputKW: event.target.value })
                          }
                        />
                      </label>

                      <label>
                        Total Ports *
                        <input
                          type="number"
                          required
                          min="1"
                          step="1"
                          value={hostStationForm.totalPorts}
                          onChange={(event) =>
                            setHostStationForm({ ...hostStationForm, totalPorts: event.target.value })
                          }
                        />
                      </label>

                      <label>
                        Price per kWh *
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          value={hostStationForm.pricePerKwh}
                          onChange={(event) =>
                            setHostStationForm({ ...hostStationForm, pricePerKwh: event.target.value })
                          }
                        />
                      </label>

                      <label>
                        Latitude
                        <input
                          type="number"
                          step="any"
                          min="-90"
                          max="90"
                          value={hostStationForm.latitude}
                          onChange={(event) =>
                            setHostStationForm({ ...hostStationForm, latitude: event.target.value })
                          }
                        />
                      </label>

                      <label>
                        Longitude
                        <input
                          type="number"
                          step="any"
                          min="-180"
                          max="180"
                          value={hostStationForm.longitude}
                          onChange={(event) =>
                            setHostStationForm({ ...hostStationForm, longitude: event.target.value })
                          }
                        />
                      </label>

                      <label>
                        Amenities (comma-separated)
                        <input
                          type="text"
                          value={hostStationForm.amenities.join(', ')}
                          placeholder="Parking, CCTV, Restroom"
                          onChange={(event) =>
                            setHostStationForm({
                              ...hostStationForm,
                              amenities: event.target.value
                                .split(',')
                                .map((item) => item.trim())
                                .filter(Boolean)
                            })
                          }
                        />
                      </label>

                      <div className="host-station-form-actions">
                        <button type="submit" disabled={hostStationSaving}>{hostStationSaving ? 'Saving station…' : 'Save charging station'}</button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowHostStationForm(false)
                            setHostStationError('')
                            setHostStationMessage('')
                          }}
                        >
                          Close
                        </button>
                      </div>
                    </form>
                  </div>

                )}
              </div>
            </section>

          ) : activeTab === 'profile' ? (

            <section className="consumer-placeholder profile-page">
              <div className="profile-hero">
                <div className="profile-photo-wrap">
                  {loggedInConsumer?.profilePhoto
                    ? <img className="profile-photo" src={loggedInConsumer.profilePhoto} alt="Your profile" />
                    : <div className="profile-photo profile-photo-default" aria-label="Default EV avatar">🚙</div>}
                  <label className="profile-photo-edit" title="Change profile photo">
                    ✎
                    <input type="file" accept="image/*" onChange={handleSaveProfilePhoto} disabled={photoSaving} />
                  </label>
                </div>
                <h2>Welcome, {profileForm.firstName || loggedInConsumer?.firstName || 'EV Driver'}!</h2>
              </div>

              {profileMode === 'view' && (
                <section className="first-visit-guide" aria-labelledby="first-visit-title">
                  <div className="first-visit-copy">
                    <p className="first-visit-eyebrow">BEE CHARGING</p>
                    <h3 id="first-visit-title">Your next charge starts here</h3>
                    <p>Find a compatible community charger, choose a time, and keep every reservation in My Orders.</p>
                    <div className="first-visit-actions">
                      <button type="button" className="button button-primary" onClick={() => { setActiveSection('main'); setActiveTab('book') }}>Find a Charging Station</button>
                      <button type="button" className="button button-secondary" onClick={() => setActiveSection('orders')}>View My Orders</button>
                      <button type="button" className="first-visit-text-action" onClick={startBatteryRegistration}>Register Your EV</button>
                      <button type="button" className="first-visit-text-action" onClick={() => setActiveSection('host')}>Share your charger</button>
                    </div>
                  </div>
                  <div className="first-visit-steps" aria-label="How charging works">
                    <span><b>1</b> Add your EV</span>
                    <span><b>2</b> Find a compatible station</span>
                    <span><b>3</b> Choose a time and book</span>
                  </div>
                </section>
              )}

              {profileMessage && (
                <p className="message" role="status">{profileMessage}</p>
              )}

              <div className="profile-name-fields">
                {[
                  ['firstName', 'First Name', true],
                  ['middleName', 'Middle Name', false],
                  ['lastName', 'Last Name', true],
                ].map(([field, label, required]) => (
                  <div className="profile-name-row" key={field}>
                    <label htmlFor={`profile-${field}`}>{label}</label>
                    <div className="profile-name-input-wrap">
                      <input
                        id={`profile-${field}`}
                        value={editingNameField === field ? nameDraft : profileForm[field]}
                        readOnly={editingNameField !== field}
                        required={required}
                        onChange={(event) => setNameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            setEditingNameField(null)
                            setNameDraft('')
                          }
                        }}
                      />
                      {editingNameField !== field ? (
                        <button
                          type="button"
                          className="icon-edit-button"
                          aria-label={`Edit ${label.toLowerCase()}`}
                          onClick={() => {
                            setEditingNameField(field)
                            setNameDraft(profileForm[field] || '')
                            window.setTimeout(() => document.getElementById(`profile-${field}`)?.focus(), 0)
                          }}
                        >✎</button>
                      ) : (
                        <div className="inline-edit-actions">
                          <button type="button" onClick={(event) => handleSaveName(event, field)}>Save</button>
                          <button type="button" onClick={() => { setEditingNameField(null); setNameDraft('') }}>Cancel</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="consumer-info profile-contact-info">
                <p><strong>Email:</strong> {loggedInConsumer?.email || 'Not added'}</p>
                <p><strong>Mobile:</strong> {loggedInConsumer?.mobileNumber || 'Not added'}</p>
              </div>

              <div className="profile-list-section">
                <h3>Saved Addresses</h3>

                {savedAddresses.length === 0 ? (
                  <p>No saved addresses yet. Add your home or another frequent location.</p>
                ) : (
                  savedAddresses.map((address) => (
                    <div className="consumer-info profile-item-card" key={address.id}>
                      <p><strong>{address.nickname}</strong></p>
                      <p>
                        {address.house}, {address.street}
                        {address.landmark ? `, ${address.landmark}` : ''}
                      </p>
                      <p>{address.city}, {address.state} - {address.pincode}</p>
                      <div className="profile-item-actions">
                        <button
                          type="button"
                          className="back-button"
                          onClick={() => {
                            setAddressForm({
                              nickname: address.nickname,
                              house: address.house,
                              street: address.street,
                              landmark: address.landmark || '',
                              city: address.city,
                              state: address.state,
                              pincode: address.pincode,
                            })
                            setEditingAddressId(address.id)
                            setProfileMode('address')
                            setProfileMessage('')
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="back-button"
                          onClick={() => handleDeleteAddress(address.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}

                {profileMode === 'address' ? (
                  <form onSubmit={handleSaveAddress}>
                    <h4>{editingAddressId ? 'Edit Address' : 'Add Address'}</h4>

                    {[
                      ['nickname', 'Address name (e.g. Home)'],
                      ['house', 'House / Flat / Building'],
                      ['street', 'Street / Area'],
                      ['landmark', 'Landmark (optional)'],
                      ['city', 'City'],
                      ['state', 'State'],
                      ['pincode', 'PIN Code'],
                    ].map(([name, label]) => (
                      <div className="form-group" key={name}>
                        <label htmlFor={`address-${name}`}>{label}</label>
                        <input
                          id={`address-${name}`}
                          value={addressForm[name]}
                          onChange={(event) =>
                            setAddressForm((current) => ({
                              ...current,
                              [name]: event.target.value,
                            }))
                          }
                          required={name !== 'landmark'}
                          inputMode={name === 'pincode' ? 'numeric' : undefined}
                          maxLength={name === 'pincode' ? 6 : undefined}
                          pattern={name === 'pincode' ? '[0-9]{6}' : undefined}
                        />
                      </div>
                    ))}

                    <button type="submit" className="button button-primary">
                      {editingAddressId ? 'Update Address' : 'Save Address'}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        setProfileMode('view')
                        setEditingAddressId(null)
                        setAddressForm({
                          nickname: '',
                          house: '',
                          street: '',
                          landmark: '',
                          city: '',
                          state: '',
                          pincode: '',
                        })
                        setProfileMessage('')
                      }}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => {
                      setAddressForm({
                        nickname: `Address ${savedAddresses.length + 1}`,
                        house: '',
                        street: '',
                        landmark: '',
                        city: '',
                        state: '',
                        pincode: '',
                      })
                      setEditingAddressId(null)
                      setProfileMode('address')
                      setProfileMessage('')
                    }}
                  >
                    + Add Address
                  </button>
                )}
              </div>

              <div className="profile-list-section">
                <h3>Saved Batteries</h3>

                {savedBatteries.length === 0 ? (
                  <p>No battery profiles added yet.</p>
                ) : (
                  savedBatteries.map((battery) => (
                    <div className="consumer-info profile-item-card" key={battery.id}>
                      <p><strong>{battery.name}</strong></p>
                      <p>{battery.vehicleMake} {battery.vehicleModel}</p>
                      <p>{battery.capacityKwh} kWh · {battery.batteryChemistry || 'Other/Unknown'}</p>
                      <p>Connectors: {(battery.connectorTypes || []).join(', ') || battery.connectorType || 'Not specified'}</p>
                      <p>Maximum AC: {battery.maxAcChargingPowerKw ? `${battery.maxAcChargingPowerKw} kW` : 'Not supported / not specified'} · Maximum DC: {battery.maxDcChargingPowerKw ? `${battery.maxDcChargingPowerKw} kW` : 'Not supported / not specified'}</p>
                      <div className="profile-item-actions">
                        <button
                          type="button"
                          className="back-button"
                          onClick={() => {
                            setBatteryForm({
                              name: battery.name,
                              vehicleMake: battery.vehicleMake,
                              vehicleModel: battery.vehicleModel,
                              capacityKwh: battery.capacityKwh,
                              batteryChemistry: battery.batteryChemistry || 'Other/Unknown',
                              connectorTypes: battery.connectorTypes?.length ? battery.connectorTypes : (battery.connectorType ? [battery.connectorType] : []),
                              maxAcChargingPowerKw: battery.maxAcChargingPowerKw ?? '',
                              maxDcChargingPowerKw: battery.maxDcChargingPowerKw ?? '',
                            })
                            setEditingBatteryId(battery.id)
                            setSelectedEvProfileId('')
                            setSelectedEvVariantId('')
                            setEvProfileMode('choose')
                            setEvProfileReviewed(false)
                            setProfileMode('battery')
                            setProfileMessage('')
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="back-button"
                          onClick={() => handleDeleteBattery(battery.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}

                {profileMode === 'battery' ? (
                  <form onSubmit={handleSaveBattery}>
                    <h4>{editingBatteryId ? 'Edit Battery' : 'Add Battery'}</h4>

                    {!editingBatteryId && (
                      <section className="ev-profile-picker" aria-label="Predefined EV profiles">
                        {evProfileMode === 'profile' && selectedEvProfile ? (
                          <div className="ev-profile-selected" aria-live="polite">
                            <div className="ev-profile-selected-heading">
                              <div>
                                <span className={`ev-profile-status ev-profile-status-${selectedEvProfile.verificationStatus}`}>
                                  {selectedEvProfile.verificationStatus === 'unverified' ? 'Needs verification' : 'Profile selected'}
                                </span>
                                <h5>{selectedEvProfile.make} {selectedEvProfile.model}</h5>
                                <p>{selectedEvProfile.summary}</p>
                              </div>
                              <button type="button" className="ev-profile-clear" onClick={clearEvProfile}>Clear selection</button>
                            </div>

                            {selectedEvProfile.variants.length > 0 && (
                              <div className="form-group ev-profile-variant-field">
                                <label htmlFor="battery-profile-variant">Choose your battery / trim</label>
                                <select
                                  id="battery-profile-variant"
                                  value={selectedEvVariantId}
                                  onChange={(event) => chooseEvVariant(event.target.value)}
                                  required
                                >
                                  <option value="">Select the exact variant to fill supported specifications</option>
                                  {selectedEvProfile.variants.map((variant) => (
                                    <option key={variant.id} value={variant.id}>{variant.label}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <div className="ev-profile-review-grid" aria-label="Specifications currently filled in the form">
                              <div><span>Battery capacity</span><strong>{batteryForm.capacityKwh ? `${batteryForm.capacityKwh} kWh` : 'Enter exact variant capacity'}</strong></div>
                              <div><span>Chemistry</span><strong>{batteryForm.batteryChemistry || 'Choose / confirm'}</strong></div>
                              <div><span>Connectors</span><strong>{batteryForm.connectorTypes.length ? batteryForm.connectorTypes.join(', ') : 'Select for your vehicle'}</strong></div>
                              <div><span>Max AC</span><strong>{batteryForm.maxAcChargingPowerKw ? `${batteryForm.maxAcChargingPowerKw} kW` : 'Confirm for variant'}</strong></div>
                              <div><span>Max DC</span><strong>{batteryForm.maxDcChargingPowerKw ? `${batteryForm.maxDcChargingPowerKw} kW` : 'Confirm or leave unknown'}</strong></div>
                            </div>
                            <p className="ev-profile-power-note">Unknown power limits are left blank rather than guessed. A charging estimate or booking may be unavailable for a charger mode until you add the exact vehicle limit.</p>

                            <ul className="ev-profile-notes">
                              {selectedEvProfile.specificationNotes.map((note, index) => (
                                <li className={`ev-profile-note ev-profile-note-${note.status}`} key={`${selectedEvProfile.id}-note-${index}`}>
                                  <span>{note.status === 'verified' ? 'Verified' : note.status === 'variant' ? 'Variant note' : 'Unverified'}</span>
                                  {note.text}
                                </li>
                              ))}
                            </ul>

                            {selectedEvProfile.sources.length > 0 && (
                              <div className="ev-profile-sources">
                                <span>Reference material</span>
                                {selectedEvProfile.sources.map((source) => (
                                  <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}</a>
                                ))}
                              </div>
                            )}

                            <label className="ev-profile-confirm">
                              <input
                                type="checkbox"
                                checked={evProfileReviewed}
                                onChange={(event) => setEvProfileReviewed(event.target.checked)}
                              />
                              <span>I reviewed these starter values for my vehicle. I’ll confirm or edit variant-specific details before saving.</span>
                            </label>
                          </div>
                        ) : evProfileMode === 'custom' ? (
                          <div className="ev-profile-custom">
                            <div>
                              <strong>Custom EV</strong>
                              <p>Enter your vehicle and battery details manually. Nothing has been prefilled.</p>
                            </div>
                            <button type="button" className="ev-profile-browse" onClick={() => setEvProfileMode('choose')}>Browse EV profiles</button>
                          </div>
                        ) : (
                          <>
                            <div className="ev-profile-picker-heading">
                              <div>
                                <h5>Choose your EV</h5>
                                <p>Pick a model to prefill the details we can verify. You can edit every field.</p>
                              </div>
                              <button type="button" className="ev-profile-browse" onClick={chooseCustomEv}>Other / Add Custom EV</button>
                            </div>
                            <label className="ev-profile-search">
                              <span className="sr-only">Search EV profiles</span>
                              <span aria-hidden="true">⌕</span>
                              <input
                                type="search"
                                value={evProfileSearch}
                                onChange={(event) => setEvProfileSearch(event.target.value)}
                                placeholder="Search by make or model"
                                autoComplete="off"
                              />
                            </label>
                            <div className="ev-profile-options">
                              {EV_BATTERY_PROFILES.filter((profile) => `${profile.make} ${profile.model} ${profile.searchTerms.join(' ')}`.toLowerCase().includes(evProfileSearch.trim().toLowerCase())).map((profile) => (
                                <button type="button" className="ev-profile-option" key={profile.id} onClick={() => chooseEvProfile(profile)}>
                                  <span className="ev-profile-option-top"><strong>{profile.make} {profile.model}</strong><span>{profile.verificationStatus === 'unverified' ? 'Check specs' : 'Profile'}</span></span>
                                  <span className="ev-profile-option-summary">{profile.summary}</span>
                                  <span className="ev-profile-option-chemistry">Chemistry: {profile.batteryChemistry === 'LFP' ? 'LFP (manufacturer listed)' : 'Not confirmed'}</span>
                                </button>
                              ))}
                              {EV_BATTERY_PROFILES.filter((profile) => `${profile.make} ${profile.model} ${profile.searchTerms.join(' ')}`.toLowerCase().includes(evProfileSearch.trim().toLowerCase())).length === 0 && (
                                <p className="ev-profile-empty">No matching model. Use “Other / Add Custom EV” to continue manually.</p>
                              )}
                            </div>
                          </>
                        )}
                      </section>
                    )}

                    {[
                      ['name', 'Battery profile name', 'text'],
                      ['vehicleMake', 'Vehicle make', 'text'],
                      ['vehicleModel', 'Vehicle model', 'text'],
                      ['capacityKwh', 'Battery capacity (kWh)', 'number'],
                    ].map(([name, label, type]) => (
                      <div className="form-group" key={name}>
                        <label htmlFor={`battery-${name}`}>{label}</label>
                        <input
                          id={`battery-${name}`}
                          type={type}
                          min={type === 'number' ? '0.1' : undefined}
                          step={type === 'number' ? 'any' : undefined}
                          value={batteryForm[name]}
                          onChange={(event) => setBatteryForm((current) => ({ ...current, [name]: event.target.value }))}
                          required
                        />
                      </div>
                    ))}

                    <div className="form-group">
                      <label htmlFor="battery-chemistry">Battery chemistry</label>
                      <select
                        id="battery-chemistry"
                        value={batteryForm.batteryChemistry}
                        onChange={(event) => setBatteryForm((current) => ({ ...current, batteryChemistry: event.target.value }))}
                        required
                      >
                        <option value="">Select battery chemistry</option>
                        <option value="LFP">LFP — Lithium Iron Phosphate</option>
                        <option value="NMC">NMC — Nickel Manganese Cobalt</option>
                        <option value="Other/Unknown">Other / Unknown</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Supported connector types (select all that apply)</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '8px' }}>
                        {[
                          ['Type 2', 'Type 2 (AC)'],
                          ['CCS2', 'CCS2 (DC)'],
                          ['CHAdeMO', 'CHAdeMO (DC)'],
                          ['Bharat AC-001', 'Bharat AC-001'],
                          ['Bharat DC-001', 'Bharat DC-001'],
                          ['Type 1', 'Type 1 (AC)'],
                          ['CCS1', 'CCS1 (DC)'],
                          ['GB/T AC', 'GB/T AC'],
                          ['GB/T DC', 'GB/T DC'],
                          ['Other', 'Other / adapter-dependent'],
                        ].map(([value, label]) => (
                          <label key={value} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 400 }}>
                            <input
                              type="checkbox"
                              style={{ width: 'auto', padding: 0, margin: 0 }}
                              checked={batteryForm.connectorTypes.includes(value)}
                              onChange={(event) => setBatteryForm((current) => ({
                                ...current,
                                connectorTypes: event.target.checked
                                  ? [...current.connectorTypes, value]
                                  : current.connectorTypes.filter((item) => item !== value),
                              }))}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>

                    <p className="message">Enter your vehicle’s charging limits, not the station’s output power. Unknown or variant-specific limits may be left blank; estimates for that charging mode will stay unavailable until you confirm the value.</p>

                    <div className="form-group">
                      <label htmlFor="battery-maxAcChargingPowerKw">Maximum AC charging power (kW)</label>
                      <input
                        id="battery-maxAcChargingPowerKw"
                        type="number"
                        min="0.1"
                        step="any"
                        placeholder="Leave blank if AC charging is unsupported"
                        value={batteryForm.maxAcChargingPowerKw}
                        onChange={(event) => setBatteryForm((current) => ({ ...current, maxAcChargingPowerKw: event.target.value }))}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="battery-maxDcChargingPowerKw">Maximum DC charging power (kW)</label>
                      <input
                        id="battery-maxDcChargingPowerKw"
                        type="number"
                        min="0.1"
                        step="any"
                        placeholder="Leave blank if DC charging is unsupported"
                        value={batteryForm.maxDcChargingPowerKw}
                        onChange={(event) => setBatteryForm((current) => ({ ...current, maxDcChargingPowerKw: event.target.value }))}
                      />
                    </div>

                    <button type="submit" className="button button-primary">
                      {editingBatteryId ? 'Update Battery' : 'Save Battery'}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        setProfileMode('view')
                        setEditingBatteryId(null)
                        setBatteryForm({ ...emptyBatteryForm })
                        setSelectedEvProfileId('')
                        setSelectedEvVariantId('')
                        setEvProfileMode('choose')
                        setEvProfileReviewed(false)
                        setProfileMessage('')
                      }}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => {
                      setBatteryForm({ ...emptyBatteryForm, name: `Battery ${savedBatteries.length + 1}` })
                      setEditingBatteryId(null)
                      setSelectedEvProfileId('')
                      setSelectedEvVariantId('')
                      setEvProfileMode('choose')
                      setEvProfileSearch('')
                      setEvProfileReviewed(false)
                      setProfileMode('battery')
                      setProfileMessage('')
                    }}
                  >
                    + Add Battery
                  </button>
                )}
              </div>
            </section>
          ) : (
            <section className="book-slot-page">
              {bookSelectionView === 'main' ? (
                <>
                  {!selectedStationId && (
                    <div
                      className="booking-sticky-stack"
                      style={{
                        position: 'static',
                        top: 'auto',
                        zIndex: 19,
                        background: '#FFFFFF',
                        paddingBottom: 0,
                        marginBottom: '10px',
                      }}
                    >
                      <div
                        className="booking-topbar"
                        aria-label="Booking preferences"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                          gap: 0,
                          marginBottom: 0,
                          padding: '7px 10px',
                          border: '1px solid #F4F4F4',
                          borderBottom: 0,
                          borderRadius: '14px 14px 0 0',
                          background: '#FFFFFF',
                          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                        }}
                      >
                        <button
                          type="button"
                          className="booking-topbar-item booking-topbar-address"
                          onClick={() => setBookSelectionView('address')}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, width: '100%', padding: '10px 12px', border: 0, borderRight: '1px solid #F4F4F4', borderBottom: 0, borderRadius: 0, background: 'transparent', textAlign: 'left' }}
                        >
                          <span className="booking-topbar-icon">⌖</span>
                          <span className="booking-topbar-text"><small>CHARGING NEAR</small><strong>{selectedBookingAddress ? (selectedBookingAddress.id === 'current-location' ? ([selectedBookingAddress.house, selectedBookingAddress.street].filter(Boolean).join(', ') || selectedBookingAddress.landmark || 'Current Location') : ([selectedBookingAddress.house, selectedBookingAddress.street].filter(Boolean).join(', ') || selectedBookingAddress.nickname)) : 'Select address'}</strong><em>{selectedBookingAddress ? (selectedBookingAddress.id === 'current-location' ? [selectedBookingAddress.landmark, selectedBookingAddress.city, selectedBookingAddress.state].filter(Boolean).join(', ') || 'Current location detected' : [selectedBookingAddress.landmark, selectedBookingAddress.city].filter(Boolean).join(', ')) : 'Choose where to charge'}</em></span>
                          <span className="booking-topbar-edit">{selectedBookingAddress ? <><span aria-hidden="true">✎</span> Edit</> : <><span aria-hidden="true">＋</span> Select</>}</span>
                        </button>
                        <button
                          type="button"
                          className="booking-topbar-item booking-topbar-battery"
                          onClick={() => setBookSelectionView('battery')}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, width: '100%', padding: '10px 12px', border: 0, borderRadius: 0, background: 'transparent', textAlign: 'left' }}
                        >
                          <span className="booking-topbar-icon">🔋</span>
                          <span className="booking-topbar-text"><small>MY VEHICLE / BATTERY</small><strong>{selectedBookingBattery ? selectedBookingBattery.name : 'Select battery'}</strong><em>{selectedBookingBattery ? [[selectedBookingBattery.vehicleMake, selectedBookingBattery.vehicleModel].filter(Boolean).join(' ').trim(), `${selectedBookingBattery.capacityKwh || '—'} kWh`, ...((selectedBookingBattery.connectorTypes && selectedBookingBattery.connectorTypes.length) ? selectedBookingBattery.connectorTypes : (selectedBookingBattery.connectorType ? [selectedBookingBattery.connectorType] : []))].filter(Boolean).join(' · ') : 'Choose your vehicle and battery'}</em></span>
                          <span className="booking-topbar-edit">{selectedBookingBattery ? <><span aria-hidden="true">✎</span> Edit</> : <><span aria-hidden="true">＋</span> Select</>}</span>
                        </button>
                      </div>
                      <div className="booking-controls" aria-label="Charging preferences" style={{ marginTop: 0, marginBottom: 0, paddingTop: '10px', paddingBottom: '10px', borderTop: 0, borderRadius: '0 0 14px 14px' }}>
                        <label className="booking-control booking-date-control">
                          <span>Charging Date</span>
                          <input
                            type="date"
                            value={selectedBookingDate}
                            min={getLocalDateInputValue()}
                            onChange={(event) => {
                              setSelectedBookingDate(event.target.value || getLocalDateInputValue())
                              setSelectedTimeSlot(null)
                            }}
                            aria-label="Choose charging date"
                          />
                        </label>
                        <label className="booking-control">
                          <span>Initial Charge</span>
                          <select value={initialCharge} onChange={(event) => {
                            const next = Number(event.target.value)
                            setInitialCharge(next)
                            if (next >= finalCharge) setFinalCharge(Math.min(100, next + 10))
                          }}>
                            {Array.from({ length: 21 }, (_, index) => index * 5).map((value) => (
                              <option key={value} value={value}>{value}%</option>
                            ))}
                          </select>
                        </label>
                        <label className="booking-control">
                          <span>Final Charge</span>
                          <select value={finalCharge} onChange={(event) => {
                            const next = Number(event.target.value)
                            if (next > initialCharge) setFinalCharge(next)
                          }}>
                            {Array.from({ length: 21 }, (_, index) => index * 5).map((value) => (
                              <option key={value} value={value} disabled={value <= initialCharge}>{value}%</option>
                            ))}
                          </select>
                        </label>
                        <div className="booking-control booking-filter-control">
                          <span>Filters <small>(select any)</small></span>
                          <div className="booking-filter-options">
                            {[
                              { value: 'distance', label: 'Distance' },
                              { value: 'chargingTime', label: 'Charging Time' },
                              { value: 'cost', label: 'Cost' },
                            ].map((filter) => (
                              <label key={filter.value} className={`booking-filter-chip ${bookingFilters.includes(filter.value) ? 'selected' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={bookingFilters.includes(filter.value)}
                                  onChange={(event) => {
                                    setBookingFilters((current) => {
                                      if (event.target.checked) return [...current, filter.value]
                                      const next = current.filter((item) => item !== filter.value)
                                      return next.length ? next : ['distance']
                                    })
                                  }}
                                />
                                {filter.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="booking-results-scroll" style={{ marginTop: 0, paddingTop: 0 }}>
                    {!selectedBookingAddress || !selectedBookingBattery ? (
                      <div className="booking-results-empty">
                        <div className="consumer-avatar">⌖</div>
                        <h2>Ready to find a charger?</h2>
                        <p className="booking-selection-hint">Choose your address and vehicle from the fixed bar above to continue.</p>
                      </div>
                    ) : stationsLoading ? (
                      <div className="booking-results-empty" role="status"><div className="consumer-avatar">🔌</div><h2>Loading charging stations…</h2><p>Getting available stations from the server.</p></div>
                    ) : stationsError ? (
                      <div className="booking-results-empty" role="alert"><h2>Charging stations unavailable</h2><p>{stationsError}</p><button type="button" className="button button-primary" onClick={async () => { setStationsLoading(true); setStationsError(''); try { const response = await fetch('/api/charging-stations'); const data = await response.json().catch(() => ({})); if (!response.ok || data.success === false) throw new Error(data.message || 'Request failed'); setChargingStations(Array.isArray(data.stations) ? data.stations : []) } catch (error) { console.error('Charging stations retry failed:', error); setStationsError('Could not load charging stations. Check that the backend is running and try again.') } finally { setStationsLoading(false) } }}>Try again</button></div>
                    ) : (
                      (() => {
                        const compatibleStations = chargingStations.map((station) => ({ station, estimate: getStationEstimate(station, selectedBookingBattery, initialCharge, finalCharge, selectedBookingAddress) })).filter((item) => item.estimate && stationIsAvailable(item.station))
                        const sortedStations = [...compatibleStations].sort((a, b) => {
                          for (const filter of bookingFilters) {
                            if (filter === 'distance') {
                              const distanceA = roadDistancesKm[String(a.station._id || a.station.stationCode || '')]
                              const distanceB = roadDistancesKm[String(b.station._id || b.station.stationCode || '')]
                              if (distanceA != null && distanceB != null && distanceA !== distanceB) return distanceA - distanceB
                            }
                            if (filter === 'chargingTime' && a.estimate.durationMinutes != null && b.estimate.durationMinutes != null && a.estimate.durationMinutes !== b.estimate.durationMinutes) return a.estimate.durationMinutes - b.estimate.durationMinutes
                            if (filter === 'cost' && a.estimate.estimatedCost != null && b.estimate.estimatedCost != null && a.estimate.estimatedCost !== b.estimate.estimatedCost) return a.estimate.estimatedCost - b.estimate.estimatedCost
                          }
                          return String(a.station.name || '').localeCompare(String(b.station.name || ''))
                        })
                        const selectedStation = sortedStations.find(({ station }) => (station._id || station.stationCode) === selectedStationId)
                        if (selectedStation) {
                          const { station, estimate } = selectedStation
                          const stationPrice = station.pricing?.pricingModel === 'per_kwh' ? `₹${station.pricing?.pricePerKWh ?? 0}/kWh` : station.pricing?.pricingModel === 'per_minute' ? `₹${station.pricing?.pricePerMinute ?? 0}/minute` : station.pricing?.pricingModel === 'per_session' ? `₹${station.pricing?.sessionFee ?? 0}/session` : 'Variable tariff'
                          const availableSlotWindows = getAvailableSlotWindows(
                            station,
                            estimate.durationMinutes,
                            selectedBookingDate,
                            myBookings,
                            selectedBookingBattery?._id ?? selectedBookingBattery?.id
                          )
                          const stationCoordinates = station.location?.coordinates || station.coordinates
                          const originText = selectedBookingAddress?.latitude != null && selectedBookingAddress?.longitude != null
                            ? `${selectedBookingAddress.latitude},${selectedBookingAddress.longitude}`
                            : [selectedBookingAddress?.house, selectedBookingAddress?.street, selectedBookingAddress?.landmark, selectedBookingAddress?.city, selectedBookingAddress?.state].filter(Boolean).join(', ')
                          const destinationText = Array.isArray(stationCoordinates) && stationCoordinates.length >= 2
                            ? `${stationCoordinates[1]},${stationCoordinates[0]}`
                            : station.address
                          const mapUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originText || 'Current+Location')}&destination=${encodeURIComponent(destinationText)}&travelmode=driving`
                          return <section className="station-details-page" aria-label="Charging station details">
                            <div className="station-details-sticky-top">
                              <div className="station-details-summary">
                                <div className="station-details-summary-main">
                                  <h2>{station.name}</h2>
                                  <p className="station-details-address"><span aria-hidden="true">📍</span> {station.address}</p>
                                  <div className="station-details-facts">
                                    <div className="station-details-fact"><span className="station-details-fact-icon" aria-hidden="true">⚡</span><div><strong>{estimate.charger.powerOutputKW} kW {estimate.charger.chargingMode}</strong><small>Charger Power</small></div></div>
                                    <div className="station-details-fact"><span className="station-details-fact-icon" aria-hidden="true">🔌</span><div><strong>{(estimate.charger.connectorTypes || []).join(', ') || 'Not specified'}</strong><small>Connector Type</small></div></div>
                                    <div className="station-details-fact"><span className="station-details-fact-icon" aria-hidden="true">📍</span><div><strong>{roadDistancesKm[String(station._id || station.stationCode || '')] == null ? (estimate.distanceKm == null ? 'Unavailable' : `${estimate.distanceKm.toFixed(1)} km`) : `${roadDistancesKm[String(station._id || station.stationCode || '')].toFixed(1)} km`}</strong><small>Driving Distance</small></div></div>
                                    <div className="station-detail-item station-type-item">
                                      <span className="station-detail-icon" aria-hidden="true">🏷️</span>
                                      <div className="station-type-text">
                                        <strong>
                                          {station.stationType === 'residential'
                                            ? 'Private Host'
                                            : station.stationType === 'business'
                                              ? 'Commercial'
                                              : station.stationType || 'Community'}
                                        </strong>
                                        <small>Station Type</small>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div className="station-details-price-block">
                                  <div className="station-details-metric"><strong className="station-details-price">{estimate.estimatedCost == null ? 'Cost unavailable' : `₹${estimate.estimatedCost.toFixed(2)}`}</strong><small>Estimated Cost</small></div>
                                  <div className="station-details-metric"><strong className="station-details-duration">{formatDuration(estimate.durationMinutes)}</strong><small>Estimated Duration</small></div>
                                </div>
                              </div>
                              <div className="station-details-toolbar">
                                <span>{availableSlotWindows.length} matching time slots · {new Date(`${selectedBookingDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                <button type="button" className="station-details-refresh" onClick={async () => {
                                  setStationsLoading(true)
                                  setStationsError('')
                                  try {
                                    const response = await fetch('/api/charging-stations')
                                    const data = await response.json().catch(() => ({}))
                                    if (!response.ok || data.success === false) throw new Error(data.message || 'Request failed')
                                    setChargingStations(Array.isArray(data.stations) ? data.stations : [])
                                  } catch (error) {
                                    console.error('Charging stations refresh failed:', error)
                                    setStationsError('Could not refresh charging stations. Check the backend and try again.')
                                  } finally {
                                    setStationsLoading(false)
                                  }
                                }}>Refresh</button>
                              </div>
                              <a className="station-details-map-button" href={mapUrl} target="_blank" rel="noreferrer">🗺️ Map / Get directions</a>
                            </div>

                            <div className="station-details-slot-section">
                              <div className="station-details-slot-heading">
                                <div className="station-details-slot-description"><p>Showing continuous availability for at least {formatDuration(estimate.durationMinutes)} on the selected date.</p></div>
                                <span>{initialCharge}% → {finalCharge}%</span>
                              </div>
                              {estimate.durationMinutes == null && (
                                <p className="ev-booking-estimate-warning" role="status">Add the exact {String(estimate.charger.chargingMode || 'charger').toUpperCase()} charging limit to this vehicle profile before selecting a time.</p>
                              )}
                              {availableSlotWindows.length ? (
                                <div className="station-time-slot-list" style={{ display: 'grid', gap: '12px' }}>
                                  {availableSlotWindows.map((slot) => {
                                    const stationKey = String(station._id || station.stationCode)
                                    const hasSelection = selectedTimeSlot?.stationId === stationKey
                                    const isSelectedWindow = hasSelection && selectedTimeSlot?.windowId === slot.id
                                    const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
                                    const toTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
                                    const selectedStart = isSelectedWindow ? toMinutes(selectedTimeSlot.startTime) : null
                                    const selectedEnd = isSelectedWindow ? toMinutes(selectedTimeSlot.endTime) : null
                                    const slotStart = toMinutes(slot.startTime)
                                    const slotEnd = toMinutes(slot.endTime)

                                    if (isSelectedWindow && selectedStart >= slotStart && selectedEnd <= slotEnd) {
                                      const segments = []
                                      if (selectedStart > slotStart) {
                                        segments.push(
                                          <div key={`${slot.id}-before`} aria-disabled="true" style={{ padding: '14px 16px', border: '1px solid #EDEDED', borderRadius: '12px', background: '#F4F4F4', color: '#A5A5A5', cursor: 'not-allowed', opacity: 0.85 }}>
                                            <strong>{formatClockTime(slot.startTime)} – {formatClockTime(toTime(selectedStart))}</strong>
                                            <small style={{ display: 'block', marginTop: '5px' }}>Unavailable while your selection is active</small>
                                          </div>
                                        )
                                      }
                                      segments.push(
                                        <div key={`${slot.id}-selected`} style={{ padding: '14px 16px', border: '1px solid #C7FE2F', borderRadius: '12px', background: '#FFFFFF', color: '#676767', boxShadow: '0 0 0 1px rgba(7,152,121,.08)' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                            <strong>{formatClockTime(selectedTimeSlot.startTime)} – {formatClockTime(selectedTimeSlot.endTime)}</strong>
                                            <span style={{ fontSize: '12px', fontWeight: 700, padding: '4px 8px', borderRadius: '999px', background: '#F4F4F4' }}>Selected</span>
                                          </div>
                                          <small style={{ display: 'block', marginTop: '5px' }}>{formatDuration(selectedTimeSlot.durationMinutes)} · Required charging time: {formatDuration(estimate.durationMinutes)}</small>
                                          <button type="button" onClick={() => setSelectedTimeSlot(null)} style={{ marginTop: '10px', padding: '6px 0', border: 0, background: 'transparent', color: '#090708', fontWeight: 700, cursor: 'pointer' }}>Cancel selection</button>
                                        </div>
                                      )
                                      if (selectedEnd < slotEnd) {
                                        segments.push(
                                          <div key={`${slot.id}-after`} aria-disabled="true" style={{ padding: '14px 16px', border: '1px solid #EDEDED', borderRadius: '12px', background: '#F4F4F4', color: '#A5A5A5', cursor: 'not-allowed', opacity: 0.85 }}>
                                            <strong>{formatClockTime(toTime(selectedEnd))} – {formatClockTime(slot.endTime)}</strong>
                                            <small style={{ display: 'block', marginTop: '5px' }}>Unavailable while your selection is active</small>
                                          </div>
                                        )
                                      }
                                      return <React.Fragment key={slot.id}>{segments}</React.Fragment>
                                    }

                                    return (
                                      <button
                                        type="button"
                                        key={slot.id}
                                        disabled={hasSelection || estimate.durationMinutes == null}
                                        className={`station-time-slot ${hasSelection ? '' : ''}`}
                                        style={hasSelection || estimate.durationMinutes == null ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                                        onClick={() => {
                                          const requiredMinutes = Math.max(1, Number(estimate.durationMinutes || 30))
                                          const endMinutes = slotStart + requiredMinutes
                                          setBookingModalError('')
                                          setBookingModalDraft({
                                            windowId: slot.id,
                                            windowStartTime: slot.startTime,
                                            windowEndTime: slot.endTime,
                                            date: slot.date,
                                            stationId: stationKey,
                                            stationName: station.name,
                                            requiredMinutes,
                                            startTime: slot.startTime,
                                            endTime: toTime(endMinutes),
                                          })
                                        }}
                                      >
                                        <span>{formatClockTime(slot.startTime)} – {formatClockTime(slot.endTime)}</span>
                                        <small>{formatDuration(slot.durationMinutes)}</small>
                                      </button>
                                    )
                                  })}
                                </div>
                              ) : (
                                <div className="station-no-slots"><strong>No matching time slots for this date</strong><p>Choose another date or try a different compatible station. Only future start times and continuous windows long enough for your charging estimate are shown.</p></div>
                              )}
                            </div>

                            <div className="station-details-actions">
                              <button
                                type="button"
                                className="station-details-book-button"
                                disabled={!selectedTimeSlot || selectedTimeSlot.stationId !== String(station._id || station.stationCode) || bookingInProgress}
                                onClick={async () => {
                                  if (!selectedTimeSlot || selectedTimeSlot.stationId !== String(station._id || station.stationCode)) return
                                  setBookingInProgress(true)
                                  try {
                                    const response = await fetch('/api/bookings', {
                                      method: 'POST',
                                      credentials: 'include',
                                      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                                      body: JSON.stringify({
                                        stationId: String(station._id),
                                        date: selectedTimeSlot.date,
                                        startTime: selectedTimeSlot.startTime,
                                        endTime: selectedTimeSlot.endTime,
                                        batteryId: selectedBookingBattery?.id,
                                        initialCharge: Number(initialCharge),
                                        finalCharge: Number(finalCharge),
                                      }),
                                    })
                                    const data = await response.json().catch(() => ({}))
                                    if (!response.ok || data.success === false) {
                                      throw new Error(data.message || 'Could not complete this booking.')
                                    }
                                    const stationsResponse = await fetch('/api/charging-stations', { credentials: 'include' })
                                    const stationsData = await stationsResponse.json().catch(() => ({}))
                                    if (stationsResponse.ok && stationsData.success !== false) {
                                      setChargingStations(Array.isArray(stationsData.stations) ? stationsData.stations : [])
                                    }
                                    const bookingsResponse = await fetch(
                                      '/api/bookings/my',
                                      { credentials: 'include' }
                                    )

                                    if (bookingsResponse.ok) {
                                      const bookingsData = await bookingsResponse.json()
                                      setMyBookings(
                                        Array.isArray(bookingsData.bookings) ? bookingsData.bookings : []
                                      )
                                    }
                                    setSelectedTimeSlot(null)
                                    window.alert(data.message || 'Charging slot booked successfully.')
                                  } catch (error) {
                                    console.error('Booking failed:', error)
                                    window.alert(error.message || 'Booking failed. Please try again.')
                                  } finally {
                                    setBookingInProgress(false)
                                  }
                                }}
                              >{bookingInProgress ? 'Booking…' : 'Book'}</button>
                              <button type="button" className="station-details-back" onClick={() => {
                                if (selectedTimeSlot?.stationId === String(station._id || station.stationCode) && !window.confirm('Discard your selected charging time and return to the station list?')) return
                                setSelectedStationId(null)
                                setSelectedTimeSlot(null)
                                setBookingModalDraft(null)
                              }} aria-label="Back to charging station list" title="Back to station list">←</button>
                            </div>

                            {bookingModalDraft?.stationId === String(station._id || station.stationCode) && (
                              <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setBookingModalDraft(null); setBookingModalError('') } }} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(12, 25, 40, 0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px' }}>
                                <section role="dialog" aria-modal="true" aria-labelledby="booking-time-modal-title" style={{ width: 'min(100%, 460px)', background: '#FFFFFF', color: '#676767', borderRadius: '18px', padding: '22px', boxShadow: '0 24px 70px rgba(0,0,0,.28)' }}>
                                  <h2 id="booking-time-modal-title" style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: 800, color: '#1A1A1A', lineHeight: 1.25 }}>Choose your charging time</h2>
                                  <p style={{ margin: '0 0 16px', color: '#676767', fontSize: '14px' }}>{station.name} · {new Date(`${bookingModalDraft.date}T00:00:00`).toLocaleDateString()}</p>
                                  <p style={{ margin: '0 0 14px', fontSize: '14px' }}>Available window: <strong>{formatClockTime(bookingModalDraft.windowStartTime)} – {formatClockTime(bookingModalDraft.windowEndTime)}</strong></p>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    {[
                                      { key: 'startHour', label: 'Initial hour', timeKey: 'startTime', part: 'hour' },
                                      { key: 'startMinute', label: 'Initial minute', timeKey: 'startTime', part: 'minute' },
                                      { key: 'endHour', label: 'Final hour', timeKey: 'endTime', part: 'hour' },
                                      { key: 'endMinute', label: 'Final minute', timeKey: 'endTime', part: 'minute' },
                                    ].map((field) => {
                                      const current = bookingModalDraft[field.timeKey].split(':').map(Number)
                                      const value = field.part === 'hour' ? current[0] : current[1]
                                      const options = Array.from({ length: field.part === 'hour' ? 24 : 60 }, (_, index) => index)
                                      return <label key={field.key} style={{ display: 'grid', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                                        {field.label}
                                        <select value={value} onChange={(event) => {
                                          const nextParts = [...current]
                                          nextParts[field.part === 'hour' ? 0 : 1] = Number(event.target.value)
                                          const nextTime = `${String(nextParts[0]).padStart(2, '0')}:${String(nextParts[1]).padStart(2, '0')}`
                                          setBookingModalDraft((draft) => ({ ...draft, [field.timeKey]: nextTime }))
                                          setBookingModalError('')
                                        }} style={{ width: '100%', padding: '11px', border: '1px solid #EDEDED', borderRadius: '9px', background: '#FFFFFF', color: '#676767' }}>
                                          {options.map((option) => <option key={option} value={option}>{String(option).padStart(2, '0')}</option>)}
                                        </select>
                                      </label>
                                    })}
                                  </div>
                                  <p style={{ margin: '14px 0 8px', fontSize: '13px', color: '#676767' }}>Required charging time: {formatDuration(bookingModalDraft.requiredMinutes)}. You may add up to 15 minutes of buffer.</p>
                                  {bookingModalError && <p role="alert" style={{ color: '#090708', fontSize: '13px', margin: '8px 0' }}>{bookingModalError}</p>}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '20px' }}>
                                    <button type="button" className="button button-primary" style={{ background: '#C7FE2F', borderColor: '#C7FE2F', color: '#090708', fontWeight: 700 }} onClick={() => {
                                      const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
                                      const start = toMinutes(bookingModalDraft.startTime)
                                      const end = toMinutes(bookingModalDraft.endTime)
                                      const windowStart = toMinutes(bookingModalDraft.windowStartTime)
                                      const windowEnd = toMinutes(bookingModalDraft.windowEndTime)
                                      const duration = end - start
                                      const now = new Date()
                                      const today = getLocalDateInputValue(now)
                                      const currentMinute = now.getHours() * 60 + now.getMinutes()
                                      if (end <= start) return setBookingModalError('The final time must be after the initial time.')
                                      if (duration < bookingModalDraft.requiredMinutes) return setBookingModalError(`Choose at least ${formatDuration(bookingModalDraft.requiredMinutes)} for charging.`)
                                      if (duration > bookingModalDraft.requiredMinutes + 15) return setBookingModalError('The buffer cannot exceed 15 minutes.')
                                      if (start < windowStart || end > windowEnd) return setBookingModalError('Your complete booking must fit inside the displayed availability window.')
                                      if (bookingModalDraft.date < today || (bookingModalDraft.date === today && start <= currentMinute)) return setBookingModalError('Choose a future start time.')
                                      setSelectedTimeSlot({
                                        id: `${bookingModalDraft.date}-${bookingModalDraft.startTime}-${bookingModalDraft.endTime}`,
                                        windowId: bookingModalDraft.windowId,
                                        date: bookingModalDraft.date,
                                        startTime: bookingModalDraft.startTime,
                                        endTime: bookingModalDraft.endTime,
                                        durationMinutes: duration,
                                        requiredMinutes: bookingModalDraft.requiredMinutes,
                                        stationId: bookingModalDraft.stationId,
                                        stationName: bookingModalDraft.stationName,
                                      })
                                      setBookingModalDraft(null)
                                      setBookingModalError('')
                                    }}>Save</button>
                                    <button type="button" className="button button-secondary" style={{ background: '#FFFFFF', borderColor: '#EDEDED', color: '#1A1A1A', fontWeight: 700 }} onClick={() => { setBookingModalDraft(null); setBookingModalError('') }}>Cancel</button>
                                  </div>
                                </section>
                              </div>
                            )}
                          </section>
                        }
                        return <div style={{ display: 'grid', gap: '8px', paddingBottom: '18px', marginTop: 0 }}>
                          <div className="booking-results-toolbar"><span>{sortedStations.length} {sortedStations.length === 1 ? 'result' : 'results'}</span><button type="button" className="back-button" onClick={async () => { setStationsLoading(true); setStationsError(''); try { const response = await fetch('/api/charging-stations'); const data = await response.json().catch(() => ({})); if (!response.ok || data.success === false) throw new Error(data.message || 'Request failed'); setChargingStations(Array.isArray(data.stations) ? data.stations : []) } catch (error) { console.error('Charging stations refresh failed:', error); setStationsError('Could not refresh charging stations. Check the backend and try again.') } finally { setStationsLoading(false) } }}>Refresh</button></div>
                          {sortedStations.length === 0 ? <div className="booking-results-empty"><div className="consumer-avatar">🔌</div><h3>No compatible stations found</h3><p>Check the connector types saved in your vehicle profile. These demo stations may not match every vehicle.</p></div> : sortedStations.map(({ station, estimate }) => {
                            const stationId = station._id || station.stationCode
                            return <article key={stationId} className="charging-station-card">
                              <div className={`charging-station-card-image${station.imageUrl ? '' : ' charging-station-card-image-fallback'}`}>{station.imageUrl ? <img src={station.imageUrl} alt={`${station.name} charging station`} /> : <img src="/charging-hero.png" alt="Electric vehicle charging" />}</div>
                              <div className="charging-station-card-description">
                                <h3>{station.name}</h3>
                                <p className="charging-station-card-address">{station.address}</p>
                                <div className="charging-station-card-facts">
                                  <span>📍 {roadDistancesKm[String(station._id || station.stationCode || '')] == null ? 'Road distance unavailable' : `${selectedBookingAddress?.coordinatesApproximate ? '≈ ' : ''}${roadDistancesKm[String(station._id || station.stationCode || '')].toFixed(1)} km driving`}</span>
                                  <span>🔌 {(estimate.charger.connectorTypes || []).join(', ') || 'Connector not specified'}</span>
                                  <span>⚡ {estimate.charger.powerOutputKW} kW {estimate.charger.chargingMode}</span>
                                </div>
                              </div>
                              <div className="charging-station-card-actions">
                                <strong>{estimate.estimatedCost == null ? 'Cost unavailable' : `₹${estimate.estimatedCost.toFixed(2)}`}</strong>
                                <strong>{formatDuration(estimate.durationMinutes)}</strong>
                                <button type="button" className="charging-station-view-details" onClick={() => { setSelectedTimeSlot(null); setSelectedStationId(stationId) }}>View Details</button>
                              </div>
                            </article>
                          })}
                          {sortedStations.some(({ station }) => station.isDemo) && (
                            <p style={{ margin: 0, color: '#676767', fontSize: '0.78rem' }}>Demo stations and their prices are illustrative; their physical installation is not confirmed.</p>
                          )}
                        </div>
                      })()
                    )}
                  </div>
                </>
              ) : (
                <div className="book-slot-card booking-picker-card">
                  <button type="button" className="consumer-back booking-picker-back" onClick={() => setBookSelectionView('main')} aria-label="Back to Book Slot">←</button>
                  {bookSelectionView === 'address' ? (
                    <>
                      <h2>Select Address</h2>
                      <p>Choose a saved address or use your current location.</p>
                      <button type="button" className="booking-picker-option" onClick={() => {
                        if (!navigator.geolocation) {
                          setProfileMessage('Current location is not supported by this browser.')
                          return
                        }
                        setProfileMessage('Getting your current location…')
                        navigator.geolocation.getCurrentPosition(
                          async (position) => {
                            const { latitude, longitude } = position.coords
                            // Convert device coordinates into a readable address instead of showing raw coordinates.
                            let resolved = { id: 'current-location', nickname: 'Current Location', city: '', state: '', house: '', street: '', landmark: '', pincode: '', latitude, longitude }
                            try {
                              // First try OpenStreetMap reverse geocoding.
                              const osmResponse = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=18&addressdetails=1`, { headers: { Accept: 'application/json' } })
                              if (osmResponse.ok) {
                                const result = await osmResponse.json()
                                const a = result.address || {}
                                resolved = {
                                  ...resolved,
                                  house: a.house_number || '',
                                  street: a.road || a.pedestrian || a.residential || a.path || a.neighbourhood || a.suburb || result.name || '',
                                  landmark: a.neighbourhood || a.suburb || a.quarter || a.hamlet || a.village || a.locality || '',
                                  city: a.city || a.town || a.municipality || a.village || a.county || '',
                                  state: a.state || a.state_district || '',
                                  pincode: a.postcode || '',
                                }
                              }
                            } catch (error) {
                              console.warn('OpenStreetMap reverse lookup failed; trying fallback geocoding.', error)
                            }

                            // If OSM gives no useful place name, try a second reverse-geocoding provider.
                            if (!resolved.street && !resolved.landmark && !resolved.city) {
                              try {
                                const fallbackResponse = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&localityLanguage=en`)
                                if (fallbackResponse.ok) {
                                  const result = await fallbackResponse.json()
                                  resolved = {
                                    ...resolved,
                                    street: result.locality || result.localityInfo?.administrative?.find((item) => item.name)?.name || '',
                                    landmark: result.locality || result.city || '',
                                    city: result.city || result.locality || result.principalSubdivision || '',
                                    state: result.principalSubdivision || '',
                                    pincode: result.postcode || '',
                                  }
                                }
                              } catch (error) {
                                console.warn('Fallback reverse geocoding unavailable.', error)
                              }
                            }
                            setSelectedBookingAddress(resolved)
                            setProfileMessage('')
                            setBookSelectionView('main')
                          },
                          () => setProfileMessage('Could not get your location. Allow location access and try again.'),
                          { enableHighAccuracy: true, timeout: 10000 }
                        )
                      }}><span className="booking-option-icon">⌖</span><span><strong>Current Location</strong><small>Use this device's location</small></span><span>›</span></button>
                      {savedAddresses.length ? savedAddresses.map((address) => (
                        <button type="button" className="booking-picker-option" key={address.id} onClick={() => { setSelectedBookingAddress(address); setProfileMessage(''); setBookSelectionView('main') }}>
                          <span className="booking-option-icon">⌂</span><span><strong>{address.nickname}</strong><small>{address.house}, {address.street}{address.landmark ? `, ${address.landmark}` : ''}, {address.city}, {address.state} - {address.pincode}</small></span><span>›</span>
                        </button>
                      )) : <p>No saved addresses yet. Add one below.</p>}
                      {profileMessage && <p className="message" role="status">{profileMessage}</p>}
                      <button type="button" className="button button-primary booking-add-button" onClick={() => {
                        setBookReturnTo('address'); setActiveTab('profile'); setActiveSection('main'); setProfileMode('address'); setEditingAddressId(null); setAddressForm({ nickname: `Address ${savedAddresses.length + 1}`, house: '', street: '', landmark: '', city: '', state: '', pincode: '' }); setProfileMessage('')
                      }}>+ Add Address</button>
                    </>
                  ) : (
                    <>
                      <h2>Select Battery</h2>
                      <p>Choose one of your saved vehicle battery profiles.</p>
                      {savedBatteries.length ? savedBatteries.map((battery) => (
                        <button type="button" className="booking-picker-option" key={battery.id} onClick={() => { setSelectedBookingBattery(battery); setBookSelectionView('main') }}>
                          <span className="booking-option-icon">🔋</span><span><strong>{battery.name}</strong><small>{battery.vehicleMake} {battery.vehicleModel} · {battery.capacityKwh} kWh · {(battery.connectorTypes || []).join(', ') || battery.connectorType}</small></span><span>›</span>
                        </button>
                      )) : <p>No saved battery profiles yet. Add one below.</p>}
                      <button type="button" className="button button-primary booking-add-button" onClick={() => {
                        setBookReturnTo('battery'); setActiveTab('profile'); setActiveSection('main'); setProfileMode('battery'); setEditingBatteryId(null); setSelectedEvProfileId(''); setSelectedEvVariantId(''); setEvProfileMode('choose'); setEvProfileSearch(''); setEvProfileReviewed(false); setBatteryForm({ ...emptyBatteryForm, name: `Battery ${savedBatteries.length + 1}` }); setProfileMessage('')
                      }}>+ Add Battery</button>
                    </>
                  )}
                </div>
              )}
            </section>
          )}
        </main>

        {activeSection !== 'host' && activeSection !== 'history' && !(activeTab === 'book' && selectedStationId) && (
          <nav className="consumer-bottom-nav" aria-label="Main navigation">
            <button
              type="button"
              className={activeSection === 'main' && activeTab === 'book' ? 'active' : ''}
              aria-current={activeSection === 'main' && activeTab === 'book' ? 'page' : undefined}
              onClick={() => { setActiveSection('main'); setActiveTab('book') }}
            >
              <NavigationIcon name="stations" />
              <span>Stations</span>
            </button>

            <button
              type="button"
              className={activeSection === 'orders' ? 'active' : ''}
              aria-current={activeSection === 'orders' ? 'page' : undefined}
              onClick={() => setActiveSection('orders')}
            >
              <NavigationIcon name="orders" />
              <span>My Orders</span>
            </button>

            <button
              type="button"
              className={activeSection === 'main' && activeTab === 'profile' ? 'active' : ''}
              aria-current={activeSection === 'main' && activeTab === 'profile' ? 'page' : undefined}
              onClick={() => { setActiveSection('main'); setActiveTab('profile') }}
            >
              <NavigationIcon name="vehicle" />
              <span>My EV</span>
            </button>
          </nav>
        )}
      </div>
    )
  }


  if (page === 'home') {
    return (
      <div className="app">
        <div className="card">
          <h1>BEE Charging</h1>

          <p className="subtitle">
            Charge your EV. Connect with your community.
          </p>

          <h2>Welcome</h2>

          <button
            className="button button-primary"
            onClick={openHomeLogin}
          >
            Login
          </button>

          <button
            className="button button-secondary"
            onClick={openSignup}
          >
            Sign Up
          </button>
        </div>
      </div>
    )
  }

  if (page === 'login') {
    if (loginStep === 1) {
      return (
        <div className="app">
          <Login
            formData={loginForm}
            onChange={handleLoginChange}
            onSubmit={requestLoginOtp}
            onBack={returnFromLogin}
            loading={loading}
            message={message}
            progressStep={1}
          />

          {(accountNotFound || contactConflict) && (
            <div className="card login-options-card">
              {accountNotFound && (
                <>
                  <h3>No matching account found</h3>

                  <p>
                    Check your details and try again, or create a new
                    consumer account.
                  </p>

                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => {
                      clearLoginMessages()
                    }}
                    disabled={loading}
                  >
                    Try logging in again
                  </button>

                  <button
                    type="button"
                    className="button button-primary"
                    onClick={openSignupWithLoginContacts}
                    disabled={loading}
                  >
                    Sign up using these details
                  </button>
                </>
              )}

              {contactConflict && (
                <>
                  <h3>Contact details do not match</h3>

                  <p>
                    The email and mobile number appear to belong to
                    different accounts. Change your details and try again.
                  </p>

                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={clearLoginMessages}
                    disabled={loading}
                  >
                    Change details
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="app">
        <div className="card">
          <h1>BEE Charging</h1>

          <div
            className="signup-progress login-flow-progress"
            aria-label="Step 2 of 2"
          >
            <div className="signup-progress-track">
              {['Contact details', 'Verify OTP'].map((label, index) => {
                const stepNumber = index + 1
                const completed = stepNumber < loginStep
                const current = stepNumber === loginStep

                return (
                  <div
                    className="signup-progress-item"
                    key={label}
                  >
                    <div
                      className={[
                        'signup-progress-node',
                        completed ? 'is-complete' : '',
                        current ? 'is-current' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {completed ? '✓' : stepNumber}
                    </div>

                    <span
                      className={
                        current ? 'is-current-label' : ''
                      }
                    >
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="signup-progress-bar">
              <span style={{ width: '100%' }} />
            </div>
          </div>

          <h2>Verify your account</h2>

          <p className="subtitle">
            Enter the 6-digit OTP sent to your registered contact.
          </p>

          <p className="otp-countdown" role="timer" aria-live="polite">
            {loginOtpSecondsLeft > 0
              ? `OTP expires in ${String(
                Math.floor(loginOtpSecondsLeft / 60)
              ).padStart(2, '0')}:${String(
                loginOtpSecondsLeft % 60
              ).padStart(2, '0')}`
              : 'OTP expired'}
          </p>

          <form onSubmit={verifyLoginOtp}>
            <div className="form-group">
              <label htmlFor="loginOtp">Enter OTP</label>

              <input
                id="loginOtp"
                type="text"
                inputMode="numeric"
                placeholder="Enter 6-digit OTP"
                value={loginOtp}
                onChange={(event) => {
                  setLoginOtp(
                    event.target.value.replace(/\D/g, '').slice(0, 6)
                  )
                  setMessage('')
                }}
                maxLength={6}
                autoComplete="one-time-code"
                required
              />
            </div>

            <button
              type="submit"
              className="button button-primary"
              disabled={loading || loginOtpSecondsLeft <= 0}
            >
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>

            <button
              type="button"
              className="back-button"
              onClick={returnFromLoginOtp}
              disabled={loading}
            >
              ← Back to contact details
            </button>
          </form>

          {message && <p className="message">{message}</p>}
        </div>
      </div>
    )
  }

  if (page === 'signup') {
    return (
      <Signup
        initialFormData={signupDraft}
        onFormDataChange={setSignupDraft}
        onLogin={openLoginFromSignup}
        onBack={returnFromSignup}
      />
    )
  }

  return null
}

export default App