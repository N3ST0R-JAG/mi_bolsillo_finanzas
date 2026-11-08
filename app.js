"use strict";

const moneyFormatter = new Intl.NumberFormat("es-PY", { style: "currency", currency: "PYG", maximumFractionDigits: 0 });
const shortMoneyFormatter = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const colors = ["#4d9e70", "#e19a88", "#7391c4", "#d9aa50", "#8e79b9", "#5daeb1", "#d27d9c", "#8a9b77", "#b59578"];
const pageDetails = {
  dashboard: { title: "Inicio", subtitle: "Un resumen claro para tomar mejores decisiones.", eyebrow: "TU DINERO, EN ORDEN" },
  income: { title: "Ingresos", subtitle: "Registra y consulta el dinero que recibes.", eyebrow: "ENTRADAS DE DINERO" },
  expenses: { title: "Gastos", subtitle: "Registra y organiza en qué utilizas tu dinero.", eyebrow: "SALIDAS DE DINERO" },
  budgets: { title: "Presupuestos", subtitle: "Pon límites a tus gastos y sigue tu plan.", eyebrow: "PLANIFICA TU MES" },
  charts: { title: "Gráficos", subtitle: "Visualiza cómo se mueven tus finanzas.", eyebrow: "TUS NÚMEROS, A LA VISTA" },
  history: { title: "Historial", subtitle: "Encuentra y revisa tus movimientos registrados.", eyebrow: "TODO EN UN SOLO LUGAR" },
};
const config = window.MI_BOLSILLO_CONFIG || {};
const supabaseLibrary = window.supabase;
let supabaseClient = null;
try {
  const url = String(config.SUPABASE_URL || "");
  const key = String(config.SUPABASE_PUBLISHABLE_KEY || "");
  if (supabaseLibrary?.createClient && /^https:\/\//i.test(url) && !url.includes("TU-PROJECT-REF") && key.length > 30 && !key.includes("TU_CLAVE_PUBLICA")) {
    supabaseClient = supabaseLibrary.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
} catch (error) {
  supabaseClient = null;
}
const state = { transactions: [], budgets: [], profile: null, user: null };
let toastTimeout;
let authLoadSequence = 0;

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function currentMonth() { return localToday().slice(0, 7); }
function formatMoney(value) { return moneyFormatter.format(Math.round(Number(value) || 0)); }
function monthName(month, short = false) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return "Todos los meses";
  const [year, index] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("es-PY", { month: short ? "short" : "long", year: short ? undefined : "numeric" }).format(new Date(year, index - 1, 1));
}
function formatDate(date) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "—";
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function sortNewest(items) { return [...items].sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))); }
function byMonth(items, month) { return items.filter((item) => item.date.slice(0, 7) === month); }
function total(items) { return items.reduce((sum, item) => sum + Number(item.amount || 0), 0); }
function monthTransactions(month) { return byMonth(state.transactions, month); }
function transactionTotal(type) { return total(state.transactions.filter((item) => item.type === type)); }
function spendingFor(category, month) { return total(state.transactions.filter((item) => item.type === "expense" && item.category === category && item.date.slice(0, 7) === month)); }
function safeId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("visible"), 2800);
}

let accountReady = false;

function setAuthNotice(message = "", isError = false) {
  const notice = document.getElementById("auth-notice");
  notice.textContent = message;
  notice.classList.toggle("error", isError);
  notice.hidden = !message;
}

function showAuthView(view) {
  const names = ["login", "register", "balance"];
  const selected = names.includes(view) ? view : "login";
  names.forEach((name) => {
    const panel = document.getElementById(`auth-${name}-view`);
    panel.hidden = name !== selected;
  });
  document.getElementById("auth-shell").hidden = false;
  document.getElementById("app-shell").hidden = true;
  document.getElementById("auth-setup-warning").hidden = Boolean(supabaseClient);
}

