"use strict";

globalThis.StromModell = (() => {
  const millisecondsPerDay = 86400000;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  function iso(day) {
    return new Date(day * millisecondsPerDay).toISOString().slice(0, 10);
  }

  function dayOf(date) {
    if (typeof date !== "string" || !datePattern.test(date) || date.startsWith("0000")) return NaN;
    const day = Date.parse(date + "T00:00:00Z") / millisecondsPerDay;
    return Number.isInteger(day) && iso(day) === date ? day : NaN;
  }

  function today(date = new Date()) {
    const pad = value => String(value).padStart(2, "0");
    return String(date.getFullYear()).padStart(4, "0") + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function nextDay(date) {
    return iso(dayOf(date) + 1);
  }

  function nextMonthStart(date) {
    const first = new Date((date.slice(0, 7) + "-01") + "T00:00:00Z");
    first.setUTCMonth(first.getUTCMonth() + 1);
    return first.getTime() / millisecondsPerDay;
  }

  function annualEnd(start) {
    const year = Number(start.slice(0, 4));
    const month = start.slice(5, 7);
    const firstOfMonth = String(year + 1).padStart(4, "0") + "-" + month + "-01";
    const lastDay = Number(iso(nextMonthStart(firstOfMonth) - 1).slice(-2));
    const anniversary = dayOf(firstOfMonth) + Math.min(Number(start.slice(-2)), lastDay) - 1;
    return iso(anniversary - 1);
  }

  function parseAmount(value, precision, label, optional = false) {
    const entry = String(value ?? "").trim();
    if (!entry && optional) return null;
    const parts = /^(?<whole>\d+|\d{1,3}(?:\.\d{3})+)(?:,(?<decimals>\d+))?$/.exec(entry);
    const decimals = parts?.groups.decimals ?? "";
    if (!parts || decimals.length > precision) {
      throw new Error(precision
        ? "Gib für „" + label + "“ eine Zahl mit bis zu " + precision + " Nachkommastellen ein."
        : "Gib für „" + label + "“ eine ganze Zahl ein.");
    }
    const amount = Number(parts.groups.whole.replaceAll(".", "")) * 10 ** precision
      + Number(decimals.padEnd(precision, "0"));
    if (!Number.isSafeInteger(amount)) throw new Error("Der Wert für „" + label + "“ ist zu groß.");
    return amount;
  }

  function emptyState() {
    return { version: 1, periods: [], readings: [] };
  }

  function belongsToPeriod(reading, period) {
    return reading.date >= period.start && reading.date <= nextDay(period.end);
  }

  function findReading(state, date) {
    return state.readings.find(reading => reading.date === date);
  }

  function sortDates(rows, property) {
    return rows.slice().sort((left, right) => left[property].localeCompare(right[property]));
  }

  function replaceReading(state, reading, previous, currentDate) {
    if (!Number.isFinite(dayOf(reading.date))) throw new Error("Gib ein gültiges Ablesedatum ein.");
    if (reading.date > currentDate) throw new Error("Das Ablesedatum kann höchstens heute sein.");
    if (!Number.isSafeInteger(reading.value) || reading.value < 0) throw new Error("Gib einen gültigen Zählerstand ein.");
    if (previous && findReading(state, previous.date)?.value !== previous.value) {
      throw new Error("Dieser Stand wurde inzwischen geändert. Öffne den Eintrag erneut.");
    }
    const otherReadings = previous ? state.readings.filter(item => item.date !== previous.date) : state.readings;
    if (otherReadings.some(item => item.date === reading.date)) {
      throw new Error("Für dieses Datum gibt es schon einen Zählerstand. Du kannst ihn in der Liste bearbeiten.");
    }
    const readings = sortDates([...otherReadings, reading], "date");
    const index = readings.indexOf(reading);
    const before = readings[index - 1];
    const after = readings[index + 1];
    if ((before && before.value > reading.value) || (after && after.value < reading.value)) {
      throw new Error("Der Zählerstand muss zwischen den angrenzenden Ablesungen liegen.");
    }
    return { ...state, readings };
  }

  function deleteReading(state, previous) {
    if (findReading(state, previous.date)?.value !== previous.value) {
      throw new Error("Dieser Stand wurde inzwischen geändert. Öffne den Eintrag erneut.");
    }
    return { ...state, readings: state.readings.filter(reading => reading.date !== previous.date) };
  }

  function replacePeriod(state, period, previous, opening, currentDate) {
    if (!Number.isFinite(dayOf(period.start)) || !Number.isFinite(dayOf(period.end))
      || period.end < period.start || period.start >= "9998-01-01" || period.end >= "9999-12-31") {
      throw new Error("Wähle einen gültigen Beginn und ein Ende am selben Tag oder später.");
    }
    if (previous && JSON.stringify(state.periods.find(item => item.id === period.id)) !== JSON.stringify(previous)) {
      throw new Error("Der Zeitraum wurde inzwischen geändert. Öffne den Vertrag erneut.");
    }
    if (state.periods.some(item => item.id !== period.id && item.start <= period.end && period.start <= item.end)) {
      throw new Error("Dieser Zeitraum überschneidet sich mit einem vorhandenen Zeitraum.");
    }
    const periods = sortDates([...state.periods.filter(item => item.id !== period.id), period], "start");
    const next = { ...state, periods };
    if (opening.value === null) return next;
    const existing = findReading(state, period.start);
    if (opening.expected?.value !== existing?.value) {
      throw new Error("Der Startzählerstand wurde inzwischen geändert. Öffne den Vertrag erneut.");
    }
    if (opening.value === existing?.value) return next;
    return replaceReading(next, { date: period.start, value: opening.value }, existing, currentDate);
  }

  function latestPeriod(state, currentDate) {
    const active = state.periods.find(period => period.start <= currentDate && currentDate <= period.end);
    const previous = state.periods.filter(period => period.start <= currentDate).at(-1);
    return active ?? previous ?? state.periods[0];
  }

  function readingAt(observations, day) {
    const index = observations.findIndex(item => item.day >= day);
    const after = observations[index];
    if (!after) return null;
    if (after.day === day) return { value: after.value, estimated: Boolean(after.estimated) };
    const before = observations[index - 1];
    if (!before) return null;
    const share = (day - before.day) / (after.day - before.day);
    return { value: before.value + share * (after.value - before.value), estimated: true };
  }

  function monthsCharged(from, to) {
    let months = 0;
    for (let start = from; start < to;) {
      const monthStart = dayOf(iso(start).slice(0, 7) + "-01");
      const nextMonth = nextMonthStart(iso(start));
      const end = Math.min(to, nextMonth);
      months += (end - start) / (nextMonth - monthStart);
      start = end;
    }
    return months;
  }

  function monthsFor(periodStart, endBoundary, observations, currentDay) {
    const months = [];
    const firstReading = observations[0];
    const lastReading = observations.at(-1);
    let start = periodStart;
    while (start < endBoundary) {
      const key = iso(start).slice(0, 7);
      const end = Math.min(endBoundary, nextMonthStart(iso(start)));
      const availableFrom = firstReading ? Math.max(start, firstReading.day) : end;
      const availableTo = lastReading ? Math.min(end, lastReading.day) : start;
      let measurement = null;
      if (availableTo > availableFrom) {
        const left = readingAt(observations, availableFrom);
        const right = readingAt(observations, availableTo);
        measurement = {
          amount: (right.value - left.value) / 1000,
          estimated: left.estimated || right.estimated,
          partial: availableFrom > start || availableTo < end,
          from: iso(availableFrom),
          to: iso(availableTo - 1),
        };
      }
      months.push({ key, from: iso(start), to: iso(end - 1), future: start > currentDay, measurement });
      start = end;
    }
    return months;
  }

  function metrics(state, period, currentDate) {
    const start = dayOf(period.start);
    const endBoundary = dayOf(period.end) + 1;
    const periodDays = endBoundary - start;
    const known = state.readings
      .filter(reading => reading.date <= currentDate)
      .map(reading => ({ ...reading, day: dayOf(reading.date) }));
    const readings = known.filter(reading => reading.day >= start && reading.day <= endBoundary);
    const observations = readings.slice();
    const opening = readingAt(known, start);
    const closing = readingAt(known, endBoundary);
    if (opening?.estimated) observations.unshift({ ...opening, day: start, date: period.start });
    if (closing?.estimated) observations.push({ ...closing, day: endBoundary, date: iso(endBoundary) });

    const first = observations[0];
    const last = observations.at(-1);
    const measuredDays = first && last ? last.day - first.day : 0;
    const hasOpening = first?.day === start;
    const covered = hasOpening && last.day === endBoundary;
    const estimated = Boolean(first?.estimated || last?.estimated);
    const complete = covered && !estimated;
    const used = measuredDays > 0 ? (last.value - first.value) / 1000 : null;
    const costFor = (kwh, from, to) => Math.round(kwh * period.workPrice / 10000 + period.baseCents * monthsCharged(from, to));
    const forecast = used === null ? null : used * periodDays / measuredDays;
    const paid = period.installmentCents * period.installments;
    const forecastCost = forecast === null ? null : costFor(forecast, start, endBoundary);
    return {
      first, last, hasOpening, covered, estimated, complete, used, forecast, forecastCost, paid, readings,
      remaining: hasOpening && used !== null ? period.target / 1000 - used : null,
      cost: used === null ? null : costFor(used, first.day, last.day),
      balance: forecastCost === null ? null : paid - forecastCost,
      months: monthsFor(start, endBoundary, observations, dayOf(currentDate)),
    };
  }

  function demoState() {
    const tariff = { workPrice: 320000, baseCents: 1000, installmentCents: 9000, installments: 12, target: 3000000 };
    const periods = [2025, 2026, 2027].map(year => ({
      id: "beispiel-" + year,
      start: String(year) + "-05-01",
      end: String(year + 1) + "-04-30",
      supplier: "Beispielenergie",
      ...tariff,
    }));
    const monthly = [232, 220, 205, 190, 215, 260, 275, 301, 282, 265, 213, 192, 270, 245, 210, 185, 218, 272];
    let date = "2025-05-01";
    let counter = 9150000;
    const readings = [{ date, value: counter }];
    for (const usage of monthly) {
      date = iso(nextMonthStart(date));
      counter += usage * 1000;
      readings.push({ date, value: counter });
    }
    return { version: 1, periods, readings };
  }

  return Object.freeze({
    annualEnd, belongsToPeriod, dayOf, deleteReading, demoState, emptyState, findReading, iso,
    latestPeriod, metrics, nextDay, parseAmount, replacePeriod, replaceReading, today,
  });
})();
