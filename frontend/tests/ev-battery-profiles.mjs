import assert from 'node:assert/strict'
import { EV_BATTERY_PROFILES, getBatteryFormValuesForProfile } from '../src/data/evBatteryProfiles.js'

const expectedProfiles = [
  'mg-windsor-ev',
  'tata-nexon-ev',
  'tata-punch-ev',
  'mahindra-xev-9e',
  'mahindra-xuv400',
  'tata-tiago-ev',
]

assert.deepEqual(EV_BATTERY_PROFILES.map(({ id }) => id), expectedProfiles)
assert.equal(new Set(EV_BATTERY_PROFILES.map(({ id }) => id)).size, EV_BATTERY_PROFILES.length)

for (const profile of EV_BATTERY_PROFILES) {
  const base = getBatteryFormValuesForProfile(profile)
  assert.equal(base.vehicleMake, profile.make, `${profile.id} maps its make`)
  assert.equal(base.vehicleModel, profile.model, `${profile.id} maps its model`)
  assert.equal(base.batteryChemistry, profile.batteryChemistry, `${profile.id} maps chemistry`)
  assert.deepEqual(base.connectorTypes, profile.connectorTypes, `${profile.id} maps connectors`)
  assert.notStrictEqual(base.connectorTypes, profile.connectorTypes, `${profile.id} copies connector array`)
  assert.ok(Object.hasOwn(base, 'capacityKwh'))
  assert.ok(Object.hasOwn(base, 'maxAcChargingPowerKw'))
  assert.ok(Object.hasOwn(base, 'maxDcChargingPowerKw'))

  for (const variant of profile.variants) {
    const form = getBatteryFormValuesForProfile(profile, variant)
    assert.equal(form.capacityKwh, variant.capacityKwh, `${profile.id}/${variant.id} capacity`)
    assert.equal(form.maxAcChargingPowerKw, variant.maxAcChargingPowerKw ?? '', `${profile.id}/${variant.id} AC power`)
    assert.equal(form.maxDcChargingPowerKw, variant.maxDcChargingPowerKw ?? '', `${profile.id}/${variant.id} DC power`)
    assert.match(form.vehicleModel, new RegExp(profile.model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
}

const mg = EV_BATTERY_PROFILES.find(({ id }) => id === 'mg-windsor-ev')
assert.deepEqual(mg.maxDcChargingPowerKw, { min: 45, max: 60, verificationStatus: 'variant-dependent' })
assert.equal(mg.variants[0].maxDcChargingPowerKw, 45)
assert.equal(mg.variants[1].maxDcChargingPowerKw, 60)

const punch = EV_BATTERY_PROFILES.find(({ id }) => id === 'tata-punch-ev')
assert.deepEqual(punch.maxDcChargingPowerKw, { min: 50, max: 65, verificationStatus: 'unverified' })
assert.equal(getBatteryFormValuesForProfile(punch).maxDcChargingPowerKw, '')
assert.deepEqual(getBatteryFormValuesForProfile(punch).connectorTypes, [])

const xev9e = EV_BATTERY_PROFILES.find(({ id }) => id === 'mahindra-xev-9e')
assert.equal(getBatteryFormValuesForProfile(xev9e).batteryChemistry, 'Other/Unknown')
assert.equal(xev9e.variants.at(-1).capacityKwh, 79)
assert.equal(getBatteryFormValuesForProfile(xev9e, xev9e.variants.at(-1)).batteryChemistry, 'LFP')
assert.equal(xev9e.variants.at(-1).maxDcChargingPowerKw, null)

console.log(`${EV_BATTERY_PROFILES.length} EV profiles and all listed variant mappings passed.`)