function friendlyAuthError(error) {
  const message = String(error?.message || error || "Ocurrió un error inesperado.");
  if (/invalid login credentials/i.test(message)) return "El correo o la contraseña no son correctos.";
  if (/already registered|user already exists/i.test(message)) return "Ya existe una cuenta con ese correo. Prueba iniciar sesión.";
  if (/profiles_username_lower_unique|duplicate key|unique constraint/i.test(message)) return "Ese nombre de usuario ya está en uso. Elige otro.";
  if (/database error saving new user/i.test(message)) return "No se pudo crear el perfil. Comprueba que el nombre de usuario esté disponible y que el esquema SQL esté instalado.";
  if (/row-level security|permission denied|schema cache|relation .* does not exist/i.test(message)) return "La base de datos no está lista. Ejecuta supabase/schema.sql en el SQL Editor de Supabase.";
  if (/failed to fetch|networkerror|load failed/i.test(message)) return "No se pudo conectar con Supabase. Revisa la conexión y los datos de supabase-config.js.";
  return message;
}

function setAuthBusy(busy) {
  document.querySelectorAll("#login-form button[type='submit'], #register-form button[type='submit'], #balance-form button[type='submit'], [data-google-signin]").forEach((button) => {
    button.disabled = busy || !supabaseClient;
  });
}

function mapTransaction(row) {
  return { id: row.id, type: row.type, description: row.description, amount: Number(row.amount), date: row.date, category: row.category, method: row.method, createdAt: row.created_at };
}

function mapBudget(row) {
  return { id: row.id, category: row.category, month: String(row.month).slice(0, 7), amount: Number(row.amount) };
}

function profileDisplayName(profile, user) {
  return profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "Mi cuenta";
}

async function loadAccount(session) {
  const requestNumber = ++authLoadSequence;
  const user = session?.user;
  if (!user) {
    accountReady = false;
    state.user = null;
    state.profile = null;
    state.transactions = [];
    state.budgets = [];
    showAuthView("login");
    setAuthNotice("");
    return;
  }
  if (accountReady && state.user?.id === user.id) return;
  accountReady = false;
  state.user = user;
  showAuthView("login");
  setAuthNotice("Cargando tu cuenta…");
  try {
    const { data: profile, error: profileError } = await supabaseClient.from("profiles").select("id, full_name, username, opening_balance, setup_complete").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    if (requestNumber !== authLoadSequence) return;
    if (!profile) throw new Error("No encontramos tu perfil. Comprueba que el trigger de perfiles esté instalado y vuelve a iniciar sesión.");
    state.profile = profile;
    if (!profile.setup_complete) {
      const usernameInput = document.querySelector('#balance-form input[name="username"]');
      const usernameLabel = document.getElementById("setup-username-label");
      usernameInput.value = profile.username || "";
      usernameInput.disabled = Boolean(profile.username);
      usernameInput.required = !profile.username;
      usernameLabel.hidden = Boolean(profile.username);
      accountReady = true;
      showAuthView("balance");
      setAuthNotice("");
      return;
    }

    const [transactionResult, budgetResult] = await Promise.all([
      supabaseClient.from("transactions").select("id, type, description, amount, date, category, method, created_at").order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabaseClient.from("budgets").select("id, category, month, amount").order("month", { ascending: false }).order("category", { ascending: true }),
    ]);
    if (transactionResult.error) throw transactionResult.error;
    if (budgetResult.error) throw budgetResult.error;
    if (requestNumber !== authLoadSequence) return;
    state.transactions = (transactionResult.data || []).map(mapTransaction);
    state.budgets = (budgetResult.data || []).map(mapBudget);
    document.getElementById("account-name").textContent = profileDisplayName(profile, user);
    document.getElementById("account-avatar").textContent = profileDisplayName(profile, user).trim().charAt(0) || "M";
    setDefaultDates();
    renderAll();
    document.getElementById("auth-shell").hidden = true;
    document.getElementById("app-shell").hidden = false;
    accountReady = true;
    setAuthNotice("");
  } catch (error) {
    if (requestNumber !== authLoadSequence) return;
    state.profile = null;
    state.transactions = [];
    state.budgets = [];
    showAuthView("login");
    setAuthNotice(friendlyAuthError(error), true);
  }
}

function appRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

async function runAuthAction(action) {
  if (!supabaseClient) {
    setAuthNotice("Conecta Supabase para habilitar el inicio de sesión.", true);
    return;
  }
  setAuthNotice("");
  setAuthBusy(true);
  try {
    await action();
  } catch (error) {
    setAuthNotice(friendlyAuthError(error), true);
  } finally {
    setAuthBusy(false);
  }
}

async function handleLogin(form) {
  const values = new FormData(form);
  await runAuthAction(async () => {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: String(values.get("email")).trim(),
      password: String(values.get("password")),
    });
    if (error) throw error;
    await loadAccount(data.session);
  });
}

