#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import exifr from 'exifr';

const args = process.argv.slice(2);
const fullMode = args.includes('--full');
const filePath = args.find((arg) => !arg.startsWith('--'));

if (!filePath) {
  console.error('Usage: node scripts/photo.js [--full] <path-to-photo>');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const bytes = fs.statSync(filePath).size;
const fileName = path.basename(filePath);

console.log('\n📷  Photo EXIF Report');
console.log('═'.repeat(50));
console.log(`File:      ${fileName}`);
console.log(`Path:      ${path.resolve(filePath)}`);
console.log(`Size:      ${formatBytes(bytes)}`);

try {
  const data = await exifr.parse(filePath, {
    exif: true,
    gps: true,
    iptc: true,
    icc: true,
    xmp: true,
    ifd0: true,
    ifd1: true,
    makerNote: true,
    userComment: true,
    translateKeys: true,
    translateValues: true,
    reviveValues: true,
  });

  if (!data || Object.keys(data).length === 0) {
    console.log('\nNo EXIF/metadata found in this file.');
    process.exit(0);
  }

  const sections = {
    '📸 Camera': pickKeys(data, [
      'Make',
      'Model',
      'LensModel',
      'LensInfo',
      'LensMake',
      'LensSerialNumber',
      'BodySerialNumber',
    ]),
    '⚙️  Capture': pickKeys(data, [
      'DateTimeOriginal',
      'CreateDate',
      'ModifyDate',
      'ExposureTime',
      'FNumber',
      'ISO',
      'FocalLength',
      'FocalLengthIn35mmFormat',
      'ExposureProgram',
      'MeteringMode',
      'Flash',
      'WhiteBalance',
      'LightSource',
      'ExposureCompensation',
      'MaxApertureValue',
      'ShutterSpeedValue',
      'ApertureValue',
      'BrightnessValue',
      'Contrast',
      'Saturation',
      'Sharpness',
      'SceneCaptureType',
    ]),
    '🗺  GPS': pickGpsKeys(data),
    '🖼  Image': pickKeys(data, [
      'ImageWidth',
      'ImageHeight',
      'Orientation',
      'XResolution',
      'YResolution',
      'ResolutionUnit',
      'BitsPerSample',
      'ColorSpace',
      'Compression',
      'PhotometricInterpretation',
      'SamplesPerPixel',
      'PlanarConfiguration',
    ]),
    '🎨 ICC / Color': pickKeys(data, ['ProfileDescription', 'ColorSpaceData', 'DeviceManufacturer']),
    '📝 IPTC / XMP': pickKeys(data, [
      'ObjectName',
      'Caption',
      'Headline',
      'Keywords',
      'City',
      'State',
      'Country',
      'Credit',
      'Source',
      'Creator',
      'Rights',
      'Title',
      'Description',
    ]),
    '🧪 Other': {},
  };

  // Put anything left into Other
  const usedKeys = new Set();
  for (const keys of Object.values(sections)) {
    for (const key of Object.keys(keys)) usedKeys.add(key);
  }
  // Always skip noise-like binary maker notes; they dwarf readable output.
  const skippedKeys = new Set(['HdrPlusMakernote']);

  for (const key of Object.keys(data)) {
    if (skippedKeys.has(key)) continue;
    if (!usedKeys.has(key)) sections['🧪 Other'][key] = data[key];
  }

  for (const [title, values] of Object.entries(sections)) {
    const keys = Object.keys(values);
    if (keys.length === 0) continue;
    console.log(`\n${title}`);
    console.log('─'.repeat(50));
    for (const key of keys.sort()) {
      const raw = values[key];
      const display = formatValue(raw);
      if (display === undefined) continue;
      const lines = String(display).split('\n');
      console.log(`  ${padRight(key, 28)} ${lines[0]}`);
      for (let i = 1; i < lines.length; i++) {
        console.log(`  ${padRight('', 28)} ${lines[i]}`);
      }
    }
  }

  console.log();
} catch (error) {
  console.error('\n❌ Failed to parse EXIF data:', error.message);
  process.exit(1);
}

function formatBytes(value) {
  if (value === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log10(value) / 3), units.length - 1);
  const scaled = value / Math.pow(1024, i);
  return `${scaled.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function padRight(str, len) {
  return String(str).padEnd(len, ' ').slice(0, len);
}

function pickKeys(data, keys) {
  const out = {};
  for (const key of keys) {
    if (key in data) out[key] = data[key];
  }
  return out;
}

function pickGpsKeys(data) {
  const gpsKeys = [
    'latitude',
    'longitude',
    'altitude',
    'GPSLatitude',
    'GPSLongitude',
    'GPSAltitude',
    'GPSLatitudeRef',
    'GPSLongitudeRef',
    'GPSAltitudeRef',
    'GPSTimeStamp',
    'GPSDateStamp',
    'GPSImgDirection',
    'GPSImgDirectionRef',
    'GPSDOP',
    'GPSMapDatum',
    'GPSProcessingMethod',
    'GPSAreaInformation',
  ];
  return pickKeys(data, gpsKeys);
}

function formatValue(value, indent = 0) {
  if (value === undefined || value === null) return '-';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(4);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array || value instanceof Buffer || value instanceof ArrayBuffer) {
    return formatBinary(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => formatValue(v, indent + 1));
    return `[ ${items.join(', ')} ]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    // Treat numeric-keyed objects as arrays (common for EXIF coordinate tuples)
    if (keys.every((k) => /^\d+$/.test(k))) {
      const items = keys.map((k) => formatValue(value[k], indent + 1));
      return `[ ${items.join(', ')} ]`;
    }
    const pad = '  '.repeat(indent + 1);
    const lines = keys.map((k) => `${pad}${k}: ${formatValue(value[k], indent + 1)}`);
    return `{\n${lines.join(',\n')}\n${'  '.repeat(indent)}}`;
  }
  const str = String(value);
  if (!fullMode && str.length > 160) {
    return `${str.slice(0, 160)}… (${str.length} chars total; use --full for everything)`;
  }
  return str;
}

function formatBinary(value) {
  let view;
  if (value instanceof Uint8Array) view = value;
  else if (value instanceof Buffer) view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  else if (value instanceof ArrayBuffer) view = new Uint8Array(value);
  else view = new Uint8Array(value);
  const bytes = Array.from(view);
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
  if (fullMode) return `<binary, ${bytes.length} bytes> ${hex}`;
  const preview = bytes.length <= 32 ? hex : `${hex.slice(0, 32 * 3 - 1)}… (+${bytes.length - 32} bytes)`;
  return `<binary, ${bytes.length} bytes> ${preview}`;
}
