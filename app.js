(function () {
  "use strict";
  const Booking = window.GatherBooking;
  const ACCOUNTS_KEY = "gather-local-accounts-v1";
  const SESSION_KEY = "gather-local-session-v1";
  const ACCOUNT_RESET_KEY = "gather-account-reset-v1";
  if (localStorage.getItem(ACCOUNT_RESET_KEY) !== "done") {
    localStorage.removeItem(ACCOUNTS_KEY);
    localStorage.removeItem(SESSION_KEY);
    localStorage.setItem(ACCOUNT_RESET_KEY, "done");
  }
  const state = loadState();
  const accounts = loadAccounts();
  let currentUser = loadSession();
  const $ = (selector, scope) => (scope || document).querySelector(selector);
  const $$ = (selector, scope) => Array.from((scope || document).querySelectorAll(selector));
  const today = Booking.toDateString(new Date());
  const minDate = Booking.addDays(today, 1);
  let activeTab = "home";
  let selectedCategory = "All stays";
  let searchTerm = "";
  let sortMode = "recommended";
  let maxPrice = 50000;
  let minRating = 0;
  let searchCheckin = minDate;
  let searchCheckout = Booking.addDays(minDate, 4);
  let searchGuests = 2;
  const initialSearchParams = new URLSearchParams(window.location.search);
  const initialCheckin = initialSearchParams.get("checkin");
  const initialCheckout = initialSearchParams.get("checkout");
  const initialGuests = Number(initialSearchParams.get("guests"));
  if (initialCheckin && Booking.parseDate(initialCheckin) && initialCheckin >= minDate) {
    searchCheckin = initialCheckin;
    searchCheckout = Booking.addDays(searchCheckin, 4);
  }
  if (initialCheckout && Booking.parseDate(initialCheckout) && initialCheckout > searchCheckin) {
    searchCheckout = initialCheckout;
  }
  if (Number.isInteger(initialGuests) && initialGuests >= 1 && initialGuests <= 8) searchGuests = initialGuests;
  searchTerm = (initialSearchParams.get("destination") || "").trim().slice(0, 100);
  let activeOfferingId = null;
  let editingOfferingId = null;
  let authIntent = null;
  let toastTimer;
  let stayMap = null;
  let countryBoundary = null;
  let mapPopupCloseTimer = null;
  let mappedMapOfferings = [];
  const stayMarkers = new Map();
  const philippinesBounds = [[4, 115], [22, 128]];
  const elements = {
    grid: $("#offering-grid"), categories: $("#category-filters"),
    bookingList: $("#booking-list"), manageOfferings: $("#manage-offerings"),
    modal: $("#booking-modal"), modalContent: $("#modal-content"), toast: $("#toast")
  };
  const searchForms = $$(".stay-search-form");

  function syncSearchForms() {
    searchForms.forEach((form) => {
      $('[data-search-field="destination"]', form).value = searchTerm;
      $('[data-search-field="checkin"]', form).value = searchCheckin;
      $('[data-search-field="checkin"]', form).min = minDate;
      $('[data-search-field="checkout"]', form).value = searchCheckout;
      $('[data-search-field="checkout"]', form).min = Booking.addDays(searchCheckin, 1);
      $('[data-search-field="guests"]', form).value = String(searchGuests);
    });
  }
  syncSearchForms();

  function loadState() {
    const stored = localStorage.getItem(Booking.STORAGE_KEY);
    if (!stored) return Booking.createInitialState();
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed.offerings) || !Array.isArray(parsed.bookings)) throw new Error("Saved stay data is incomplete.");
      parsed.offerings = Booking.withDefaultOfferings(parsed.offerings);
      if (!Array.isArray(parsed.favorites)) parsed.favorites = [];
      return parsed;
    } catch (error) {
      console.error("Could not read saved stay data.", error);
      window.setTimeout(() => showToast("Saved data could not be loaded. Your browser storage may be damaged."), 0);
      return Booking.createInitialState();
    }
  }

  function saveState() {
    try { localStorage.setItem(Booking.STORAGE_KEY, JSON.stringify(state)); }
    catch (error) {
      console.error("Could not save stay data.", error);
      showToast("Couldn’t save changes. Check that browser storage is available.");
      throw error;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function money(value) {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  function prettyDate(dateString, options) {
    const date = Booking.parseDate(dateString);
    return date ? new Intl.DateTimeFormat(undefined, options || { month: "short", day: "numeric", year: "numeric" }).format(date) : dateString;
  }

  function stayDates(checkin, checkout) {
    return `${prettyDate(checkin)} – ${prettyDate(checkout)}`;
  }

  function photoUrl(image, width) {
    return `https://images.unsplash.com/${encodeURIComponent(image || "photo-1449158743715-0a90ebb6d2d8")}?auto=format&fit=crop&w=${width || 900}&q=80`;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 3000);
  }

  function navigate(tab, updateLocation) {
    if (tab === "bookings" && !currentUser) {
      openAuthModal("signup", "guest", { type: "bookings" });
      return;
    }
    if (tab === "manage" && (!currentUser || currentUser.role !== "host")) {
      openAuthModal(currentUser ? "signup" : "signup", "host", { type: "manage" });
      return;
    }
    activeTab = tab;
    const nextUrl = new URL(window.location.href);
    if (tab === "search") {
      nextUrl.searchParams.set("destination", searchTerm);
      nextUrl.searchParams.set("checkin", searchCheckin);
      nextUrl.searchParams.set("checkout", searchCheckout);
      nextUrl.searchParams.set("guests", String(searchGuests));
    }
    nextUrl.hash = tab;
    if (updateLocation !== false && nextUrl.href !== window.location.href) {
      window.history.pushState(null, "", nextUrl);
    }
    $$(".view").forEach((view) => {
      const active = view.id === `${tab}-view`;
      view.classList.toggle("active", active);
      view.hidden = !active;
    });
    $$(".nav-link[data-tab-link]").forEach((link) => {
      const active = link.dataset.tabLink === tab;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    if (tab === "search") {
      syncSearchForms();
      renderCategories();
      renderOfferings();
      window.requestAnimationFrame(() => stayMap && stayMap.invalidateSize({ pan: false }));
    }
    if (tab === "home") renderFeaturedOfferings();
    if (tab === "bookings") renderBookings();
    if (tab === "manage") renderManager();
    $("#account-dropdown").classList.add("hidden");
    $("#account-button").setAttribute("aria-expanded", "false");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function loadAccounts() {
    const stored = localStorage.getItem(ACCOUNTS_KEY);
    if (!stored) return [];
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) throw new Error("Saved account data is not a list.");
      return parsed;
    } catch (error) {
      console.error("Could not read local account data.", error);
      window.setTimeout(() => showToast("Saved accounts could not be loaded. Browser storage may be damaged."), 0);
      return [];
    }
  }

  function loadSession() {
    const accountId = localStorage.getItem(SESSION_KEY);
    if (!accountId) return null;
    const account = accounts.find((item) => item.id === accountId);
    if (!account) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return account;
  }

  function saveAccounts() {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  function encodeBytes(bytes) {
    return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
  }

  async function hashPassword(password, salt) {
    if (!window.crypto || !window.crypto.subtle) throw new Error("Secure password hashing is unavailable in this browser. Open Gather at http://localhost rather than as a file.");
    const key = await window.crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await window.crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 120000 }, key, 256);
    return encodeBytes(new Uint8Array(bits));
  }

  async function createLocalAccount(details) {
    const email = details.email.trim().toLowerCase();
    if (accounts.some((account) => account.email === email)) throw new Error("An account already uses this email. Sign in instead.");
    if (details.password.length < 8) throw new Error("Use a password with at least 8 characters.");
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const passwordHash = await hashPassword(details.password, salt);
    const account = {
      id: `account-${window.crypto.randomUUID()}`,
      name: details.name.trim(),
      email,
      role: details.role,
      salt: encodeBytes(salt),
      passwordHash,
      createdAt: new Date().toISOString()
    };
    accounts.push(account);
    saveAccounts();
    return account;
  }

  async function signInLocalAccount(details) {
    const email = details.email.trim().toLowerCase();
    const account = accounts.find((item) => item.email === email);
    if (!account) throw new Error("No Gather account uses that email. Create an account to get started.");
    const salt = Uint8Array.from(atob(account.salt), (character) => character.charCodeAt(0));
    const passwordHash = await hashPassword(details.password, salt);
    if (passwordHash !== account.passwordHash) throw new Error("That email and password don’t match.");
    return account;
  }

  function startSession(account) {
    currentUser = account;
    localStorage.setItem(SESSION_KEY, account.id);
    renderAccountButton();
    renderBookings();
    renderManager();
  }

  function endSession() {
    localStorage.removeItem(SESSION_KEY);
    currentUser = null;
    $("#account-dropdown").classList.add("hidden");
    $("#account-button").setAttribute("aria-expanded", "false");
    renderAccountButton();
    renderBookings();
    renderManager();
    navigate("home");
    showToast("You’ve signed out of Gather on this device.");
  }

  function renderAccountButton() {
    const button = $("#account-button");
    if (!currentUser) {
      $("#account-button-label").textContent = "Sign in";
      $(".profile-dot", button).textContent = "G";
      button.setAttribute("aria-label", "Sign in or create a Gather account");
      $("#account-dropdown").innerHTML = "";
      return;
    }
    $("#account-button-label").textContent = currentUser.name.split(/\s+/)[0];
    $(".profile-dot", button).textContent = currentUser.name.trim().charAt(0).toUpperCase();
    button.setAttribute("aria-label", `Account menu for ${currentUser.name}`);
    $("#account-dropdown").innerHTML = `
      <div class="account-menu-heading"><span class="profile-dot">${escapeHtml(currentUser.name.charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(currentUser.name)}</strong><small>${escapeHtml(currentUser.email)}</small><span class="account-role">${currentUser.role === "host" ? "GATHER HOST" : "GATHER GUEST"}</span></div></div>
      <button type="button" class="account-menu-link" data-account-action="${currentUser.role === "host" ? "manage" : "bookings"}">${currentUser.role === "host" ? "Your host dashboard" : "Your trips"} <span>→</span></button>
      <button type="button" class="account-menu-link signout-link" data-account-action="signout">Sign out</button>`;
  }

  function openAuthModal(mode, role, intent) {
    authIntent = intent || null;
    const isSignup = mode === "signup";
    elements.modalContent.innerHTML = `
      <div class="auth-heading"><span class="auth-logo" aria-hidden="true">g</span><p class="modal-kicker">${role === "host" ? "GATHER HOSTS" : "GATHER GUESTS"}</p><h2 id="modal-title">${isSignup ? "Come on in." : "Welcome back."}</h2><p>${isSignup ? (role === "host" ? "Create your host account and share a place with the Philippines." : "Create an account to save your plans and book a stay.") : "Sign in to pick up right where you left off."}</p></div>
      <form class="auth-form" id="auth-form">
        ${isSignup ? `<label>Your name<input name="name" required minlength="2" maxlength="80" autocomplete="name" placeholder="Alex Morgan"></label>` : ""}
        <label>Email address<input name="email" type="email" required maxlength="160" autocomplete="email" placeholder="alex@example.com"></label>
        <label>Password<input name="password" type="password" required minlength="${isSignup ? "8" : "1"}" maxlength="128" autocomplete="${isSignup ? "new-password" : "current-password"}" placeholder="${isSignup ? "At least 8 characters" : "Your password"}"></label>
        ${isSignup ? `<label>How will you use Gather?<select name="role"><option value="guest"${role === "guest" ? " selected" : ""}>I’m looking for a place to stay</option><option value="host"${role === "host" ? " selected" : ""}>I want to list a place</option></select></label>` : ""}
        <p class="auth-error form-error hidden" id="form-error" role="alert"></p>
        <button class="button button-dark auth-submit" type="submit">${isSignup ? "Create my account" : "Sign in"} <span aria-hidden="true">→</span></button>
      </form>
      <p class="auth-switch">${isSignup ? "Already have an account?" : "New to Gather?"} <button type="button" data-auth-mode="${isSignup ? "signin" : "signup"}" data-auth-role="${role}">${isSignup ? "Sign in" : "Create an account"}</button></p>
      <p class="auth-local-note">Demo account, saved in this browser only. Don’t reuse a real password.</p>`;
    elements.modal.classList.remove("hidden");
    elements.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    $("#auth-form").addEventListener("submit", submitAuth);
    $("[data-close-modal]").focus();
  }

  async function submitAuth(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const isSignup = formData.has("name");
    const error = $("#form-error");
    const button = $(".auth-submit");
    button.disabled = true;
    button.textContent = isSignup ? "Creating account…" : "Signing in…";
    try {
      if (authIntent && authIntent.type === "manage" && isSignup && formData.get("role") !== "host") {
        throw new Error("Choose “I want to list a place” to create a host account.");
      }
      const account = isSignup
        ? await createLocalAccount({ name: formData.get("name"), email: formData.get("email"), password: formData.get("password"), role: formData.get("role") })
        : await signInLocalAccount({ email: formData.get("email"), password: formData.get("password") });
      if (authIntent && authIntent.type === "manage" && account.role !== "host") {
        throw new Error("This part of Gather is for hosts. Create a host account or sign in with one.");
      }
      const intent = authIntent;
      authIntent = null;
      startSession(account);
      closeModal();
      showToast(`Welcome${isSignup ? " to Gather" : " back"}, ${account.name.split(/\s+/)[0]}.`);
      if (intent && intent.type === "booking") openBookingModal(intent.offeringId);
      else if (intent && intent.type === "manage") navigate("manage");
      else if (intent && intent.type === "bookings") navigate("bookings");
      else if (account.role === "host") navigate("manage");
      else navigate("home");
    } catch (caught) {
      error.textContent = caught.message;
      error.classList.remove("hidden");
      button.disabled = false;
      button.innerHTML = `${isSignup ? "Create my account" : "Sign in"} <span aria-hidden="true">→</span>`;
    }
  }

  function getFilteredOfferings() {
    const query = searchTerm.toLowerCase();
    const filtered = state.offerings.filter((offering) => {
      const matchesQuery = !query || query === "philippines" || query === "pilipinas" ||
        `${offering.name} ${offering.category} ${offering.description} ${offering.location} ${(offering.amenities || []).join(" ")}`.toLowerCase().includes(query);
      const matchesCategory = selectedCategory === "All stays" || offering.category === selectedCategory;
      return matchesQuery && matchesCategory && Number(offering.guests) >= searchGuests && Number(offering.price) <= maxPrice &&
        Number(offering.rating || 0) >= minRating &&
        Booking.isAvailable(offering, searchCheckin, searchCheckout, state.bookings, searchGuests);
    });
    if (sortMode === "price") filtered.sort((a, b) => Number(a.price) - Number(b.price));
    if (sortMode === "rating") filtered.sort((a, b) => Number(b.rating) - Number(a.rating));
    if (sortMode === "reviews") filtered.sort((a, b) => Number(b.reviews) - Number(a.reviews));
    return filtered;
  }

  function renderCategories() {
    const categories = ["All stays", ...new Set(state.offerings.map((item) => item.category))];
    if (!categories.includes(selectedCategory)) selectedCategory = "All stays";
    elements.categories.innerHTML = categories.map((category) =>
      `<button type="button" class="category-pill${category === selectedCategory ? " selected" : ""}" data-category="${escapeHtml(category)}" aria-pressed="${category === selectedCategory}">${escapeHtml(category)}</button>`
    ).join("");
  }

  function renderOfferingCard(offering) {
    return `
      <article class="offering-card">
        <div class="card-photo-wrap">
          <button type="button" class="photo-button" data-open-offering="${escapeHtml(offering.id)}" aria-label="View ${escapeHtml(offering.name)} and dates">
            <img class="card-photo" src="${photoUrl(offering.image)}" alt="${escapeHtml(offering.name)}, ${escapeHtml(offering.location)}" loading="lazy">
            <span class="card-badge">${escapeHtml(offering.badge || offering.category)}</span>
          </button>
          <button type="button" class="favorite-button${state.favorites.includes(offering.id) ? " saved" : ""}" data-favorite="${escapeHtml(offering.id)}" aria-label="${state.favorites.includes(offering.id) ? "Remove" : "Save"} ${escapeHtml(offering.name)} ${state.favorites.includes(offering.id) ? "from" : "to"} favorites" aria-pressed="${state.favorites.includes(offering.id)}">${state.favorites.includes(offering.id) ? "♥" : "♡"}</button>
        </div>
        <button class="offering-open" type="button" data-open-offering="${escapeHtml(offering.id)}" aria-label="Book ${escapeHtml(offering.name)}">
          <div class="offering-title-row"><h3>${escapeHtml(offering.name)}</h3><span class="rating-chip"><span aria-hidden="true">★</span> ${Number(offering.rating || 4.6).toFixed(1)}</span></div>
          <p class="offering-location">${escapeHtml(offering.category)} <span>·</span> ${escapeHtml(offering.location)}</p>
          <p class="offering-summary">${escapeHtml(offering.description)}</p>
          <div class="property-facts"><span>${Number(offering.guests)} guests</span><span>${Number(offering.bedrooms || 1)} bedroom${Number(offering.bedrooms) === 1 ? "" : "s"}</span><span>${Number(offering.bathrooms || 1)} bath</span></div>
          <div class="amenity-row">${(offering.amenities || []).slice(0, 3).map((amenity) => `<span>${escapeHtml(amenity)}</span>`).join("")}</div>
          <div class="offering-bottom"><span class="review-copy"><strong>${Number(offering.reviews || 0)} reviews</strong><small>Highly rated for a memorable stay</small></span><span class="price">${money(offering.price)}<small> / night</small></span></div>
          <div class="stay-card-dates">${escapeHtml(stayDates(searchCheckin, searchCheckout))} <span>· ${Booking.getNights(searchCheckin, searchCheckout)} nights</span></div>
        </button>
      </article>
    `;
  }

  function renderFeaturedOfferings() {
    const featuredIds = ["luntian-city-hotel", "vigan-heritage-inn", "tagaytay-farmstay"];
    const featured = featuredIds.map((id) => state.offerings.find((offering) => offering.id === id)).filter(Boolean);
    $("#home-featured-grid").innerHTML = featured.map(renderOfferingCard).join("");
  }

  function renderOfferings() {
    const filtered = getFilteredOfferings();
    if (activeTab === "search") renderStayMap(filtered);
    elements.grid.innerHTML = filtered.map(renderOfferingCard).join("");
    $("#results-count").innerHTML = `<strong>${filtered.length}</strong> ${filtered.length === 1 ? "stay" : "stays"} to fall for`;
    $("#results-dates").textContent = `${Booking.getNights(searchCheckin, searchCheckout)} nights · ${searchGuests} ${searchGuests === 1 ? "guest" : "guests"}`;
    $("#empty-offerings").classList.toggle("hidden", filtered.length > 0);
  }

  function renderStayMap(offerings) {
    const status = $("#map-status");
    const mapElement = $("#stay-map");
    if (!window.L) {
      status.textContent = "The map needs an internet connection to load.";
      mapElement.textContent = "Connect to the internet to view the map and its available stays.";
      return;
    }
    if (!stayMap) {
      mapElement.textContent = "";
      stayMap = window.L.map(mapElement, {
        scrollWheelZoom: true,
        minZoom: 5,
        maxZoom: 12,
        maxBounds: philippinesBounds,
        maxBoundsViscosity: 1
      });
      const tiles = window.L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
        minZoom: 5,
        maxZoom: 12,
        attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(stayMap);
      tiles.on("tileerror", () => { status.textContent = "Map tiles could not load. Check your internet connection."; });
      stayMap.on("zoomend", refreshMapMarkerPresentation);
      stayMap.setView([12.5, 122], 4);
      loadCountryBoundary();
    }
    const mapped = offerings.filter((offering) =>
      Number.isFinite(Number(offering.latitude)) && Number(offering.latitude) >= 4 && Number(offering.latitude) <= 22 &&
      Number.isFinite(Number(offering.longitude)) && Number(offering.longitude) >= 115 && Number(offering.longitude) <= 128
    );
    const visibleIds = new Set(mapped.map((offering) => offering.id));
    stayMarkers.forEach((marker, id) => {
      if (!visibleIds.has(id)) {
        stayMap.removeLayer(marker);
        stayMarkers.delete(id);
      }
    });
    mapped.forEach((offering) => {
      let marker = stayMarkers.get(offering.id);
      if (!marker) {
        marker = window.L.marker([Number(offering.latitude), Number(offering.longitude)]).addTo(stayMap);
        marker.on("mouseover", () => {
          window.clearTimeout(mapPopupCloseTimer);
          marker.openPopup();
        });
        marker.on("mouseout", () => {
          mapPopupCloseTimer = window.setTimeout(() => marker.closePopup(), 180);
        });
        stayMarkers.set(offering.id, marker);
      } else {
        marker.setLatLng([Number(offering.latitude), Number(offering.longitude)]);
      }
      marker.options.title = `${offering.name}, ${money(offering.price)} per night`;
      marker.options.alt = `${offering.name}, ${offering.location}`;
    });
    mappedMapOfferings = mapped;
    refreshMapMarkerPresentation();
    status.textContent = mapped.length === offerings.length
      ? `${mapped.length} ${mapped.length === 1 ? "stay" : "stays"} on the map`
      : `${mapped.length} of ${offerings.length} stays mapped`;
    window.requestAnimationFrame(() => stayMap.invalidateSize());
  }

  async function loadCountryBoundary() {
    try {
      const response = await fetch("./philippines-border.geojson");
      if (!response.ok) throw new Error(`Boundary data request failed (${response.status}).`);
      const boundary = await response.json();
      countryBoundary = window.L.geoJSON(boundary, {
        interactive: false,
        smoothFactor: 0,
        renderer: window.L.canvas({ padding: 0.5 }),
        style: { color: "#588a69", weight: 2, opacity: 0.78, fillColor: "#b7d5b5", fillOpacity: 0.12, lineCap: "round", lineJoin: "round" }
      }).addTo(stayMap);
      const bounds = countryBoundary.getBounds();
      if (!bounds.isValid()) throw new Error("The Philippines boundary data has no valid coordinates.");
      const southWest = window.L.latLng(-20, 88);
      const northWest = window.L.latLng(45, 88);
      const northEast = window.L.latLng(45, 155);
      const southEast = window.L.latLng(-20, 155);
      const outerRing = [southWest, northWest, northEast, southEast, southWest];
      const islandRings = boundary.features[0].geometry.coordinates.map((polygon) =>
        polygon[0].map(([longitude, latitude]) => [latitude, longitude])
      );
      window.L.polygon([outerRing, ...islandRings], {
        smoothFactor: 0,
        stroke: false,
        fillColor: "#cfe7eb",
        fillOpacity: 1,
        fillRule: "evenodd",
        interactive: false
      }).addTo(stayMap);
      countryBoundary.bringToFront();
      stayMap.setMaxBounds(bounds.pad(0.09));
      fitCountryBounds();
    } catch (error) {
      console.error("Could not load the Philippines map boundary.", error);
      $("#map-status").textContent = "Philippines outline unavailable.";
    }
  }

  function refreshMapMarkerPresentation() {
    if (!stayMap) return;
    const groups = [];
    mappedMapOfferings.forEach((offering) => {
      const marker = stayMarkers.get(offering.id);
      if (!marker) return;
      const point = stayMap.latLngToContainerPoint([Number(offering.latitude), Number(offering.longitude)]);
      let group = groups.find((candidate) =>
        candidate.some((item) => point.distanceTo(item.point) < 70)
      );
      if (!group) {
        group = [];
        groups.push(group);
      }
      group.push({ offering, marker, point });
    });
    const visibleMarkers = new Set();
    groups.forEach((group) => {
      const primary = group[0].marker;
      visibleMarkers.add(primary);
      group.slice(1).forEach(({ marker }) => stayMap.removeLayer(marker));
      group.forEach(({ marker }) => {
        if (marker !== primary) marker.closePopup();
      });
      const cluster = group.length > 1;
      const label = cluster
        ? `${group.length} stays`
        : `<strong>${escapeHtml(money(group[0].offering.price))}</strong><small>${escapeHtml(group[0].offering.location.split(",")[0])}</small>`;
      const markerLabel = cluster
        ? `${group.length} nearby stays. Click to zoom in.`
        : `${group[0].offering.name}, ${money(group[0].offering.price)} per night`;
      primary.options.title = markerLabel;
      primary.options.alt = markerLabel;
      const markerLatitude = group.reduce((sum, item) => sum + Number(item.offering.latitude), 0) / group.length;
      const markerLongitude = group.reduce((sum, item) => sum + Number(item.offering.longitude), 0) / group.length;
      primary.setLatLng([markerLatitude, markerLongitude]);
      primary.setIcon(window.L.divIcon({
        className: "map-div-icon",
        html: `<span class="${cluster ? "map-cluster-marker" : "map-price-marker"}">${label}</span>`,
        iconSize: [108, 34],
        iconAnchor: cluster ? [54, 17] : [54, 34],
        popupAnchor: [0, 14]
      }));
      const popup = document.createElement("div");
      popup.className = cluster ? "map-popup map-cluster-popup" : "map-popup";
      group.forEach(({ offering }) => {
        const entry = document.createElement("div");
        entry.className = "map-popup-entry";
        const image = document.createElement("img");
        image.className = "map-popup-photo";
        image.src = photoUrl(offering.image, 320);
        image.alt = "";
        image.loading = "lazy";
        const name = document.createElement("strong");
        name.textContent = offering.name;
        const location = document.createElement("span");
        location.textContent = offering.location;
        const price = document.createElement("b");
        price.textContent = `${money(offering.price)} / night`;
        const open = document.createElement("button");
        open.type = "button";
        open.className = "map-popup-link";
        open.dataset.openOffering = offering.id;
        open.textContent = "View stay →";
        entry.append(image, name, location, price, open);
        popup.append(entry);
      });
      primary.bindPopup(popup);
      primary.getPopup().on("add", (event) => {
        const popupElement = event.target.getElement();
        if (!popupElement) return;
        popupElement.addEventListener("mouseenter", () => window.clearTimeout(mapPopupCloseTimer));
        popupElement.addEventListener("mouseleave", () => {
          mapPopupCloseTimer = window.setTimeout(() => primary.closePopup(), 180);
        });
      });
      if (cluster) {
        primary.off("click");
        primary.on("click", () => {
          if (stayMap.getZoom() >= stayMap.getMaxZoom()) {
            primary.openPopup();
            return;
          }
          const groupBounds = window.L.latLngBounds(
            group.map(({ offering }) => [Number(offering.latitude), Number(offering.longitude)])
          );
          stayMap.fitBounds(groupBounds.pad(0.05), {
            padding: [24, 24],
            maxZoom: stayMap.getMaxZoom()
          });
        });
      }
      if (!stayMap.hasLayer(primary)) primary.addTo(stayMap);
      const markerElement = primary.getElement();
      if (markerElement) {
        markerElement.setAttribute("aria-label", markerLabel);
        markerElement.title = markerLabel;
      }
    });
    stayMarkers.forEach((marker) => {
      if (!visibleMarkers.has(marker)) stayMap.removeLayer(marker);
    });
  }

  function fitCountryBounds() {
    if (!stayMap) return;
    const bounds = countryBoundary && countryBoundary.getBounds().isValid()
      ? countryBoundary.getBounds()
      : window.L.latLngBounds(philippinesBounds);
    stayMap.fitBounds(bounds.pad(0.035), { padding: [10, 10], maxZoom: 5, animate: false });
  }

  function renderBookings() {
    const bookings = currentUser
      ? state.bookings.filter((booking) => booking.accountId === currentUser.id).sort((a, b) => a.checkin.localeCompare(b.checkin))
      : [];
    $("#booking-count").textContent = String(bookings.filter((booking) => booking.status !== "cancelled").length);
    $("#empty-bookings").classList.toggle("hidden", bookings.length > 0);
    elements.bookingList.innerHTML = bookings.map((booking) => `
      <article class="booking-card${booking.status === "cancelled" ? " cancelled" : ""}">
        <img class="booking-photo" src="${photoUrl(booking.image, 280)}" alt="">
        <div class="booking-detail">
          <span class="booking-category">${escapeHtml(booking.category || "A Gather stay")} · ${escapeHtml(booking.status)}</span>
          <h3>${escapeHtml(booking.offeringName)}</h3>
          <p class="booking-location">${escapeHtml(booking.location || "")}</p>
          <p>${escapeHtml(stayDates(booking.checkin, booking.checkout))} <span class="detail-separator">·</span> ${Number(booking.nights)} nights, ${Number(booking.guests)} ${Number(booking.guests) === 1 ? "guest" : "guests"}</p>
          <p class="booking-contact">Booked by ${escapeHtml(booking.name)} · ${escapeHtml(booking.email)}</p>
        </div>
        <div class="booking-actions"><strong>${money(booking.total)}</strong>${booking.status !== "cancelled" ? `<button type="button" class="button button-outline" data-cancel-booking="${escapeHtml(booking.id)}">Cancel trip</button>` : `<span class="cancelled-label">Cancelled</span>`}</div>
      </article>`).join("");
  }

  function renderManager() {
    const offerings = currentUser && currentUser.role === "host"
      ? state.offerings.filter((offering) => offering.ownerId === currentUser.id)
      : [];
    $("#offering-count").textContent = `${offerings.length} ${offerings.length === 1 ? "place" : "places"}`;
    $("#booking-count").textContent = String(currentUser
      ? state.bookings.filter((booking) => booking.accountId === currentUser.id && booking.status !== "cancelled").length
      : 0);
    elements.manageOfferings.innerHTML = offerings.length ? offerings.map((offering) => `
      <article class="managed-offering"><img src="${photoUrl(offering.image, 140)}" alt="" class="managed-photo"><div class="managed-info"><h3>${escapeHtml(offering.name)}</h3><p>${escapeHtml(offering.category)} · ${escapeHtml(offering.location)}</p><p class="managed-hours">${money(offering.price)} / night · Up to ${Number(offering.guests)} guests · ${Number(offering.minimumNights || 1)}-night minimum</p></div><div class="managed-actions"><button type="button" class="icon-button" data-edit-offering="${escapeHtml(offering.id)}" aria-label="Edit ${escapeHtml(offering.name)}">✎</button><button type="button" class="icon-button delete-button" data-delete-offering="${escapeHtml(offering.id)}" aria-label="Remove ${escapeHtml(offering.name)}">×</button></div></article>
    `).join("") : `<div class="manage-empty"><p>No stays yet. Add a place and welcome your first guests.</p></div>`;
    const hostIds = new Set(offerings.map((offering) => offering.id));
    const incoming = currentUser
      ? state.bookings.filter((booking) => hostIds.has(booking.offeringId)).sort((a, b) => a.checkin.localeCompare(b.checkin))
      : [];
    $("#host-booking-empty").classList.toggle("hidden", incoming.length > 0);
    $("#host-booking-list").innerHTML = incoming.map((booking) => `
      <article class="host-booking"><div><span class="booking-category">${escapeHtml(booking.status)} · ${Number(booking.guests)} ${Number(booking.guests) === 1 ? "guest" : "guests"}</span><h3>${escapeHtml(booking.offeringName)}</h3><p>${escapeHtml(stayDates(booking.checkin, booking.checkout))} · ${Number(booking.nights)} nights</p><p>Guest: ${escapeHtml(booking.name)} · ${escapeHtml(booking.email)}</p></div><strong>${money(booking.total)}</strong></article>
    `).join("");
  }

  function dateInputsMarkup(checkin, checkout, prefix) {
    return `<div class="date-pair"><label>Check in<input type="date" id="${prefix}-checkin" value="${escapeHtml(checkin)}" min="${minDate}" required></label><label>Check out<input type="date" id="${prefix}-checkout" value="${escapeHtml(checkout)}" min="${Booking.addDays(checkin, 1)}" required></label></div>`;
  }

  function openBookingModal(offeringId) {
    const offering = state.offerings.find((item) => item.id === offeringId);
    if (!offering) return;
    if (!currentUser) {
      openAuthModal("signup", "guest", { type: "booking", offeringId });
      return;
    }
    activeOfferingId = offeringId;
    const checkin = searchCheckin;
    const checkout = searchCheckout;
    elements.modalContent.innerHTML = `
    <div class="modal-property"><img class="modal-photo" src="${photoUrl(offering.image, 1000)}" alt="${escapeHtml(offering.name)}"><span class="modal-kicker">${escapeHtml(offering.badge || offering.category)} · ${Number(offering.rating || 4.6).toFixed(1)} ★</span><h2 id="modal-title">${escapeHtml(offering.name)}</h2><p class="modal-location">${escapeHtml(offering.location)} · ${Number(offering.guests)} guests · ${Number(offering.bedrooms || 1)} bedroom${Number(offering.bedrooms) === 1 ? "" : "s"}</p><p class="modal-description">${escapeHtml(offering.description)}</p><div class="modal-amenities">${(offering.amenities || []).map((amenity) => `<span>${escapeHtml(amenity)}</span>`).join("")}</div></div>
      <form class="booking-form" id="booking-form"><div class="picker-heading"><div><span class="step-number">01</span><strong>Choose your dates</strong></div><span>Make it a little escape</span></div>${dateInputsMarkup(checkin, checkout, "booking")}
        <label class="guest-input">Guests<select name="guests">${Array.from({ length: Number(offering.guests) }, (_, index) => index + 1).map((guests) => `<option value="${guests}"${guests === Math.min(searchGuests, Number(offering.guests)) ? " selected" : ""}>${guests} ${guests === 1 ? "guest" : "guests"}</option>`).join("")}</select></label>
        <div class="picker-heading details-heading"><div><span class="step-number">02</span><strong>Your details</strong></div><span>Almost there</span></div>
        <div class="signed-in-details"><span class="profile-dot">${escapeHtml(currentUser.name.charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(currentUser.name)}</strong><span>${escapeHtml(currentUser.email)}</span></div><small>Booking as a Gather guest</small></div>
        <label class="notes-label">A note for your host <span>Optional</span><textarea name="notes" rows="2" maxlength="400" placeholder="Anything you’d like them to know?"></textarea></label>
        <p class="booking-email-disclosure">Your booking contact details will be shared with Gather’s admin for email notification.</p>
        <div class="confirm-row"><div><strong id="booking-total">${money(offering.price * Booking.getNights(checkin, checkout))}</strong><span> · ${money(offering.price)} per night</span><small id="booking-nights">${Booking.getNights(checkin, checkout)} nights</small></div><button class="button button-dark" type="submit">Reserve your stay <span aria-hidden="true">→</span></button></div><p class="form-error hidden" id="form-error" role="alert"></p>
      </form>`;
    elements.modal.classList.remove("hidden");
    elements.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    $("#booking-form").addEventListener("submit", submitBooking);
    ["booking-checkin", "booking-checkout"].forEach((id) => {
      $(`#${id}`).addEventListener("change", (event) => {
        const start = $("#booking-checkin");
        const end = $("#booking-checkout");
        if (id === "booking-checkin") {
          end.min = Booking.addDays(start.value, 1);
          if (end.value <= start.value) end.value = Booking.addDays(start.value, 1);
        }
        const nights = Booking.getNights(start.value, end.value);
        $("#booking-total").textContent = money(offering.price * nights);
        $("#booking-nights").textContent = `${nights} ${nights === 1 ? "night" : "nights"}`;
      });
    });
    $("[data-close-modal]").focus();
  }

  function submitBooking(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const error = $("#form-error");
    try {
      const booking = Booking.createBooking(state, {
        offeringId: activeOfferingId, checkin: $("#booking-checkin").value, checkout: $("#booking-checkout").value,
        guests: formData.get("guests"), name: currentUser.name, email: currentUser.email, accountId: currentUser.id, notes: formData.get("notes")
      });
      saveState();
      closeModal();
      renderBookings();
      navigate("bookings");
      if (!GatherEmailNotifications.isConfigured()) {
        showToast("Booking saved. Admin email notifications still need setup.");
      } else {
        showToast(`Your ${booking.nights}-night stay at ${booking.offeringName} is confirmed.`);
        GatherEmailNotifications.sendBookingNotification(booking).then(() => {
          showToast("Booking confirmed, and the admin was notified by email.");
        }).catch((notificationError) => {
          console.error("Could not send the booking email notification.", notificationError);
          showToast("Booking confirmed, but the admin email notification failed.");
        });
      }
    } catch (caught) {
      error.textContent = caught.message;
      error.classList.remove("hidden");
    }
  }

  function closeModal() {
    elements.modal.classList.add("hidden");
    elements.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    activeOfferingId = null;
    editingOfferingId = null;
  }

  function openOfferingForm(offering) {
    if (!currentUser || currentUser.role !== "host") {
      openAuthModal("signup", "host", { type: "manage" });
      return;
    }
    editingOfferingId = offering ? offering.id : null;
    const value = offering || { name: "", category: "Island stays", description: "", location: "", price: 5000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "photo-1510414842594-a61c69b5ae57", badge: "A favorite", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 };
    elements.modalContent.innerHTML = `<div class="modal-heading form-modal-heading"><span class="modal-kicker">GATHER HOSTS · ${offering ? "YOUR LISTING" : "A NEW PLACE"}</span><h2 id="modal-title">${offering ? "A little" : "Put your place"} <em>${offering ? "update." : "on the map."}</em></h2><p>Share the details guests need to find their way to you.</p></div>
    <form class="offering-form" id="offering-form"><div class="form-grid"><label>Place name<input name="name" required maxlength="80" value="${escapeHtml(value.name)}" placeholder="e.g. A Little House in the Islands"></label><label>Stay type<select name="category">${["Island stays", "Beachfront stays", "Mountain escapes", "City hotels", "Serviced apartments", "Heritage inns", "Farm stays", "City hideaways", "Nature retreats", "Other"].map((item) => `<option${item === value.category ? " selected" : ""}>${item}</option>`).join("")}</select></label></div>
      <label>Description<textarea name="description" rows="2" required maxlength="240" placeholder="What makes it feel like yours?">${escapeHtml(value.description)}</textarea></label>
      <div class="form-grid"><label>Location<input name="location" required maxlength="100" value="${escapeHtml(value.location)}" placeholder="Island, town, province"></label><label>Photo URL path<input name="image" required maxlength="100" value="${escapeHtml(value.image)}" placeholder="Unsplash photo ID"></label></div>
      <div class="form-grid"><label>Map latitude <span class="field-help">Optional; use an approximate public location</span><input name="latitude" type="number" min="4" max="22" step=".0001" value="${value.latitude !== undefined && value.latitude !== null && Number.isFinite(Number(value.latitude)) ? Number(value.latitude) : ""}" placeholder="e.g. 14.5547"></label><label>Map longitude <span class="field-help">Optional; use an approximate public location</span><input name="longitude" type="number" min="115" max="128" step=".0001" value="${value.longitude !== undefined && value.longitude !== null && Number.isFinite(Number(value.longitude)) ? Number(value.longitude) : ""}" placeholder="e.g. 121.0244"></label></div>
      <div class="form-grid listing-stats"><label>Price per night (PHP)<input name="price" type="number" min="100" max="999999" step="100" required value="${Number(value.price)}"></label><label>Guests<input name="guests" type="number" min="1" max="20" required value="${Number(value.guests)}"></label><label>Min. nights<input name="minimumNights" type="number" min="1" max="30" required value="${Number(value.minimumNights || 1)}"></label></div>
      <div class="form-grid listing-stats"><label>Bedrooms<input name="bedrooms" type="number" min="0" max="30" required value="${Number(value.bedrooms || 1)}"></label><label>Bathrooms<input name="bathrooms" type="number" min="1" max="30" required value="${Number(value.bathrooms || 1)}"></label><label>Rating (out of 5)<input name="rating" type="number" min="1" max="5" step=".1" required value="${Number(value.rating || 4.6)}"></label></div>
      <label>Amenities <span class="field-help">Separate with commas</span><input name="amenities" maxlength="160" value="${escapeHtml((value.amenities || []).join(", "))}" placeholder="Sea view, kitchen, garden"></label>
      <fieldset class="days-fieldset"><legend>Available check-in days</legend><div class="day-checkboxes">${Booking.DAY_NAMES.map((day, index) => `<label><input type="checkbox" name="days" value="${index}"${value.days.includes(index) ? " checked" : ""}><span>${day.slice(0, 1)}</span><small>${day.slice(0, 3)}</small></label>`).join("")}</div></fieldset>
      <p class="form-error hidden" id="form-error" role="alert"></p><div class="confirm-row"><span class="form-hint">Changes save on this device.</span><button class="button button-dark" type="submit">${offering ? "Save changes" : "List this place"} <span aria-hidden="true">→</span></button></div></form>`;
    elements.modal.classList.remove("hidden");
    elements.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    $("#offering-form").addEventListener("submit", submitOffering);
    $("[data-close-modal]").focus();
  }

  function submitOffering(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const days = data.getAll("days").map(Number);
    const error = $("#form-error");
    if (!days.length) {
      error.textContent = "Choose at least one check-in day.";
      error.classList.remove("hidden");
      return;
    }
    const latitude = data.get("latitude") === "" ? null : Number(data.get("latitude"));
    const longitude = data.get("longitude") === "" ? null : Number(data.get("longitude"));
    if ((latitude === null) !== (longitude === null) ||
      (latitude !== null && (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 4 || latitude > 22 || longitude < 115 || longitude > 128))) {
      error.textContent = "Enter both a valid Philippines map latitude and longitude, or leave both blank.";
      error.classList.remove("hidden");
      return;
    }
    const previous = state.offerings.find((item) => item.id === editingOfferingId);
    const updated = {
      id: editingOfferingId || `stay-${Date.now()}`, ownerId: previous ? previous.ownerId : currentUser.id, name: data.get("name").trim(), category: data.get("category"),
      description: data.get("description").trim(), location: data.get("location").trim(), image: data.get("image").trim(), latitude, longitude,
      price: Number(data.get("price")), guests: Number(data.get("guests")), bedrooms: Number(data.get("bedrooms")),
      bathrooms: Number(data.get("bathrooms")), minimumNights: Number(data.get("minimumNights")), rating: Number(data.get("rating")),
      reviews: previous ? previous.reviews : 0, icon: previous ? previous.icon : "⌂", badge: previous ? previous.badge : "A new favorite",
      amenities: data.get("amenities").split(",").map((item) => item.trim()).filter(Boolean), days
    };
    if (previous) state.offerings[state.offerings.indexOf(previous)] = updated;
    else state.offerings.unshift(updated);
    saveState();
    closeModal();
    renderAll();
    showToast(previous ? "Place details updated." : "Your place is ready to find its people.");
  }

  function removeOffering(id) {
    const offering = state.offerings.find((item) => item.id === id);
    if (!offering || !currentUser || offering.ownerId !== currentUser.id) return;
    const activeBookings = state.bookings.filter((booking) => booking.offeringId === id && booking.status !== "cancelled");
    const prompt = activeBookings.length
      ? `This place has ${activeBookings.length} active reservation${activeBookings.length === 1 ? "" : "s"}. Remove it and cancel those reservations?`
      : `Remove “${offering.name}” from your listings?`;
    if (!window.confirm(prompt)) return;
    state.bookings.forEach((booking) => {
      if (booking.offeringId === id && booking.status !== "cancelled") booking.status = "cancelled";
    });
    state.offerings = state.offerings.filter((item) => item.id !== id);
    saveState();
    renderAll();
    showToast("Place removed.");
  }

  function cancelBooking(id) {
    const booking = state.bookings.find((item) => item.id === id);
    if (!booking || !currentUser || booking.accountId !== currentUser.id || booking.status === "cancelled") return;
    if (!window.confirm(`Cancel your ${booking.nights}-night stay at ${booking.offeringName}?`)) return;
    booking.status = "cancelled";
    saveState();
    renderBookings();
    renderOfferings();
    $("#booking-count").textContent = String(state.bookings.filter((item) => item.accountId === currentUser.id && item.status !== "cancelled").length);
    showToast("Reservation cancelled. Those dates are available again.");
  }

  function renderAll() {
    renderCategories();
    renderOfferings();
    renderFeaturedOfferings();
    renderBookings();
    renderManager();
  }

  function updateSearchDates(form) {
    const checkin = $('[data-search-field="checkin"]', form);
    const checkout = $('[data-search-field="checkout"]', form);
    checkin.min = minDate;
    if (checkin.value < minDate) checkin.value = minDate;
    checkout.min = Booking.addDays(checkin.value, 1);
    if (!Booking.parseDate(checkout.value) || checkout.value <= checkin.value) checkout.value = Booking.addDays(checkin.value, 1);
  }

  searchForms.forEach((form) => {
    $('[data-search-field="checkin"]', form).addEventListener("change", () => updateSearchDates(form));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      updateSearchDates(form);
      searchCheckin = $('[data-search-field="checkin"]', form).value;
      searchCheckout = $('[data-search-field="checkout"]', form).value;
      searchGuests = Number($('[data-search-field="guests"]', form).value);
      searchTerm = $('[data-search-field="destination"]', form).value.trim();
      selectedCategory = "All stays";
      syncSearchForms();
      renderCategories();
      renderOfferings();
      navigate("search");
    });
  });
  $("#sort-options").addEventListener("click", (event) => {
    const option = event.target.closest("[data-sort]");
    if (!option) return;
    sortMode = option.dataset.sort;
    $("#sort-options").querySelectorAll(".sort-option").forEach((button) => {
      const selected = button === option;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    renderOfferings();
  });
  $("#max-price-filter").addEventListener("input", (event) => {
    maxPrice = Number(event.target.value);
    $("#max-price-label").textContent = money(maxPrice);
    renderOfferings();
  });
  $("#min-rating-filter").addEventListener("change", (event) => {
    minRating = Number(event.target.value);
    renderOfferings();
  });
  $("#expand-map").addEventListener("click", (event) => {
    const expanded = $("#stay-results-layout").classList.toggle("map-expanded");
    document.body.classList.toggle("map-open", expanded);
    event.currentTarget.setAttribute("aria-expanded", String(expanded));
    event.currentTarget.textContent = expanded ? "× Close map" : "⛶ Expand map";
    window.setTimeout(() => {
      if (!stayMap) return;
      stayMap.invalidateSize({ pan: false });
    }, 250);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("#stay-results-layout").classList.contains("map-expanded")) {
      $("#stay-results-layout").classList.remove("map-expanded");
      document.body.classList.remove("map-open");
      const expandButton = $("#expand-map");
      expandButton.setAttribute("aria-expanded", "false");
      expandButton.textContent = "⛶ Expand map";
      expandButton.focus();
      window.setTimeout(() => stayMap && stayMap.invalidateSize({ pan: false }), 250);
    }
  });
  $("#clear-filters").addEventListener("click", () => {
    $("#max-price-filter").value = "50000";
    $("#max-price-label").textContent = money(50000);
    $("#min-rating-filter").value = "0";
    maxPrice = 50000;
    minRating = 0;
    searchTerm = "";
    searchGuests = 2;
    selectedCategory = "All stays";
    syncSearchForms();
    renderCategories();
    renderOfferings();
  });
  $$(".destination-card").forEach((card) => card.addEventListener("click", () => {
    searchTerm = card.dataset.destination;
    syncSearchForms();
    navigate("search");
  }));
  document.addEventListener("click", (event) => {
    if (event.target.closest("#account-button")) {
      if (!currentUser) {
        openAuthModal("signin", "guest", null);
      } else {
        const dropdown = $("#account-dropdown");
        dropdown.classList.toggle("hidden");
        $("#account-button").setAttribute("aria-expanded", String(!dropdown.classList.contains("hidden")));
      }
      return;
    }
    const accountAction = event.target.closest("[data-account-action]");
    if (accountAction) {
      const action = accountAction.dataset.accountAction;
      if (action === "signout") endSession();
      else navigate(action);
      return;
    }
    const authMode = event.target.closest("[data-auth-mode]");
    if (authMode) {
      openAuthModal(authMode.dataset.authMode, authMode.dataset.authRole, authIntent);
      return;
    }
    const nav = event.target.closest("[data-tab-link]");
    if (nav) {
      event.preventDefault();
      navigate(nav.dataset.tabLink);
      return;
    }
    const category = event.target.closest("[data-category]");
    if (category) {
      selectedCategory = category.dataset.category;
      renderCategories();
      renderOfferings();
      return;
    }
    const offering = event.target.closest("[data-open-offering]");
    if (offering) return openBookingModal(offering.dataset.openOffering);
    const favorite = event.target.closest("[data-favorite]");
    if (favorite) {
      const active = !state.favorites.includes(favorite.dataset.favorite);
      state.favorites = active
        ? [...state.favorites, favorite.dataset.favorite]
        : state.favorites.filter((id) => id !== favorite.dataset.favorite);
      saveState();
      favorite.classList.toggle("saved", active);
      favorite.textContent = active ? "♥" : "♡";
      favorite.setAttribute("aria-pressed", String(active));
      favorite.setAttribute("aria-label", `${active ? "Remove" : "Save"} ${state.offerings.find((item) => item.id === favorite.dataset.favorite).name} ${active ? "from" : "to"} favorites`);
      showToast(active ? "Saved to your Gather favorites." : "Removed from your favorites.");
      return;
    }
    const cancel = event.target.closest("[data-cancel-booking]");
    if (cancel) return cancelBooking(cancel.dataset.cancelBooking);
    const edit = event.target.closest("[data-edit-offering]");
    if (edit) {
      const offeringToEdit = state.offerings.find((item) => item.id === edit.dataset.editOffering);
      if (offeringToEdit && currentUser && offeringToEdit.ownerId === currentUser.id) return openOfferingForm(offeringToEdit);
      return;
    }
    const remove = event.target.closest("[data-delete-offering]");
    if (remove) return removeOffering(remove.dataset.deleteOffering);
    if (event.target.closest("#add-offering-button")) return openOfferingForm();
    if (event.target.closest("[data-close-modal]") || event.target === elements.modal) closeModal();
    if (!event.target.closest(".account-dropdown")) {
      $("#account-dropdown").classList.add("hidden");
      $("#account-button").setAttribute("aria-expanded", "false");
    }
  });
  window.addEventListener("hashchange", () => {
    const route = window.location.hash.slice(1);
    const target = route === "browse" ? "home" : route;
    if (target && ["home", "search", "bookings", "manage"].includes(target) && target !== activeTab) {
      navigate(target, false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.modal.classList.contains("hidden")) closeModal();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === ACCOUNTS_KEY) {
      const accountId = localStorage.getItem(SESSION_KEY);
      accounts.splice(0, accounts.length, ...loadAccounts());
      currentUser = accounts.find((account) => account.id === accountId) || null;
      renderAccountButton();
      renderBookings();
      renderManager();
      return;
    }
    if (event.key === SESSION_KEY) {
      currentUser = accounts.find((account) => account.id === event.newValue) || null;
      renderAccountButton();
      renderBookings();
      renderManager();
      return;
    }
    if (event.key !== Booking.STORAGE_KEY || !event.newValue) return;
    try {
      const incoming = JSON.parse(event.newValue);
      if (Array.isArray(incoming.offerings) && Array.isArray(incoming.bookings)) {
        state.offerings.splice(0, state.offerings.length, ...incoming.offerings);
        state.bookings.splice(0, state.bookings.length, ...incoming.bookings);
        renderAll();
      }
    } catch (error) {
      console.error("Could not sync saved stay data from another tab.", error);
    }
  });
  renderAccountButton();
  renderAll();
  const initialRoute = window.location.hash.slice(1) === "browse" ? "home" : window.location.hash.slice(1);
  if (["home", "search", "bookings", "manage"].includes(initialRoute) && initialRoute !== "home") {
    navigate(initialRoute, false);
  } else {
    navigate("home", false);
  }
})();