async function handleRegistration(form) {
  const values = new FormData(form);
  const username = String(values.get("username")).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
    setAuthNotice("El nombre de usuario debe tener entre 3 y 24 caracteres válidos.", true);
    return;
  }
  await runAuthAction(async () => {
    const { data, error } = await supabaseClient.auth.signUp({
      email: String(values.get("email")).trim(),
      password: String(values.get("password")),
      options: {
        emailRedirectTo: appRedirectUrl(),
        data: { full_name: String(values.get("full_name")).trim(), username },
      },
    });
    if (error) throw error;
    if (data.session) {
      await loadAccount(data.session);
    } else {
      showAuthView("login");
      setAuthNotice("Cuenta creada. Confirma el correo que te enviamos y luego inicia sesión para elegir tu saldo inicial.");
    }
  });
}

async function handleGoogleSignIn() {
  await runAuthAction(async () => {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: appRedirectUrl(), queryParams: { prompt: "select_account" } },
    });
    if (error) throw error;
  });
}

async function handleOpeningBalance(form) {
  const values = new FormData(form);
  const amount = Number(values.get("opening_balance"));
  if (!Number.isSafeInteger(amount) || amount < 0) {
    setAuthNotice("Ingresa un saldo inicial entero igual o mayor que cero.", true);
    return;
  }
  const usernameInput = form.elements.username;
  const username = usernameInput.disabled ? state.profile.username : String(values.get("username")).trim().toLowerCase();
  if (!username || !/^[a-z0-9._-]{3,24}$/.test(username)) {
    setAuthNotice("El nombre de usuario debe tener entre 3 y 24 caracteres válidos.", true);
    return;
  }
  await runAuthAction(async () => {
    const { data, error } = await supabaseClient.from("profiles").update({ username, opening_balance: amount, setup_complete: true }).eq("id", state.user.id).select("id, full_name, username, opening_balance, setup_complete").single();
    if (error) throw error;
    state.profile = data;
    accountReady = false;
    await loadAccount({ user: state.user });
  });
}

