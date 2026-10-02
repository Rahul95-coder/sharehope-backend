/** Returns a new object containing only the listed keys (skips undefined). */
const pick = (source, keys) => {
  const out = {};
  if (!source || typeof source !== 'object') return out;
  keys.forEach((k) => {
    if (source[k] !== undefined) out[k] = source[k];
  });
  return out;
};

const cleanString = (value, max = 200) => {
  if (value === undefined || value === null) return undefined;
  return String(value).trim().slice(0, max);
};

const num = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

/** Builds a safe address object from untrusted input. */
const cleanAddress = (input) => {
  if (!input || typeof input !== 'object') return undefined;
  const out = {};
  const add = (key, max) => {
    const v = cleanString(input[key], max);
    if (v !== undefined) out[key] = v;
  };
  add('addressLine', 200);
  add('city', 80);
  add('state', 80);
  add('pincode', 12);
  const lat = num(input.latitude);
  const lng = num(input.longitude);
  if (lat !== undefined && lat >= -90 && lat <= 90) out.latitude = lat;
  if (lng !== undefined && lng >= -180 && lng <= 180) out.longitude = lng;
  return Object.keys(out).length ? out : undefined;
};

module.exports = { pick, cleanString, num, cleanAddress };
