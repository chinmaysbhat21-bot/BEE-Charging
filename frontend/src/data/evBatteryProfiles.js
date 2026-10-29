const ccs2Connectors = ['Type 2', 'CCS2']

/**
 * Reusable first-party vehicle profile catalog. Values are limited to the
 * existing battery form fields; provenance and variant notes stay in this
 * catalog and are not sent to the API.
 */
export const EV_BATTERY_PROFILES = [
  {
    id: 'mg-windsor-ev',
    make: 'MG',
    model: 'Windsor EV',
    searchTerms: ['windsor', 'mg'],
    batteryChemistry: 'Other/Unknown',
    cellDesign: { value: 'Prismatic / blade-style cells', verificationStatus: 'unverified' },
    batteryManufacturer: { value: 'Gotion High-Tech / SAIC', verificationStatus: 'unverified' },
    connectorType: 'CCS2',
    maxAcChargingPowerKw: 7.4,
    maxDcChargingPowerKw: { min: 45, max: 60, verificationStatus: 'variant-dependent' },
    connectorTypes: ccs2Connectors,
    verificationStatus: 'partially-verified',
    summary: 'CCS2 · 7.4 kW AC · DC rate varies by battery pack',
    specificationNotes: [
      { status: 'unverified', text: 'LFP chemistry and Gotion/SAIC cell or pack details are not confirmed in the reviewed MG specification sheets.' },
      { status: 'variant', text: 'Choose the 38 kWh or 52.9 kWh pack below. MG lists 45 kW and 60 kW maximum DC capability respectively.' },
    ],
    sources: [
      { label: 'MG Windsor EV Pro brochure', url: 'https://dealers.mgmotor.co.in/files/banner_images/349472/2151_1746535393_NewWindsorEVPROBrochure.pdf' },
    ],
    variants: [
      { id: '38-kwh', label: '38 kWh pack', capacityKwh: 38, maxAcChargingPowerKw: 7.4, maxDcChargingPowerKw: 45, verificationStatus: 'manufacturer-listed' },
      { id: '52-9-kwh', label: '52.9 kWh pack', capacityKwh: 52.9, maxAcChargingPowerKw: 7.4, maxDcChargingPowerKw: 60, verificationStatus: 'manufacturer-listed' },
    ],
  },
  {
    id: 'tata-nexon-ev',
    make: 'Tata',
    model: 'Nexon EV',
    searchTerms: ['nexon', 'tata', 'medium range', 'long range'],
    batteryChemistry: 'Other/Unknown',
    cellDesign: null,
    batteryManufacturer: { value: 'Tata AutoComp Systems / Gotion High-Tech', verificationStatus: 'unverified' },
    connectorType: 'CCS2',
    maxAcChargingPowerKw: { min: 3.3, max: 7.2, verificationStatus: 'variant-dependent' },
    maxDcChargingPowerKw: null,
    connectorTypes: ccs2Connectors,
    verificationStatus: 'partially-verified',
    summary: 'CCS2 · 30 or 40.5 kWh · AC setup varies by trim',
    specificationNotes: [
      { status: 'unverified', text: 'The reviewed Tata brochure does not confirm LFP chemistry or the supplied cell-supplier details.' },
      { status: 'variant', text: 'Select Medium Range or Long Range. Tata lists 3.3 kW and 7.2 kW AC charging configurations; DC charging time is stated using a 50 kW charger, which is not necessarily the vehicle’s maximum input.' },
      { status: 'unverified', text: 'The exact vehicle maximum DC power is not prefilled. Confirm it for your vehicle variant before entering it.' },
    ],
    sources: [
      { label: 'Tata Nexon.ev brochure', url: 'https://dealer-locator.cars.tatamotors.com/ev/assets/images/nexon-ev-brochure.pdf' },
    ],
    variants: [
      { id: 'medium-range', label: 'Medium Range · 30 kWh', capacityKwh: 30, maxAcChargingPowerKw: 3.3, maxDcChargingPowerKw: null, verificationStatus: 'manufacturer-listed' },
      { id: 'long-range', label: 'Long Range · 40.5 kWh', capacityKwh: 40.5, maxAcChargingPowerKw: 7.2, maxDcChargingPowerKw: null, verificationStatus: 'manufacturer-listed' },
    ],
  },
  {
    id: 'tata-punch-ev',
    make: 'Tata',
    model: 'Punch EV',
    searchTerms: ['punch', 'tata', 'acti.ev', 'actiev'],
    batteryChemistry: 'Other/Unknown',
    cellDesign: { value: 'Gen-2 liquid-cooled LFP pack on acti.ev platform', verificationStatus: 'unverified' },
    batteryManufacturer: { value: 'Tata AutoComp Systems', verificationStatus: 'unverified' },
    connectorType: null,
    maxAcChargingPowerKw: { value: 7.2, verificationStatus: 'unverified' },
    maxDcChargingPowerKw: { min: 50, max: 65, verificationStatus: 'unverified' },
    connectorTypes: [],
    verificationStatus: 'unverified',
    summary: 'Variant specifications need confirmation before saving',
    specificationNotes: [
      { status: 'unverified', text: 'The supplied LFP chemistry, pack supplier/cell design, CCS2 connector, 7.2 kW AC, and 50–65 kW DC figures could not be verified against a model-specific Tata specification sheet during implementation.' },
      { status: 'variant', text: 'Only the make and model are prefilled. Confirm battery capacity, chemistry, connector, and vehicle charging limits from the owner manual or vehicle label.' },
    ],
    sources: [],
    variants: [],
  },
  {
    id: 'mahindra-xev-9e',
    make: 'Mahindra',
    model: 'XEV 9e',
    searchTerms: ['xev 9e', 'xev9e', 'mahindra', 'pack one', 'pack two', 'pack three'],
    batteryChemistry: 'Other/Unknown',
    cellDesign: null,
    batteryManufacturer: null,
    connectorType: 'CCS2',
    maxAcChargingPowerKw: { min: 7.2, max: 11.2, verificationStatus: 'variant-dependent' },
    maxDcChargingPowerKw: null,
    connectorTypes: ccs2Connectors,
    verificationStatus: 'partially-verified',
    summary: 'CCS2 · LFP · 59 or 79 kWh · charger setup varies',
    specificationNotes: [
      { status: 'verified', text: 'Mahindra lists CCS2 charging and confirms LFP for the 79 kWh pack. Chemistry for the 59 kWh pack is left unknown rather than inferred.' },
      { status: 'variant', text: 'Select the pack below to fill its listed battery capacity. The owner manual lists an 11 kW onboard AC charger; wall-box options vary. Published DC charger ratings describe charging equipment, so the vehicle DC limit is left blank.' },
    ],
    sources: [
      { label: 'Mahindra XEV 9e brochure and specifications', url: 'https://www.mahindraelectricsuv.com/on/demandware.static/-/Library-Sites-eSUVSharedLibrary/default/MXV9/XEV-9e-Brochure-Specification.pdf' },
      { label: 'Mahindra XEV 9e owner manual', url: 'https://www.mahindraelectricsuv.com/on/demandware.static/-/Library-Sites-eSUVSharedLibrary/default/dw5ad7dd6c/OwnerManual/XEV_9e_HTML/XEV9e-OM.html' },
      { label: 'Mahindra XEV 9e launch specifications', url: 'https://www.mahindraelectricsuv.com/press-releases/be6-and-xev9e-launched.html' },
    ],
    variants: [
      { id: 'pack-one', label: 'Pack ONE · 59 kWh', capacityKwh: 59, maxAcChargingPowerKw: 11, maxDcChargingPowerKw: null, verificationStatus: 'manufacturer-listed' },
      { id: 'pack-two', label: 'Pack TWO · 59 kWh', capacityKwh: 59, maxAcChargingPowerKw: 11, maxDcChargingPowerKw: null, verificationStatus: 'manufacturer-listed' },
      { id: 'pack-three-select', label: 'Pack THREE SELECT · 59 kWh', capacityKwh: 59, maxAcChargingPowerKw: 11, maxDcChargingPowerKw: null, verificationStatus: 'manufacturer-listed' },
      { id: 'pack-three', label: 'Pack THREE · 79 kWh', capacityKwh: 79, batteryChemistry: 'LFP', maxAcChargingPowerKw: 11, maxDcChargingPowerKw: null, verificationStatus: 'manufacturer-listed' },
    ],
  },
  {
    id: 'mahindra-xuv400',
    make: 'Mahindra',
    model: 'XUV400',
    searchTerms: ['xuv400', 'mahindra', 'ec pro', 'el pro'],
    batteryChemistry: 'Other/Unknown',
    cellDesign: null,
    batteryManufacturer: null,
    connectorType: 'CCS2',
    maxAcChargingPowerKw: { min: 3.3, max: 7.2, verificationStatus: 'variant-dependent' },
    maxDcChargingPowerKw: null,
    connectorTypes: ccs2Connectors,
    verificationStatus: 'partially-verified',
    summary: 'CCS2 · 34.5 or 39.4 kWh · AC charger varies by trim',
    specificationNotes: [
      { status: 'unverified', text: 'The reviewed Mahindra materials specify the battery capacities but do not confirm LFP chemistry or the supplied cell-supplier details.' },
      { status: 'variant', text: 'Choose the matching EC Pro or EL Pro pack. AC charger selection varies by trim. DC maximum power is not stated as a vehicle limit in the reviewed material.' },
    ],
    sources: [
      { label: 'Mahindra XUV400 Pro Range brochure', url: 'https://auto.mahindra.com/on/demandware.static/-/Sites-amc-Library/default/dw4dc915da/mahindraelectricimages/images/xuv400images/XUV400ProRangeBrochure.pdf' },
      { label: 'Mahindra XUV400 owner manual', url: 'https://mvault-cloudfront.mahindra.com/2025/08/26/Owners-Manuals/XUV400/xuv400-owners-manual.html' },
    ],
    variants: [
      { id: 'ec-pro-34-5', label: 'EC Pro · 34.5 kWh · 3.3 kW AC', capacityKwh: 34.5, maxAcChargingPowerKw: 3.3, maxDcChargingPowerKw: null, verificationStatus: 'manufacturer-listed' },
      { id: 'el-pro-34-5', label: 'EL Pro · 34.5 kWh · 7.2 kW AC', capacityKwh: 34.5, maxAcChargingPowerKw: 7.2, maxDcChargingPowerKw: null, verificationStatus: 'manufacturer-listed' },
      { id: 'el-pro-39-4', label: 'EL Pro · 39.4 kWh · 7.2 kW AC', capacityKwh: 39.4, maxAcChargingPowerKw: 7.2, maxDcChargingPowerKw: null, verificationStatus: 'manufacturer-listed' },
    ],
  },
  {
    id: 'tata-tiago-ev',
    make: 'Tata',
    model: 'Tiago EV',
    searchTerms: ['tiago', 'tata', 'medium range', 'long range'],
    batteryChemistry: 'Other/Unknown',
    cellDesign: null,
    batteryManufacturer: { value: 'Tata AutoComp Systems', verificationStatus: 'unverified' },
    connectorType: 'CCS2',
    maxAcChargingPowerKw: { min: 3.3, max: 7.2, verificationStatus: 'variant-dependent' },
    maxDcChargingPowerKw: null,
    connectorTypes: ccs2Connectors,
    verificationStatus: 'partially-verified',
    summary: 'CCS2 · 19.2 or 24 kWh · 3.3/7.2 kW AC by trim',
    specificationNotes: [
      { status: 'unverified', text: 'LFP chemistry and pack/cell construction are not confirmed in the reviewed Tata brochure.' },
      { status: 'variant', text: 'Choose Medium Range or Long Range. Tata lists 3.3 kW and supported 7.2 kW AC configurations. DC fast charging is supported, but the brochure does not state a vehicle maximum in kW.' },
    ],
    sources: [
      { label: 'Tata Tiago.ev brochure', url: 'https://dealer-locator.cars.tatamotors.com/ev/assets/images/tiago-ev-brochure.pdf' },
    ],
    variants: [
      { id: 'medium-range', label: 'Medium Range · 19.2 kWh · 3.3 kW AC', capacityKwh: 19.2, maxAcChargingPowerKw: 3.3, maxDcChargingPowerKw: null, verificationStatus: 'manufacturer-listed' },
      { id: 'long-range', label: 'Long Range · 24 kWh · 7.2 kW AC supported', capacityKwh: 24, maxAcChargingPowerKw: 7.2, maxDcChargingPowerKw: null, verificationStatus: 'manufacturer-listed' },
    ],
  },
]

export function getBatteryFormValuesForProfile(profile, variant = null) {
  return {
    name: variant ? `${profile.model} ${variant.label}` : profile.model,
    vehicleMake: profile.make,
    vehicleModel: variant ? `${profile.model} (${variant.label.split(' · ')[0]})` : profile.model,
    capacityKwh: variant?.capacityKwh ?? '',
    batteryChemistry: variant?.batteryChemistry || profile.batteryChemistry || 'Other/Unknown',
    connectorTypes: [...(profile.connectorTypes || [])],
    maxAcChargingPowerKw: variant?.maxAcChargingPowerKw ?? '',
    maxDcChargingPowerKw: variant?.maxDcChargingPowerKw ?? '',
  }
}