function navigate(page) {
  if (!pageDetails[page]) return;
  document.querySelectorAll(".page-view").forEach((view) => {
    const isActive = view.id === `page-${page}`;
    view.classList.toggle("active", isActive);
    view.hidden = !isActive;
  });
  document.querySelectorAll("[data-nav]").forEach((button) => {
    const active = button.dataset.nav === page;
    button.classList.toggle("active", active);
    if (button.classList.contains("nav-item")) {
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
  });
  const details = pageDetails[page];
  document.getElementById("page-title").textContent = details.title;
  document.getElementById("page-subtitle").textContent = details.subtitle;
  document.getElementById("page-eyebrow").textContent = details.eyebrow;
  const action = document.getElementById("header-action");
  const actionLabels = { income: "Registrar ingreso", expenses: "Registrar gasto", budgets: "Crear presupuesto" };
  action.hidden = !actionLabels[page];
  document.getElementById("header-action-label").textContent = actionLabels[page] || "Registrar";
  action.dataset.target = page;
  if (page === "income" || page === "expenses" || page === "budgets") {
    const target = page === "budgets" ? document.querySelector("#budget-form select") : document.querySelector(`[data-movement-form="${page === "income" ? "income" : "expense"}"] input[name="description"]`);
    setTimeout(() => target?.focus({ preventScroll: true }), 50);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function emptyState(title, message, symbol = "＋") {
  return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">${symbol}</span><strong>${escapeHTML(title)}</strong>${escapeHTML(message)}</div>`;
}

function transactionTable(items, showActions = false) {
  if (!items.length) return emptyState("Todavía no hay movimientos", "Cuando registres uno, aparecerá aquí.");
  const rows = sortNewest(items).map((item) => {
    const income = item.type === "income";
    const typeText = income ? "Ingreso" : "Gasto";
    return `<tr>
      <td><div class="movement-title"><span class="movement-badge ${income ? "income" : "expense"}" aria-hidden="true">${income ? "↗" : "↘"}</span><span>${escapeHTML(item.description)}</span></div></td>
      <td>${escapeHTML(item.category)}</td><td>${escapeHTML(formatDate(item.date))}</td><td>${escapeHTML(item.method)}</td>
      <td><span class="type-pill ${income ? "income" : "expense"}">${typeText}</span></td>
      <td class="${income ? "amount-positive" : "amount-negative"}">${income ? "+" : "−"}${formatMoney(item.amount)}</td>
      ${showActions ? `<td class="action-cell"><button class="icon-button" type="button" data-delete-transaction="${escapeHTML(item.id)}" aria-label="Eliminar ${typeText.toLowerCase()}: ${escapeHTML(item.description)}" title="Eliminar">×</button></td>` : ""}
    </tr>`;
  }).join("");
  return `<table class="data-table"><thead><tr><th>DESCRIPCIÓN</th><th>CATEGORÍA</th><th>FECHA</th><th>MEDIO</th><th>TIPO</th><th class="amount-head">MONTO</th>${showActions ? "<th></th>" : ""}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderSummary() {
  const month = document.getElementById("dashboard-month").value || currentMonth();
  const entries = monthTransactions(month);
  const incomes = entries.filter((item) => item.type === "income");
  const expenses = entries.filter((item) => item.type === "expense");
  const budgets = state.budgets.filter((budget) => budget.month === month);
  const openingBalance = Number(state.profile?.opening_balance || 0);
  document.getElementById("summary-income").textContent = formatMoney(total(incomes));
  document.getElementById("summary-expenses").textContent = formatMoney(total(expenses));
  document.getElementById("summary-balance").textContent = formatMoney(openingBalance + transactionTotal("income") - transactionTotal("expense"));
  document.getElementById("summary-opening-balance").textContent = formatMoney(openingBalance);
  document.getElementById("summary-income-count").textContent = `${incomes.length} ${incomes.length === 1 ? "movimiento" : "movimientos"} · ${monthName(month)}`;
  document.getElementById("summary-expense-count").textContent = `${expenses.length} ${expenses.length === 1 ? "movimiento" : "movimientos"} · ${monthName(month)}`;
  const preview = document.getElementById("dashboard-budget-preview");
  if (!budgets.length) {
    preview.innerHTML = emptyState("Aún no tienes presupuestos", "Crea límites por categoría para este mes.", "◎");
  } else {
    preview.innerHTML = budgets.slice(0, 4).map((budget) => budgetProgressMarkup(budget, false)).join("");
  }
  document.getElementById("dashboard-recent").innerHTML = transactionTable(sortNewest(state.transactions).slice(0, 5));
}

function budgetProgressMarkup(budget, full = true) {
  const spent = spendingFor(budget.category, budget.month);
  const limit = Number(budget.amount);
  const percent = limit > 0 ? spent / limit * 100 : 0;
  const width = Math.min(100, percent);
  const over = percent >= 100;
  if (!full) return `<div class="budget-preview"><div class="budget-preview-top"><strong>${escapeHTML(budget.category)}</strong><span>${formatMoney(spent)} / ${formatMoney(limit)}</span></div><div class="progress-track"><div class="progress-fill ${over ? "over" : ""}" style="width:${width}%"></div></div><div class="budget-preview-caption"><span>${over ? "Límite alcanzado" : `${Math.round(percent)}% utilizado`}</span><span>${escapeHTML(monthName(budget.month))}</span></div></div>`;
  return `<article class="budget-card"><div class="budget-card-top"><div><div class="budget-category"><span class="budget-category-icon" aria-hidden="true">◎</span>${escapeHTML(budget.category)}</div><p class="budget-month">${escapeHTML(monthName(budget.month))}</p></div><button class="budget-delete" type="button" data-delete-budget="${escapeHTML(budget.id)}" aria-label="Eliminar presupuesto de ${escapeHTML(budget.category)}" title="Eliminar presupuesto">×</button></div><div class="budget-amount-row"><span>Gastado</span><strong>${formatMoney(spent)} <span style="font-weight:400;color:#a2aaa5">de ${formatMoney(limit)}</span></strong></div><div class="progress-track"><div class="progress-fill ${over ? "over" : ""}" style="width:${width}%"></div></div><div class="budget-bottom-row"><span class="${over ? "over-text" : ""}">${over ? `Superaste el límite por ${formatMoney(spent - limit)}` : `${Math.round(percent)}% utilizado`}</span><span>Límite: ${formatMoney(limit)}</span></div></article>`;
}

function renderBudgetList() {
  const budgets = [...state.budgets].sort((a, b) => b.month.localeCompare(a.month) || a.category.localeCompare(b.category));
  document.getElementById("budget-total-count").textContent = String(budgets.length);
  document.getElementById("budget-list").innerHTML = budgets.length ? budgets.map((item) => budgetProgressMarkup(item)).join("") : emptyState("Todavía no creaste presupuestos", "Elige una categoría, un límite y el mes que quieres organizar.", "◎");
}

function renderMovementPages() {
  const incomes = state.transactions.filter((item) => item.type === "income");
  const expenses = state.transactions.filter((item) => item.type === "expense");
  document.getElementById("income-total-count").textContent = String(incomes.length);
  document.getElementById("expense-total-count").textContent = String(expenses.length);
  document.getElementById("income-list").innerHTML = transactionTable(incomes, true);
  document.getElementById("expense-list").innerHTML = transactionTable(expenses, true);
}

function renderHistory() {
  const month = document.getElementById("history-month").value;
  const type = document.getElementById("history-type").value;
  let items = state.transactions;
  if (month) items = items.filter((item) => item.date.slice(0, 7) === month);
  if (type !== "all") items = items.filter((item) => item.type === type);
  const description = [month ? monthName(month) : "Todos los meses", type === "all" ? "ingresos y gastos" : type === "income" ? "ingresos" : "gastos"].join(" · ");
  document.getElementById("history-caption").textContent = description;
  document.getElementById("history-count").textContent = String(items.length);
  document.getElementById("history-list").innerHTML = transactionTable(items, true);
}

function lastSixMonths() {
  const now = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}
function abbreviatedAmount(value) {
  if (value >= 1_000_000) return `₲${shortMoneyFormatter.format(value / 1_000_000)}M`;
  if (value >= 10_000) return `₲${shortMoneyFormatter.format(value / 1_000)}k`;
  return value === 0 ? "₲0" : `₲${shortMoneyFormatter.format(value)}`;
}
function renderMonthlyChart(id) {
  const svg = document.getElementById(id);
  const months = lastSixMonths();
  const series = months.map((month) => {
    const items = monthTransactions(month);
    return { month, income: total(items.filter((item) => item.type === "income")), expense: total(items.filter((item) => item.type === "expense")) };
  });
  const width = 720; const height = id === "full-monthly-chart" ? 290 : 220;
  const left = 58; const right = 14; const top = 16; const bottom = 34;
  const chartHeight = height - top - bottom; const chartWidth = width - left - right;
  const maximum = Math.max(0, ...series.flatMap((item) => [item.income, item.expense]));
  const scaleMax = maximum === 0 ? 100000 : maximum * 1.15;
  const ticks = 4;
  let markup = `<title>Ingresos y gastos de los últimos seis meses</title><desc>Montos expresados en guaraníes.</desc>`;
  for (let index = 0; index <= ticks; index += 1) {
    const y = top + chartHeight - chartHeight * index / ticks;
    markup += `<line class="chart-grid-line" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"/><text class="chart-axis-label" x="${left - 8}" y="${y + 3}" text-anchor="end">${abbreviatedAmount(scaleMax * index / ticks)}</text>`;
  }
  const groupWidth = chartWidth / series.length;
  const barWidth = Math.min(27, groupWidth * .23);
  series.forEach((item, index) => {
    const center = left + index * groupWidth + groupWidth / 2;
    const incHeight = Math.max(item.income ? 2 : 0, chartHeight * item.income / scaleMax);
    const expHeight = Math.max(item.expense ? 2 : 0, chartHeight * item.expense / scaleMax);
    const incY = top + chartHeight - incHeight; const expY = top + chartHeight - expHeight;
    markup += `<rect class="chart-bar-income" x="${center - barWidth - 2}" y="${incY}" width="${barWidth}" height="${incHeight}" rx="4"><title>Ingresos ${monthName(item.month)}: ${formatMoney(item.income)}</title></rect>`;
    markup += `<rect class="chart-bar-expense" x="${center + 2}" y="${expY}" width="${barWidth}" height="${expHeight}" rx="4"><title>Gastos ${monthName(item.month)}: ${formatMoney(item.expense)}</title></rect>`;
    markup += `<text class="chart-month-label" x="${center}" y="${height - 8}" text-anchor="middle">${escapeHTML(monthName(item.month, true).replace(".", ""))}</text>`;
  });
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = markup;
}

function renderCategoryChart() {
  const month = document.getElementById("chart-month").value || currentMonth();
  const expenses = state.transactions.filter((item) => item.type === "expense" && item.date.slice(0, 7) === month);
  const groups = new Map();
  expenses.forEach((item) => groups.set(item.category, (groups.get(item.category) || 0) + Number(item.amount)));
  const entries = [...groups.entries()].sort((a, b) => b[1] - a[1]);
  const sum = total(expenses);
  document.getElementById("category-chart-caption").textContent = `Distribución de ${monthName(month)}.`;
  const donut = document.getElementById("expense-donut");
  if (!sum) {
    donut.innerHTML = `<div class="donut-svg" style="display:grid;place-items:center;border:13px solid #eef2ef;border-radius:50%;color:#a0aaa4;font-size:9px">Sin gastos</div>`;
    document.getElementById("expense-category-legend").innerHTML = `<div class="empty-state">No hay gastos para este mes.</div>`;
    return;
  }
  const circumference = 2 * Math.PI * 58;
  let consumed = 0;
  const segments = entries.map(([category, amount], index) => {
    const length = amount / sum * circumference;
    const segment = `<circle cx="75" cy="75" r="58" fill="none" stroke="${colors[index % colors.length]}" stroke-width="17" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-consumed}"/>`;
    consumed += length;
    return segment;
  }).join("");
  donut.innerHTML = `<svg class="donut-svg" viewBox="0 0 150 150" role="img" aria-label="Gastos totales ${formatMoney(sum)} distribuidos por categoría"><circle cx="75" cy="75" r="58" fill="none" stroke="#eef2ef" stroke-width="17"/>${segments}<text class="donut-total" x="75" y="72">${escapeHTML(abbreviatedAmount(sum))}</text><text class="donut-caption" x="75" y="90">total del mes</text></svg>`;
  document.getElementById("expense-category-legend").innerHTML = entries.map(([category, amount], index) => `<div class="category-legend-row"><i class="legend-dot" style="background:${colors[index % colors.length]}"></i><span class="cat-name">${escapeHTML(category)}</span><span class="cat-value">${formatMoney(amount)}</span></div>`).join("");
}

function renderCharts() {
  renderMonthlyChart("dashboard-monthly-chart");
  renderMonthlyChart("full-monthly-chart");
  renderCategoryChart();
  const income = transactionTotal("income"); const expenses = transactionTotal("expense");
  const openingBalance = Number(state.profile?.opening_balance || 0);
  document.getElementById("chart-balance").textContent = formatMoney(openingBalance + income - expenses);
  document.getElementById("chart-opening-balance").textContent = formatMoney(openingBalance);
  document.getElementById("chart-total-income").textContent = formatMoney(income);
  document.getElementById("chart-total-expenses").textContent = formatMoney(expenses);
}

function renderAll() {
  renderSummary();
  renderMovementPages();
  renderBudgetList();
  renderHistory();
  renderCharts();
}

function setDefaultDates() {
  document.querySelectorAll('[data-movement-form] input[name="date"]').forEach((input) => { input.value = localToday(); });
  document.querySelector('#budget-form input[name="month"]').value = currentMonth();
  document.getElementById("dashboard-month").value = currentMonth();
  document.getElementById("chart-month").value = currentMonth();
}

document.addEventListener("click", async (event) => {
  const authSwitch = event.target.closest("[data-auth-view]");
  if (authSwitch) {
    setAuthNotice("");
    showAuthView(authSwitch.dataset.authView);
    return;
  }
  if (event.target.closest("[data-google-signin]")) {
    await handleGoogleSignIn();
    return;
  }
  const nav = event.target.closest("[data-nav]");
  if (nav) { event.preventDefault(); navigate(nav.dataset.nav); return; }
  const deleteTransaction = event.target.closest("[data-delete-transaction]");
  if (deleteTransaction) {
    const transaction = state.transactions.find((item) => item.id === deleteTransaction.dataset.deleteTransaction);
    if (!transaction || !window.confirm(`¿Eliminar el movimiento “${transaction.description}”?`)) return;
    const { error } = await supabaseClient.from("transactions").delete().eq("id", transaction.id);
    if (error) { showToast(friendlyAuthError(error), true); return; }
    state.transactions = state.transactions.filter((item) => item.id !== transaction.id);
    renderAll(); showToast("Movimiento eliminado."); return;
  }
  const deleteBudget = event.target.closest("[data-delete-budget]");
  if (deleteBudget) {
    const budget = state.budgets.find((item) => item.id === deleteBudget.dataset.deleteBudget);
    if (!budget || !window.confirm(`¿Eliminar el presupuesto de ${budget.category} para ${monthName(budget.month)}?`)) return;
    const { error } = await supabaseClient.from("budgets").delete().eq("id", budget.id);
    if (error) { showToast(friendlyAuthError(error), true); return; }
    state.budgets = state.budgets.filter((item) => item.id !== budget.id);
    renderAll(); showToast("Presupuesto eliminado.");
  }
});

document.getElementById("header-action").addEventListener("click", () => {
  const page = document.getElementById("header-action").dataset.target;
  const form = page === "budgets" ? document.getElementById("budget-form") : document.querySelector(`[data-movement-form="${page === "income" ? "income" : "expense"}"]`);
  form?.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => form?.querySelector("input,select")?.focus(), 150);
});

document.getElementById("login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void handleLogin(event.currentTarget);
});

