import tzLookup from "tz-lookup";

import type { LatLng } from "./types";

function parseLocalTime(localTime: string) {
  const match = localTime.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    throw new Error(`Invalid local time: ${localTime}`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid local time: ${localTime}`);
  }

  return { hours, minutes };
}

function getFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function getParts(date: Date, timeZone: string) {
  const parts = getFormatter(timeZone).formatToParts(date);
  const lookup = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getParts(date, timeZone);
  const utcTimestamp = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return utcTimestamp - date.getTime();
}

export function getDateForLocalTimeAtLatLng(
  latlng: LatLng,
  localTime: string,
  baseDate: Date = new Date(),
) {
  const timeZone = tzLookup(latlng.lat, latlng.lng);
  const { hours, minutes } = parseLocalTime(localTime);
  const baseParts = getParts(baseDate, timeZone);
  const localTimestamp = Date.UTC(
    baseParts.year,
    baseParts.month - 1,
    baseParts.day,
    hours,
    minutes,
    0,
  );

  const approximate = new Date(localTimestamp);
  const firstOffsetMs = getTimeZoneOffsetMs(approximate, timeZone);
  const firstPass = new Date(localTimestamp - firstOffsetMs);
  const secondOffsetMs = getTimeZoneOffsetMs(firstPass, timeZone);

  if (secondOffsetMs === firstOffsetMs) {
    return firstPass;
  }

  return new Date(localTimestamp - secondOffsetMs);
}
