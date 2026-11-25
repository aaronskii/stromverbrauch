"use strict";

(() => {
  const model = StromModell;
  const storage = StromSpeicher;
  const element = id => document.getElementById(id);
  const field = (form, name) => form.elements.namedItem(name);
  const demo = new URLSearchParams(location.search).get("beispiel") === "1";
  const channel = !demo && location.protocol !== "file:" && "BroadcastChannel" in globalThis
    ? new BroadcastChannel(storage.channelName) : null;
  const overview = element("dashboard");
  const tabs = element("period-tabs");
  const monthGrid = element("month-grid");
  const periodDialog = element("period-dialog");
  const periodForm = element("period-form");
  const readingDialog = element("reading-dialog");
  const readingForm = element("reading-form");
  const currencies = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
  const kilowattHours = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 });
  const predictedKwh = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
  let state = demo ? model.demoState() : model.emptyState();
  let selectedId;
  let periodContext;
  let readingContext;
  let refreshSequence = 0;
  let renderedMonths = [];
  const selectedMonths = new Map();

  function activePeriod() {
    return state.periods.find(period => period.id === selectedId);
  }

  function showText(id, text) {
    const node = element(id);
    node.textContent = text;
    node.hidden = !text;
  }

  function setText(id, text) {
    element(id).textContent = text;
  }

  function kwh(value) {
    return kilowattHours.format(value) + " kWh";
  }

  function euro(cents) {
    return currencies.format(cents / 100);
  }

  function inputNumber(amount, precision) {
    if (amount == null) return "";
    return new Intl.NumberFormat("de-DE", { maximumFractionDigits: precision }).format(amount / 10 ** precision);
  }

  function formattedDate(date, options) {
    return new Intl.DateTimeFormat("de-DE", { ...options, timeZone: "UTC" })
      .format(new Date(date + "T00:00:00Z"));
  }

  function shortDate(date) {
    return formattedDate(date, { day: "numeric", month: "short" });
  }

  function fullDate(date) {
    return formattedDate(date, { day: "numeric", month: "short", year: "numeric" });
  }

  function periodRange(period) {
    const first = period.start.slice(0, 4) === period.end.slice(0, 4) ? shortDate(period.start) : fullDate(period.start);
    return first + " bis " + fullDate(period.end);
  }

  function tabYear(period) {
    const start = period.start.slice(0, 4);
    const end = period.end.slice(0, 4);
    return start === end ? start : start + "/" + end.slice(-2);
  }

  function selectPeriod(id, focus = false) {
    selectedId = id;
    element("reading-list").open = false;
    render();
    if (focus) tabs.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
  }

  function renderTabs() {
    const years = state.periods.map(tabYear);
    const buttons = state.periods.map((period, index) => {
      const isActive = period.id === selectedId;
      const button = document.createElement("button");
      const year = years[index];
      const yearAppearsTwice = years.indexOf(year) !== years.lastIndexOf(year);
      const compactMonth = date => formattedDate(date, { month: "short", year: "2-digit" });
      button.id = "period-tab-" + period.id;
      button.type = "button";
      button.className = "period-tab";
      button.textContent = yearAppearsTwice ? compactMonth(period.start) + " – " + compactMonth(period.end) : year;
      button.setAttribute("aria-label", periodRange(period));
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(isActive));
      button.setAttribute("aria-controls", "dashboard");
      button.tabIndex = isActive ? 0 : -1;
      button.addEventListener("click", () => selectPeriod(period.id, true));
      return button;
    });
    tabs.replaceChildren(...buttons);
    const active = tabs.querySelector('[aria-selected="true"]');
    overview.setAttribute("aria-labelledby", active.id);
    const listBox = tabs.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    if (activeBox.right > listBox.right || activeBox.left < listBox.left) {
      tabs.scrollLeft += activeBox.left - listBox.left - 4;
    }
  }

  tabs.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const count = state.periods.length;
    const current = state.periods.findIndex(period => period.id === selectedId);
    const step = event.key === "ArrowLeft" ? -1 : 1;
    const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1 : (current + step + count) % count;
    selectPeriod(state.periods[next].id, true);
  });

  function monthName(month, format) {
    return formattedDate(month.key + "-01", format);
  }

  function monthDetails(month) {
    if (!month.measurement) return month.future ? "Zukünftiger Monat" : "Für diesen Monat fehlt ein Verbrauchswert.";
    const { from, to, partial, estimated } = month.measurement;
    if (!partial) return estimated ? "Zeitanteilig aus Ablesungen geschätzt" : "";
    const range = from === to ? "am " + shortDate(from) : "vom " + shortDate(from) + " bis " + shortDate(to);
    return (estimated ? "Geschätzt " : "Erfasst ") + range;
  }

  function selectMonth(periodId, key) {
    const month = renderedMonths.find(item => item.key === key);
    if (!month) return;
    selectedMonths.set(periodId, key);
    for (const button of monthGrid.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.month === key));
    }
    setText("month-label", monthName(month, { month: "long", year: "numeric" }));
    setText("month-value", month.measurement ? kwh(month.measurement.amount) : "Offen");
    showText("month-note", monthDetails(month));
  }

  function renderMonths(period, months, currentDate) {
    renderedMonths = months;
    const measured = months.filter(month => month.measurement);
    const peak = measured.reduce((maximum, month) => Math.max(maximum, month.measurement.amount), 0);
    const step = peak > 0 ? 10 ** Math.floor(Math.log10(peak)) : 1;
    const ceiling = peak > 0 ? Math.ceil(peak / step) * step : 1;
    setText("chart-scale", measured.length ? "0–" + kwh(ceiling) : "");
    const fragment = document.createDocumentFragment();
    for (const month of months) {
      const item = document.createElement("li");
      item.className = "month-cell";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "month-button";
      button.dataset.month = month.key;
      button.dataset.empty = String(!month.measurement);
      button.dataset.estimated = String(Boolean(month.measurement?.estimated));
      const detail = monthDetails(month);
      const value = month.measurement ? kwh(month.measurement.amount) : "offen";
      button.setAttribute("aria-label", [monthName(month, { month: "long", year: "numeric" }), value, detail].filter(Boolean).join(", "));
      const mark = document.createElement("span");
      mark.className = "bar-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.style.setProperty("--height", String((month.measurement?.amount ?? 0) / ceiling * 100) + "%");
      const caption = document.createElement("span");
      caption.textContent = monthName(month, { month: "short" });
      button.append(mark, caption);
      button.addEventListener("click", () => selectMonth(period.id, month.key));
      item.append(button);
      fragment.append(item);
    }
    monthGrid.replaceChildren(fragment);
    const remembered = selectedMonths.get(period.id);
    const chosen = months.find(month => month.key === remembered)
      ?? measured.filter(month => !month.measurement.partial).at(-1)
      ?? measured.at(-1)
      ?? months.find(month => month.key === currentDate.slice(0, 7))
      ?? months[0];
    selectMonth(period.id, chosen.key);
  }

  function renderBudget(period, report) {
    const target = period.target / 1000;
    setText("budget-amount", kwh(target));
    const remaining = report.remaining;
    setText("remaining", remaining === null
      ? "–"
      : (report.estimated ? "≈ " : "") + kwh(Math.abs(remaining)) + (remaining < 0 ? " über dem Ziel" : " übrig"));

    const meter = element("budget-track");
    meter.hidden = remaining === null;
    if (remaining === null) return;
    const share = target > 0 ? report.used / target : report.used > 0 ? 1 : 0;
    const percent = Math.min(100, Math.round(share * 100));
    meter.classList.toggle("over-target", remaining < 0);
    meter.setAttribute("aria-valuenow", String(percent));
    meter.setAttribute("aria-valuetext", kwh(report.used) + " von " + kwh(target));
    element("budget-fill").style.width = percent + "%";
  }

  function renderCost(report) {
    setText("cost-label", report.covered ? "Kosten gesamt" : "Kosten bisher");
    setText("cost", report.cost === null ? "–" : (report.estimated ? "≈ " : "") + euro(report.cost));
    setText("forecast-label", report.covered ? "Abschläge gesamt" : "Prognose gesamt");
    setText("forecast", report.covered ? euro(report.paid) : report.forecast === null ? "–"
      : predictedKwh.format(report.forecast) + " kWh");

    element("balance").hidden = report.balance === null;
    if (report.balance === null) return;
    element("balance").dataset.negative = String(report.balance < 0);
    const settledLabel = report.balance < 0 ? "Nachzahlung" : report.balance > 0 ? "Guthaben" : "Ausgeglichen";
    const forecastLabel = report.balance < 0 ? "Voraussichtliche Nachzahlung"
      : report.balance > 0 ? "Voraussichtliches Guthaben" : "Voraussichtlich ausgeglichen";
    setText("balance-label", report.complete ? settledLabel : forecastLabel);
    setText("balance-amount", euro(Math.abs(report.balance)));
    showText("balance-details", report.covered ? "" : "Erwartete Kosten " + euro(report.forecastCost) + " · Abschläge " + euro(report.paid));
  }

  function readingRow(reading, period) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reading-item section-row";
    const amount = document.createElement("strong");
    amount.textContent = kwh(reading.value / 1000);
    const prefix = reading.date === period?.start ? "Startstand · " :
      period && reading.date === model.nextDay(period.end) ? "Schlussstand · " : "";
    const description = document.createElement("span");
    description.textContent = prefix + fullDate(reading.date);
    const action = document.createElement("span");
    action.textContent = "Bearbeiten";
    action.className = "reading-action muted";
    button.append(description, amount, action);
    button.setAttribute("aria-label", description.textContent + ", " + amount.textContent + " bearbeiten");
    button.addEventListener("click", () => openReading(period, reading));
    item.append(button);
    return item;
  }

  function renderReadings(period, report) {
    setText("reading-count", "(" + report.readings.length + ")");
    element("no-readings").hidden = report.readings.length > 0;
    element("reading-items").replaceChildren(...report.readings.slice().reverse().map(reading => readingRow(reading, period)));
    const other = state.readings.filter(reading => !state.periods.some(item => model.belongsToPeriod(reading, item)));
    element("other-readings").hidden = !other.length;
    element("other-items").replaceChildren(...other.map(reading => readingRow(reading, null)));
  }

  function render() {
    const currentDate = model.today();
    const period = activePeriod() ?? model.latestPeriod(state, currentDate);
    element("welcome").hidden = Boolean(period);
    element("periods").hidden = !period;
    overview.hidden = !period;
    element("entry-bar").hidden = !period || period.start > currentDate;
    if (!period) return;

    selectedId = period.id;
    const report = model.metrics(state, period, currentDate);
    renderTabs();
    setText("period-heading", periodRange(period));
    const phase = report.complete ? "Abgeschlossen" : period.start > currentDate ? "Geplant" :
      period.end < currentDate ? "Zeitraum beendet" : "";
    showText("period-phase", [period.supplier, phase].filter(Boolean).join(" · "));
    setText("usage-label", report.covered ? "Verbrauch gesamt" : "Verbrauch bisher");
    setText("last-reading", report.last ? (report.last.estimated ? "Bis " + shortDate(period.end) : "Stand " + shortDate(report.last.date)) : "");
    setText("usage", report.used === null ? "–" : (report.estimated ? "≈ " : "") + kilowattHours.format(report.used));
    const estimatedBoundaries = report.first?.estimated && report.last?.estimated ? "Start- und Schlussstand"
      : report.first?.estimated ? "Startstand" : "Schlussstand";
    const note = period.start > currentDate ? "" : !report.last ? "Trage deinen ersten Zählerstand ein." :
      report.used === null ? "Nach der nächsten Ablesung siehst du deinen Verbrauch." :
      !report.hasOpening ? "Gemessen seit " + shortDate(report.first.date) + ". Ergänze den Startzählerstand im Vertrag, um das Restbudget zu sehen." :
      report.estimated ? estimatedBoundaries + " zeitanteilig geschätzt." : "";
    showText("measurement-note", note);
    renderMonths(period, report.months, currentDate);
    renderBudget(period, report);
    renderCost(report);
    renderReadings(period, report);
  }

  function newId() {
    return globalThis.crypto.randomUUID?.() ?? String(Date.now()) + "-" + Math.random().toString(36).slice(2);
  }

  function syncOpening(start) {
    periodContext.opening = model.findReading(state, start);
    field(periodForm, "opening").value = inputNumber(periodContext.opening?.value, 3);
  }

  function openPeriod(period) {
    const latest = state.periods.at(-1);
    const defaults = period ?? latest;
    const start = period?.start ?? (latest ? model.nextDay(latest.end) : model.today().slice(0, 7) + "-01");
    periodContext = { previous: period, id: period?.id ?? newId(), autoEnd: !period };
    field(periodForm, "supplier").value = defaults?.supplier ?? "";
    field(periodForm, "start").value = start;
    field(periodForm, "end").value = period?.end ?? model.annualEnd(start);
    syncOpening(start);
    field(periodForm, "workPrice").value = inputNumber(defaults?.workPrice, 4);
    field(periodForm, "target").value = inputNumber(defaults?.target, 3);
    field(periodForm, "base").value = inputNumber(defaults?.baseCents, 2);
    field(periodForm, "installment").value = inputNumber(defaults?.installmentCents, 2);
    field(periodForm, "installments").value = inputNumber(defaults?.installments ?? 12, 0);
    setText("period-dialog-title", period ? "Vertrag bearbeiten" : "Abrechnungszeitraum anlegen");
    showText("period-error", "");
    periodDialog.showModal();
  }

  function openReading(period, reading) {
    const currentDate = model.today();
    const closingDate = period ? model.nextDay(period.end) : currentDate;
    const dateLimit = currentDate < closingDate ? currentDate : closingDate;
    const previous = reading;
    readingContext = { period, previous };
    const input = field(readingForm, "date");
    input.max = currentDate;
    input.value = previous?.date ?? dateLimit;
    field(readingForm, "value").value = inputNumber(previous?.value, 3);
    setText("reading-dialog-title", previous ? "Zählerstand bearbeiten" : "Zählerstand eintragen");
    const hint = period && dateLimit === closingDate
      ? "Trage das tatsächliche Ablesedatum ein. Aus einer späteren Ablesung kann die App den Stand zum " + fullDate(closingDate) + " schätzen."
      : "Trage das tatsächliche Ablesedatum ein. Bei späterer Ablesung wird der Verbrauch des Vormonats zeitanteilig geschätzt.";
    showText("reading-hint", hint);
    showText("reading-error", "");
    element("delete-reading").hidden = !previous;
    readingDialog.showModal();
  }

  async function commit(change) {
    state = demo ? change(state) : await storage.write(change);
    refreshSequence++;
    channel?.postMessage("updated");
  }

  function formError(error) {
    return error.name === "Error" ? error.message : "Speichern fehlgeschlagen. Versuche es erneut.";
  }

  function lockForm(form, working) {
    for (const button of form.querySelectorAll("button")) button.disabled = working;
  }

  periodForm.addEventListener("submit", async event => {
    event.preventDefault();
    lockForm(periodForm, true);
    showText("period-error", "");
    const { id, previous, opening } = periodContext;
    const fields = new FormData(periodForm);
    const amount = (name, precision, label, optional) => model.parseAmount(fields.get(name), precision, label, optional);
    try {
      const period = {
        id,
        supplier: String(fields.get("supplier")).trim(),
        start: fields.get("start"),
        end: fields.get("end"),
        workPrice: amount("workPrice", 4, "Arbeitspreis"),
        target: amount("target", 3, "Verbrauchsziel"),
        baseCents: amount("base", 2, "Grundpreis pro Monat"),
        installmentCents: amount("installment", 2, "Abschlag"),
        installments: amount("installments", 0, "Anzahl der Abschläge"),
      };
      await commit(snapshot => model.replacePeriod(snapshot, period, previous, {
        value: amount("opening", 3, "Startzählerstand", true),
        expected: opening?.date === period.start ? opening : undefined,
      }, model.today()));
      periodDialog.close();
      selectPeriod(id);
      setText("status", "Abrechnungszeitraum gespeichert.");
      if (!demo) navigator.storage?.persist?.().catch(() => {});
    } catch (error) {
      showText("period-error", formError(error));
    } finally {
      lockForm(periodForm, false);
    }
  });

  field(periodForm, "start").addEventListener("change", event => {
    const start = event.target.value;
    if (!Number.isFinite(model.dayOf(start))) return;
    if (periodContext.autoEnd && start < "9998-01-01") {
      field(periodForm, "end").value = model.annualEnd(start);
    }
    syncOpening(start);
  });
  field(periodForm, "end").addEventListener("change", () => { periodContext.autoEnd = false; });

  readingForm.addEventListener("submit", async event => {
    event.preventDefault();
    lockForm(readingForm, true);
    showText("reading-error", "");
    const { previous, period } = readingContext;
    try {
      const date = field(readingForm, "date").value;
      const value = model.parseAmount(field(readingForm, "value").value, 3, "Zählerstand");
      await commit(snapshot => model.replaceReading(snapshot, { date, value }, previous, model.today()));
      readingDialog.close();
      if (period) selectedMonths.delete(period.id);
      render();
      setText("status", "Zählerstand gespeichert.");
    } catch (error) {
      showText("reading-error", formError(error));
    } finally {
      lockForm(readingForm, false);
    }
  });

  element("delete-reading").addEventListener("click", async () => {
    const { previous } = readingContext;
    if (!previous || !confirm("Zählerstand vom " + fullDate(previous.date) + " löschen?")) return;
    lockForm(readingForm, true);
    try {
      await commit(snapshot => model.deleteReading(snapshot, previous));
      readingDialog.close();
      render();
      setText("status", "Zählerstand gelöscht.");
    } catch (error) {
      showText("reading-error", formError(error));
    } finally {
      lockForm(readingForm, false);
    }
  });

  for (const close of document.querySelectorAll("[data-close]")) {
    close.addEventListener("click", () => close.closest("dialog").close());
  }
  element("setup-button").addEventListener("click", () => openPeriod(null));
  element("new-period").addEventListener("click", () => openPeriod(null));
  element("edit-period").addEventListener("click", () => openPeriod(activePeriod()));
  element("add-reading").addEventListener("click", () => openReading(activePeriod(), null));
  element("reminder-button").addEventListener("click", () => {
    showText("share-error", "");
    element("reminder-dialog").showModal();
  });

  if (typeof navigator.share === "function" && location.protocol !== "file:") {
    element("share-hint").hidden = false;
    element("share-reminder").hidden = false;
    element("share-reminder").addEventListener("click", async () => {
      try {
        await navigator.share({ title: "Stromzähler ablesen", url: new URL("./", location.href).href });
      } catch (error) {
        if (error.name !== "AbortError") showText("share-error", "Öffne zum Teilen das Menü in Safari.");
      }
    });
  }

  async function refresh() {
    const sequence = ++refreshSequence;
    try {
      const snapshot = await storage.read();
      if (sequence !== refreshSequence) return;
      state = snapshot;
      showText("storage-notice", "");
      element("setup-button").disabled = false;
    } catch {
      if (sequence !== refreshSequence) return;
      showText("storage-notice", "Der Gerätespeicher ist gerade nicht verfügbar. Öffne die App in einem normalen Browserfenster. Die Beispieldaten kannst du direkt ansehen.");
      element("setup-button").disabled = true;
    }
    render();
  }

  if (demo) {
    element("demo-strip").hidden = false;
    selectedId = "beispiel-2026";
    render();
  } else {
    channel?.addEventListener("message", refresh);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
    refresh();
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