document.getElementById("register-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void handleRegistration(event.currentTarget);
});

document.getElementById("balance-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void handleOpeningBalance(event.currentTarget);
});

document.getElementById("sign-out").addEventListener("click", async () => {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) showToast(friendlyAuthError(error), true);
  else await loadAccount(null);
});

document.querySelectorAll("[data-movement-form]").forEach((form) => form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const amount = Number(data.get("amount"));
  if (!Number.isSafeInteger(amount) || amount <= 0) { showToast("Ingresa un monto entero mayor que cero.", true); return; }
  const transaction = { type: form.dataset.movementForm, description: String(data.get("description")).trim(), amount, date: String(data.get("date")), category: String(data.get("category")), method: String(data.get("method")) };
  if (!transaction.description || !/^\d{4}-\d{2}-\d{2}$/.test(transaction.date)) { showToast("Revisa la descripción y la fecha.", true); return; }
  const submit = form.querySelector("button[type='submit']");
  submit.disabled = true;
  const { data: saved, error } = await supabaseClient.from("transactions").insert(transaction).select("id, type, description, amount, date, category, method, created_at").single();
  submit.disabled = false;
  if (error) { showToast(friendlyAuthError(error), true); return; }
  state.transactions.push(mapTransaction(saved));
  form.reset(); form.elements.date.value = localToday();
  renderAll();
  showToast(form.dataset.movementForm === "income" ? "Ingreso guardado correctamente." : "Gasto guardado correctamente.");
}));

document.getElementById("budget-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const amount = Number(data.get("amount"));
  const category = String(data.get("category")); const month = String(data.get("month"));
  if (!Number.isSafeInteger(amount) || amount <= 0) { showToast("Ingresa un límite entero mayor que cero.", true); return; }
  if (!/^\d{4}-\d{2}$/.test(month)) { showToast("Selecciona un mes válido.", true); return; }
  const submit = form.querySelector("button[type='submit']");
  submit.disabled = true;
  const { data: saved, error } = await supabaseClient.from("budgets").upsert(
    { category, month: `${month}-01`, amount },
    { onConflict: "user_id,category,month" },
  ).select("id, category, month, amount").single();
  submit.disabled = false;
  if (error) { showToast(friendlyAuthError(error), true); return; }
  const updated = mapBudget(saved);
  const existingIndex = state.budgets.findIndex((item) => item.category === updated.category && item.month === updated.month);
  if (existingIndex >= 0) state.budgets[existingIndex] = updated;
  else state.budgets.push(updated);
  form.reset(); form.elements.month.value = currentMonth();
  renderAll();
  showToast(existingIndex >= 0 ? "Presupuesto actualizado." : "Presupuesto guardado correctamente.");
});

document.getElementById("dashboard-month").addEventListener("change", renderAll);
document.getElementById("chart-month").addEventListener("change", renderCategoryChart);
document.getElementById("history-month").addEventListener("change", renderHistory);
document.getElementById("history-type").addEventListener("change", renderHistory);
setDefaultDates();
renderAll();

showAuthView("login");
setAuthBusy(false);
if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => { void loadAccount(session); }, 0);
  });
  supabaseClient.auth.getSession().then(({ data, error }) => {
    if (error) setAuthNotice(friendlyAuthError(error), true);
    else void loadAccount(data.session);
  });
} else {
  setAuthNotice("Completa la configuración de Supabase para habilitar el inicio de sesión.");
}
