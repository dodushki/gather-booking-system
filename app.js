(function () {
  "use strict";
  const Booking = window.GatherBooking;
  const GatherData = window.GatherSupabase;
  const state = Booking.createInitialState();
  state.unavailableDates = [];
  let currentUser = null;
  let sharedServiceError = null;
  const $ = (selector, scope) => (scope || document).querySelector(selector);
  const $$ = (selector, scope) => Array.from((scope || document).querySelectorAll(selector));
  const today = Booking.toDateString(new Date());
  const minDate = Booking.addDays(today, 1);
  let activeTab = "home";
  let selectedCategory = "All stays";
  let searchTerm = "";
  let sortMode = "recommended";
  let resultsViewMode = "list";
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
  if (Number.isInteger(initialGuests) && initialGuests >= 1 && initialGuests <= 20) searchGuests = initialGuests;
  searchTerm = (initialSearchParams.get("destination") || "").trim().slice(0, 100);
  let activeOfferingId = null;
  let editingOfferingId = null;
  let authIntent = null;
  let pendingConfirmation = null;
  let confirmationPreviousFocus = null;
  let toastTimer;
  let stayMap = null;
  let propertyPickerMap = null;
  let propertyPickerMarker = null;
  let listingImagePreviewUrl = null;
  let countryBoundary = null;
  let mapPopupCloseTimer = null;
  let scrollRevealObserver = null;
  let mappedMapOfferings = [];
  const stayMarkers = new Map();
  const philippinesBounds = [[4, 115], [22, 128]];
  const elements = {
    appShell: $("#app-shell"), welcomeGate: $("#welcome-gate"),
    grid: $("#offering-grid"), categories: $("#category-filters"),
    bookingList: $("#booking-list"), manageOfferings: $("#manage-offerings"),
    modal: $("#booking-modal"), modalContent: $("#modal-content"), toast: $("#toast")
  };
  if (window.sessionStorage.getItem("gather-booking-disclaimer-accepted") === "true") {
    elements.welcomeGate.classList.add("hidden");
  }
  const searchForms = $$(".stay-search-form");

  function syncSearchForms() {
    searchForms.forEach((form) => {
      $('[data-search-field="destination"]', form).value = searchTerm;
      $('[data-search-field="checkin"]', form).value = searchCheckin;
      $('[data-search-field="checkin"]', form).min = minDate;
      $('[data-search-field="checkout"]', form).value = searchCheckout;
      $('[data-search-field="checkout"]', form).min = Booking.addDays(searchCheckin, 1);
      const guestSelect = $('[data-search-field="guests"]', form);
      const customGuestCount = $('[data-search-field="custom-guests"]', form);
      guestSelect.value = searchGuests > 8 ? "custom" : String(searchGuests);
      customGuestCount.value = searchGuests > 8 ? String(searchGuests) : "";
      customGuestCount.hidden = searchGuests <= 8;
      customGuestCount.required = searchGuests > 8;
    });
  }
  syncSearchForms();

  async function refreshSharedData() {
    const shared = await GatherData.loadData(currentUser);
    sharedServiceError = null;
    state.offerings.splice(0, state.offerings.length, ...shared.offerings);
    state.bookings.splice(0, state.bookings.length, ...shared.bookings);
    state.favorites.splice(0, state.favorites.length, ...shared.favorites);
    state.unavailableDates.splice(0, state.unavailableDates.length, ...shared.unavailableDates);
    renderAccountButton();
    renderAll();
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
    if (/^https?:\/\//i.test(String(image || ""))) return image;
    if (/^(?:\/|\.\/|assets\/)/i.test(String(image || ""))) return image;
    return `https://images.unsplash.com/${encodeURIComponent(image || "photo-1449158743715-0a90ebb6d2d8")}?auto=format&fit=crop&w=${width || 900}&q=80`;
  }

  function offeringPhotoAlt(offering) {
    const propertyPhotos = {
      "assets/stays/peninsula-manila.jpg": "The Peninsula Manila in Makati City",
      "assets/stays/hotel-luna-vigan.jpg": "Hotel Luna in Vigan",
      "assets/stays/taal-vista-hotel.jpg": "Taal Vista Hotel in Tagaytay"
    };
    return propertyPhotos[offering.image] || `Representative destination photo for ${offering.location}`;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 3000);
  }

  function showWelcomeGate() {
    elements.welcomeGate.classList.remove("hidden");
    document.body.classList.add("welcome-gate-open");
    window.requestAnimationFrame(() => {
      if (elements.welcomeGate.classList.contains("hidden")) return;
      $("#welcome-dismiss").focus();
    });
  }

  function showBookingDisclaimer() {
    showWelcomeGate();
  }

  function dismissWelcomeGate() {
    elements.welcomeGate.classList.add("hidden");
    document.body.classList.remove("welcome-gate-open");
    window.sessionStorage.setItem("gather-booking-disclaimer-accepted", "true");
  }

  function requestConfirmation({ title, message, confirmLabel, danger }) {
    if (pendingConfirmation) closeConfirmation(false);
    const backdrop = $("#confirmation-modal");
    $("#confirmation-title").textContent = title;
    $("#confirmation-message").textContent = message;
    const confirmButton = $("[data-confirm-accept]");
    confirmButton.textContent = confirmLabel || "Confirm";
    confirmButton.classList.toggle("button-danger", Boolean(danger));
    confirmationPreviousFocus = document.activeElement;
    backdrop.classList.remove("hidden");
    backdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    return new Promise((resolve) => {
      pendingConfirmation = resolve;
      $("[data-confirm-cancel]").focus();
    });
  }

  function closeConfirmation(confirmed) {
    if (!pendingConfirmation) return;
    const resolve = pendingConfirmation;
    pendingConfirmation = null;
    const backdrop = $("#confirmation-modal");
    backdrop.classList.add("hidden");
    backdrop.setAttribute("aria-hidden", "true");
    if (elements.modal.classList.contains("hidden")) document.body.classList.remove("modal-open");
    if (confirmationPreviousFocus && confirmationPreviousFocus.isConnected) confirmationPreviousFocus.focus();
    confirmationPreviousFocus = null;
    resolve(confirmed);
  }

  function navigate(tab, updateLocation) {
    if (tab === "bookings" && !currentUser) {
      openAuthModal("signin", "guest", { type: "bookings" });
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

  function startSession(account) {
    currentUser = account;
    renderAccountButton();
    return refreshSharedData();
  }

  async function endSession() {
    await GatherData.signOut();
    currentUser = null;
    $("#account-dropdown").classList.add("hidden");
    $("#account-button").setAttribute("aria-expanded", "false");
    renderAccountButton();
    renderBookings();
    renderManager();
    navigate("home");
  }

  function signOutConfirmation() {
    if (!currentUser) return null;
    return {
      title: currentUser.isAnonymous ? "End this guest session?" : "Sign out of Gather?",
      message: currentUser.isAnonymous
        ? currentUser.role === "host"
          ? "This browser will lose access to your host session. Your listings and booking requests will remain saved, but you will no longer be able to manage those listings or view your requests."
          : "This browser will lose access to your trip list. Your booking requests will remain saved, but you will no longer be able to view or cancel them."
        : "You’ll be signed out on this device. Your account, listings, and bookings will remain saved.",
      confirmLabel: "Sign out"
    };
  }

  async function confirmAndEndSession() {
    const confirmation = signOutConfirmation();
    if (!confirmation || !await requestConfirmation(confirmation)) return false;
    await endSession();
    return true;
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
      <div class="account-menu-heading"><span class="profile-dot">${escapeHtml(currentUser.name.charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(currentUser.name)}</strong><small>${currentUser.isAnonymous ? "Guest session" : escapeHtml(currentUser.email)}</small><span class="account-role">${currentUser.role === "host" ? "GATHER HOST" : "GATHER GUEST"}</span></div></div>
      <button type="button" class="account-menu-link" data-account-action="${currentUser.role === "host" ? "manage" : "bookings"}">${currentUser.role === "host" ? "Your host dashboard" : "Your trips"} <span>→</span></button>
      <button type="button" class="account-menu-link signout-link" data-account-action="signout">Sign out</button>`;
  }

  function openAuthModal(mode, role, intent) {
    authIntent = intent || null;
    const isSignup = mode === "signup";
    $(".modal", elements.modal).classList.add("auth-modal");
    elements.modal.classList.add("auth-backdrop");
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
      <p class="auth-local-note">Gather accounts are securely managed and shared across your devices.</p>`;
    elements.modal.classList.remove("hidden");
    elements.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    $("#auth-form").addEventListener("submit", submitAuth);
    $('[name="email"]', $("#auth-form")).focus();
  }

  async function submitAuth(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const isSignup = formData.has("name");
    const error = $("#form-error");
    const button = $(".auth-submit");
    try {
      if (authIntent && authIntent.type === "manage" && isSignup && formData.get("role") !== "host") {
        throw new Error("Choose “I want to list a place” to create a host account.");
      }
      let account;
      if (isSignup) {
        const role = formData.get("role");
        const confirmed = await requestConfirmation({
          title: `Create your ${role === "host" ? "host" : "guest"} account?`,
          message: `Gather will create an account for ${String(formData.get("email")).trim()}. ${role === "host" ? "Your host profile will let you publish property listings." : "Your guest profile will let you save and book stays."} You may need to confirm your email before signing in.`,
          confirmLabel: "Create account"
        });
        if (!confirmed) return;
      }
      button.disabled = true;
      button.textContent = isSignup ? "Creating account…" : "Signing in…";
      if (isSignup) {
        const result = await GatherData.signUp({
          name: formData.get("name"), email: formData.get("email"),
          password: formData.get("password"), role: formData.get("role")
        });
        if (result.needsEmailConfirmation) {
          closeModal();
          showToast("Check your email to confirm your Gather account, then sign in.");
          return;
        }
        account = result.profile;
      } else {
        account = await GatherData.signIn({ email: formData.get("email"), password: formData.get("password") });
      }
      if (authIntent && authIntent.type === "manage" && account.role !== "host") {
        throw new Error("This part of Gather is for hosts. Create a host account or sign in with one.");
      }
      const intent = authIntent;
      authIntent = null;
      await startSession(account);
      dismissWelcomeGate();
      closeModal();
      showToast(`Welcome${isSignup ? " to Gather" : " back"}, ${account.name.split(/\s+/)[0]}.`);
      if (intent && intent.type === "booking") openBookingModal(intent.offeringId);
      else if (intent && intent.type === "manage") {
        navigate("manage");
        openOfferingForm();
      }
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
      const matchesCategory = selectedCategory === "All stays" ||
        (selectedCategory === "Favorites" ? state.favorites.includes(offering.id) : offering.category === selectedCategory);
      return matchesQuery && matchesCategory && Number(offering.guests) >= searchGuests && Number(offering.price) <= maxPrice &&
        Number(offering.rating || 0) >= minRating &&
        Booking.isAvailable(offering, searchCheckin, searchCheckout, state.bookings.concat(state.unavailableDates), searchGuests);
    });
    if (sortMode === "price") filtered.sort((a, b) => Number(a.price) - Number(b.price));
    if (sortMode === "rating") filtered.sort((a, b) => Number(b.reviews > 0) - Number(a.reviews > 0) || Number(b.rating) - Number(a.rating));
    if (sortMode === "reviews") filtered.sort((a, b) => Number(b.reviews) - Number(a.reviews));
    return filtered;
  }

  function renderCategories() {
    const categories = ["All stays", ...new Set(state.offerings.map((item) => item.category))];
    if (currentUser) categories.push("Favorites");
    if (!categories.includes(selectedCategory)) selectedCategory = "All stays";
    elements.categories.innerHTML = categories.map((category) => {
      const count = category === "All stays" ? state.offerings.length
        : category === "Favorites" ? state.favorites.length
          : state.offerings.filter((offering) => offering.category === category).length;
      return `<button type="button" class="category-pill${category === selectedCategory ? " selected" : ""}" data-category="${escapeHtml(category)}" aria-pressed="${category === selectedCategory}"><span>${escapeHtml(category)}</span><small>${count}</small></button>`;
    }).join("");
  }

  function renderOfferingCard(offering) {
    return `
      <article class="offering-card">
        <div class="card-photo-wrap">
          <button type="button" class="photo-button" data-open-offering="${escapeHtml(offering.id)}" aria-label="View ${escapeHtml(offering.name)} and dates">
            <img class="card-photo" src="${photoUrl(offering.image)}" alt="${escapeHtml(offeringPhotoAlt(offering))}" loading="lazy">
            <span class="card-badge">${escapeHtml(offering.badge || offering.category)}</span>
          </button>
          <button type="button" class="favorite-button${state.favorites.includes(offering.id) ? " saved" : ""}" data-favorite="${escapeHtml(offering.id)}" aria-label="${state.favorites.includes(offering.id) ? "Remove" : "Save"} ${escapeHtml(offering.name)} ${state.favorites.includes(offering.id) ? "from" : "to"} favorites" aria-pressed="${state.favorites.includes(offering.id)}">${state.favorites.includes(offering.id) ? "♥" : "♡"}</button>
        </div>
        <div class="offering-open">
          <div class="offering-details">
            <div class="offering-title-row"><h3>${escapeHtml(offering.name)}</h3>${Number(offering.reviews) > 0 ? `<span class="rating-chip"><span aria-hidden="true">★</span> ${Number(offering.rating).toFixed(1)}</span>` : ""}</div>
            <p class="offering-location">${escapeHtml(offering.category)} <span>·</span> ${escapeHtml(offering.location)}</p>
            <p class="offering-summary">${escapeHtml(offering.description)}</p>
            <div class="property-facts"><span>${Number(offering.guests)} guests</span><span>${Number(offering.bedrooms || 1)} bedroom${Number(offering.bedrooms) === 1 ? "" : "s"}</span><span>${Number(offering.bathrooms || 1)} bath</span></div>
            <div class="amenity-row">${(offering.amenities || []).slice(0, 3).map((amenity) => `<span>${escapeHtml(amenity)}</span>`).join("")}</div>
          </div>
          <div class="offering-bottom">
            <span class="review-copy"><strong>${Number(offering.reviews) > 0 ? `${Number(offering.reviews)} Gather reviews` : "New to Gather"}</strong><small>${Number(offering.reviews) > 0 ? "Guest feedback" : "Confirm details with the property"}</small></span>
            <div class="price-action"><span class="price"><small>Est. </small>${money(offering.price)}<small> / night</small></span><button type="button" class="card-dates-button" data-open-offering="${escapeHtml(offering.id)}">Check dates <span aria-hidden="true">→</span></button></div>
            <div class="stay-card-dates">${escapeHtml(stayDates(searchCheckin, searchCheckout))} <span>· ${Booking.getNights(searchCheckin, searchCheckout)} nights</span></div>
          </div>
        </div>
      </article>
    `;
  }

  function renderFeaturedOfferings() {
    const featuredIds = ["luntian-city-hotel", "vigan-heritage-inn", "tagaytay-farmstay"];
    const featured = featuredIds.map((id) => state.offerings.find((offering) => offering.id === id)).filter(Boolean);
    $("#home-featured-grid").innerHTML = featured.map(renderOfferingCard).join("");
    observeOfferingsOnScroll($("#home-featured-grid"));
  }

  function observeOfferingsOnScroll(container) {
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!scrollRevealObserver) {
      scrollRevealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.08, rootMargin: "0px 0px -24px 0px" });
    }
    $$(".offering-card", container).forEach((card) => {
      card.classList.add("scroll-reveal");
      scrollRevealObserver.observe(card);
    });
  }

  function renderOfferings() {
    const filtered = getFilteredOfferings();
    if (activeTab === "search") renderStayMap(filtered);
    elements.grid.classList.toggle("list-view", resultsViewMode === "list");
    elements.grid.classList.toggle("grid-view", resultsViewMode === "grid");
    $("#search-breadcrumb-location").textContent = searchTerm || "All destinations";
    $("#stays-title").textContent = searchTerm ? `Stays in ${searchTerm}` : "Stays across the Philippines";
    elements.grid.innerHTML = filtered.map(renderOfferingCard).join("");
    observeOfferingsOnScroll(elements.grid);
    $("#results-count").innerHTML = `<strong>${filtered.length}</strong> ${filtered.length === 1 ? "place" : "places"} match your search`;
    $("#results-dates").textContent = `${stayDates(searchCheckin, searchCheckout)} · ${searchGuests} ${searchGuests === 1 ? "guest" : "guests"}`;
    $("#empty-offerings").classList.toggle("hidden", filtered.length > 0);
    if (selectedCategory === "Favorites") {
      $("#empty-offerings h3").textContent = state.favorites.length
        ? "No saved places match these filters"
        : "No favorites saved yet";
      $("#empty-offerings p").textContent = state.favorites.length
        ? "Try changing the dates, guest count, or search filters."
        : "Tap the heart on any stay to save it here for later.";
    } else {
      $("#empty-offerings h3").textContent = "No places for those dates";
      $("#empty-offerings p").textContent = "Try a different destination, guest count, or check-in date.";
    }
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
          <span class="booking-category">${escapeHtml(booking.category || "A Gather stay")} · ${escapeHtml(booking.status === "pending" ? "Awaiting confirmation" : booking.status)}</span>
          <h3>${escapeHtml(booking.offeringName)}</h3>
          <p class="booking-location">${escapeHtml(booking.location || "")}</p>
          <p>${escapeHtml(stayDates(booking.checkin, booking.checkout))} <span class="detail-separator">·</span> ${Number(booking.nights)} nights, ${Number(booking.guests)} ${Number(booking.guests) === 1 ? "guest" : "guests"}</p>
          <p class="booking-contact">Requested by ${escapeHtml(booking.name)}${booking.email ? ` · ${escapeHtml(booking.email)}` : ""}</p>
        </div>
        <div class="booking-actions"><strong>${money(booking.total)}</strong>${booking.status !== "cancelled" ? `<button type="button" class="button button-outline" data-cancel-booking="${escapeHtml(booking.id)}">Cancel request</button>` : `<span class="cancelled-label">Cancelled</span>`}</div>
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
      <article class="host-booking"><div><span class="booking-category">${escapeHtml(booking.status)} · ${Number(booking.guests)} ${Number(booking.guests) === 1 ? "guest" : "guests"}</span><h3>${escapeHtml(booking.offeringName)}</h3><p>${escapeHtml(stayDates(booking.checkin, booking.checkout))} · ${Number(booking.nights)} nights</p><p>Guest: ${escapeHtml(booking.name)}${booking.email ? ` · ${escapeHtml(booking.email)}` : " · Presentation guest"}</p></div><strong>${money(booking.total)}</strong></article>
    `).join("");
  }

  function dateInputsMarkup(checkin, checkout, prefix) {
    return `<div class="date-pair"><label>Check in<input type="date" id="${prefix}-checkin" value="${escapeHtml(checkin)}" min="${minDate}" required></label><label>Check out<input type="date" id="${prefix}-checkout" value="${escapeHtml(checkout)}" min="${Booking.addDays(checkin, 1)}" required></label></div>`;
  }

  function openBookingModal(offeringId) {
    const offering = state.offerings.find((item) => item.id === offeringId);
    if (!offering) return;
    const chatPreferences = window.GatherChatBookingPreferences;
    if (chatPreferences) {
      if (chatPreferences.dates && Booking.parseDate(chatPreferences.dates.checkin) &&
          Booking.parseDate(chatPreferences.dates.checkout) && chatPreferences.dates.checkin >= minDate &&
          chatPreferences.dates.checkout > chatPreferences.dates.checkin) {
        searchCheckin = chatPreferences.dates.checkin;
        searchCheckout = chatPreferences.dates.checkout;
      }
      if (Number.isInteger(chatPreferences.guests) && chatPreferences.guests >= 1 && chatPreferences.guests <= 20) {
        searchGuests = chatPreferences.guests;
      }
      window.GatherChatBookingPreferences = null;
      syncSearchForms();
    }
    if (!currentUser || currentUser.isAnonymous) {
      openAuthModal("signup", "guest", { type: "booking", offeringId });
      return;
    }
    $(".modal", elements.modal).classList.remove("auth-modal");
    elements.modal.classList.remove("auth-backdrop");
    activeOfferingId = offeringId;
    const checkin = searchCheckin;
    const checkout = searchCheckout;
    elements.modalContent.innerHTML = `
    <div class="modal-property"><img class="modal-photo" src="${photoUrl(offering.image, 1000)}" alt="${escapeHtml(offeringPhotoAlt(offering))}"><span class="modal-kicker">${escapeHtml(offering.badge || offering.category)}${Number(offering.reviews) > 0 ? ` · ${Number(offering.rating).toFixed(1)} ★` : ""}</span><h2 id="modal-title">${escapeHtml(offering.name)}</h2><p class="modal-location">${escapeHtml(offering.location)} · Up to ${Number(offering.guests)} guests</p><p class="modal-description">${escapeHtml(offering.description)}</p><div class="modal-amenities">${(offering.amenities || []).map((amenity) => `<span>${escapeHtml(amenity)}</span>`).join("")}</div></div>
      <form class="booking-form" id="booking-form"><div class="picker-heading"><div><span class="step-number">01</span><strong>Choose your dates</strong></div><span>Make it a little escape</span></div>${dateInputsMarkup(checkin, checkout, "booking")}
        <label class="guest-input">Guests<select name="guests">${Array.from({ length: Number(offering.guests) }, (_, index) => index + 1).map((guests) => `<option value="${guests}"${guests === Math.min(searchGuests, Number(offering.guests)) ? " selected" : ""}>${guests} ${guests === 1 ? "guest" : "guests"}</option>`).join("")}</select></label>
        <div class="picker-heading details-heading"><div><span class="step-number">02</span><strong>Your details</strong></div><span>Almost there</span></div>
        <div class="signed-in-details"><span class="profile-dot">${escapeHtml(currentUser.name.charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(currentUser.name)}</strong><span>${escapeHtml(currentUser.email)}</span></div><small>Booking request as a Gather guest</small></div>
        <label class="notes-label">A note for your host <span>Optional</span><textarea name="notes" rows="2" maxlength="400" placeholder="Anything you’d like them to know?"></textarea></label>
        <p class="booking-email-disclosure">Your request is saved in Gather, not sent to the property. Rates and availability are indicative; contact the property directly to confirm. No payment is collected here.</p>
        <div class="confirm-row"><div><strong id="booking-total">${money(offering.price * Booking.getNights(checkin, checkout))}</strong><span> · ${money(offering.price)} per night</span><small id="booking-nights">${Booking.getNights(checkin, checkout)} nights · estimated total</small></div><button class="button button-dark" type="submit">Request to book <span aria-hidden="true">→</span></button></div><p class="form-error hidden" id="form-error" role="alert"></p>
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

  async function submitBooking(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const error = $("#form-error");
    const button = $('button[type="submit"]', event.currentTarget);
    const offering = state.offerings.find((item) => item.id === activeOfferingId);
    const checkin = $("#booking-checkin").value;
    const checkout = $("#booking-checkout").value;
    const nights = Booking.getNights(checkin, checkout);
    const guests = Number(formData.get("guests"));
    const confirmed = await requestConfirmation({
      title: "Save this booking request?",
      message: `Save a request for ${stayDates(checkin, checkout)} at ${offering ? offering.name : "this property"} for ${nights} ${nights === 1 ? "night" : "nights"} and ${guests} ${guests === 1 ? "guest" : "guests"}? Estimated total: ${money(Number(offering && offering.price) * nights)}. This request is saved in Gather, not sent to the property. Contact the property directly to confirm availability and terms.`,
      confirmLabel: "Save request"
    });
    if (!confirmed) return;
    button.disabled = true;
    let booking;
    try {
      booking = await GatherData.createBooking({
        offeringId: activeOfferingId, checkin: $("#booking-checkin").value,
        checkout: $("#booking-checkout").value, guests: formData.get("guests"),
        notes: formData.get("notes")
      });
    } catch (caught) {
      error.textContent = caught.message;
      error.classList.remove("hidden");
      button.disabled = false;
      return;
    }
    closeModal();
    finishBooking(booking);
  }

  function finishBooking(booking) {
    state.bookings.push(booking);
    navigate("bookings");
    refreshSharedData().catch((refreshError) => {
      console.error("Booking was saved, but shared data could not be refreshed.", refreshError);
      showToast(`Your request was saved, but the trip list could not be refreshed: ${refreshError.message}`);
    });
    if (!GatherEmailNotifications.isConfigured()) {
      showToast("Your request was saved, but its email notification could not be sent.");
    } else {
      showToast("Your request is saved in Gather. Contact the property directly to confirm it.");
      GatherEmailNotifications.sendBookingNotification(booking).then(() => {
        showToast("Your request is saved in Gather. Contact the property directly to confirm it.");
      }).catch((notificationError) => {
        console.error("Could not send the booking email notification.", notificationError);
        showToast("Your request was saved, but its email notification could not be sent.");
      });
    }
  }

  async function confirmChatBooking(details) {
    if (!currentUser || currentUser.isAnonymous) {
      window.GatherChatBookingPreferences = {
        guests: details.guests,
        dates: { checkin: details.checkin, checkout: details.checkout }
      };
      openBookingModal(details.offeringId);
      return { requiresSignIn: true };
    }

    const checkin = String(details.checkin || "");
    const checkout = String(details.checkout || "");
    const guests = Number(details.guests);
    if (!Booking.parseDate(checkin) || !Booking.parseDate(checkout) ||
        !Number.isInteger(guests) || guests < 1 || guests > 20) {
      throw new Error("Please provide valid future dates and a guest count before booking.");
    }

    const latest = await GatherData.loadData(currentUser);
    const offering = latest.offerings.find((item) => item.id === details.offeringId);
    if (!offering) throw new Error("This stay is no longer listed.");
    if (!Booking.isAvailable(
      offering, checkin, checkout, latest.bookings.concat(latest.unavailableDates), guests
    )) {
      throw new Error("This stay is no longer available for those dates. Send new dates and I’ll check again.");
    }
    const nights = Booking.getNights(checkin, checkout);
    const total = Number(offering.price) * nights;
    const confirmed = await requestConfirmation({
      title: "Save this booking request?",
      message: `Save a request for ${stayDates(checkin, checkout)} at ${offering.name} for ${nights} ${nights === 1 ? "night" : "nights"} and ${guests} ${guests === 1 ? "guest" : "guests"}? Estimated total: ${money(total)}. This request is saved in Gather, not sent to the property. Contact the property directly to confirm availability and terms.`,
      confirmLabel: "Save request"
    });
    if (!confirmed) return { cancelled: true };

    const booking = await GatherData.createBooking({
      offeringId: offering.id, checkin, checkout, guests, notes: ""
    });
    finishBooking(booking);
    return booking;
  }
  window.GatherChatActions = Object.freeze({ confirmBooking: confirmChatBooking });

  function closeModal() {
    elements.modal.classList.add("hidden");
    elements.modal.setAttribute("aria-hidden", "true");
    $(".modal", elements.modal).classList.remove("auth-modal");
    elements.modal.classList.remove("auth-backdrop");
    document.body.classList.remove("modal-open");
    if (propertyPickerMap) {
      propertyPickerMap.remove();
      propertyPickerMap = null;
      propertyPickerMarker = null;
    }
    if (listingImagePreviewUrl) {
      URL.revokeObjectURL(listingImagePreviewUrl);
      listingImagePreviewUrl = null;
    }
    activeOfferingId = null;
    editingOfferingId = null;
  }

  function setPropertyPickerLocation(latitude, longitude) {
    const latitudeField = $('[name="latitude"]', elements.modalContent);
    const longitudeField = $('[name="longitude"]', elements.modalContent);
    const message = $("#property-map-message");
    latitudeField.value = Number(latitude).toFixed(5);
    longitudeField.value = Number(longitude).toFixed(5);
    if (!propertyPickerMarker) {
      propertyPickerMarker = window.L.marker([latitude, longitude]).addTo(propertyPickerMap);
    } else {
      propertyPickerMarker.setLatLng([latitude, longitude]);
    }
    message.textContent = `Pin selected: ${latitudeField.value}, ${longitudeField.value}.`;
  }

  function initializePropertyPickerMap(value) {
    const mapElement = $("#property-location-map");
    const message = $("#property-map-message");
    if (propertyPickerMap) propertyPickerMap.remove();
    if (!window.L) {
      message.textContent = "The map needs an internet connection. You can enter coordinates above instead.";
      return;
    }
    const hasLocation = value.latitude !== null && value.latitude !== undefined &&
      value.longitude !== null && value.longitude !== undefined &&
      Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude));
    const center = hasLocation ? [Number(value.latitude), Number(value.longitude)] : [12.5, 122];
    propertyPickerMap = window.L.map(mapElement, {
      scrollWheelZoom: true,
      minZoom: 5,
      maxZoom: 15,
      maxBounds: philippinesBounds,
      maxBoundsViscosity: 1
    }).setView(center, hasLocation ? 12 : 5);
    const tiles = window.L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
      minZoom: 5,
      maxZoom: 15,
      attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(propertyPickerMap);
    tiles.on("tileerror", () => { message.textContent = "Map tiles could not load. Check your internet connection or enter coordinates above."; });
    propertyPickerMap.on("click", (event) => setPropertyPickerLocation(event.latlng.lat, event.latlng.lng));
    if (hasLocation) {
      propertyPickerMarker = window.L.marker(center).addTo(propertyPickerMap);
      message.textContent = "Tap to move the approximate public pin. Drag to pan; scroll or pinch to zoom.";
    } else {
      message.textContent = "Tap to drop a pin. Drag to pan; scroll or pinch to zoom.";
    }
    window.setTimeout(() => propertyPickerMap && propertyPickerMap.invalidateSize(), 0);
  }

  function openOfferingForm(offering) {
    if (!currentUser || currentUser.role !== "host") {
      openAuthModal("signin", "host", { type: "manage" });
      return;
    }
    $(".modal", elements.modal).classList.remove("auth-modal");
    elements.modal.classList.remove("auth-backdrop");
    editingOfferingId = offering ? offering.id : null;
    const chatDraft = window.GatherChatListingDraft;
    const value = offering || { name: "", category: "Island stays", description: "", location: "", price: 5000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "photo-1510414842594-a61c69b5ae57", badge: "A favorite", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1, ...(chatDraft || {}) };
    if (chatDraft) window.GatherChatListingDraft = null;
    elements.modalContent.innerHTML = `<div class="modal-heading form-modal-heading"><span class="modal-kicker">GATHER HOSTS · ${offering ? "YOUR LISTING" : "A NEW PLACE"}</span><h2 id="modal-title">${offering ? "A little" : "Put your place"} <em>${offering ? "update." : "on the map."}</em></h2><p>Share the details guests need to find their way to you.</p></div>
    <form class="offering-form" id="offering-form"><div class="form-grid"><label>Place name<input name="name" required maxlength="80" value="${escapeHtml(value.name)}" placeholder="e.g. A Little House in the Islands"></label><label>Stay type<select name="category">${["Island stays", "Beachfront stays", "Mountain escapes", "City hotels", "Serviced apartments", "Heritage inns", "Farm stays", "City hideaways", "Nature retreats", "Other"].map((item) => `<option${item === value.category ? " selected" : ""}>${item}</option>`).join("")}</select></label></div>
      <label>Description<textarea name="description" rows="2" required maxlength="240" placeholder="What makes it feel like yours?">${escapeHtml(value.description)}</textarea></label>
      <label>Location<input name="location" required maxlength="100" value="${escapeHtml(value.location)}" placeholder="Island, town, province"></label>
      <div class="listing-image-field"><label>Property photo <span class="field-help">JPG, PNG, or WebP · up to 5 MB</span><input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp"${offering ? "" : " required"}></label><img id="listing-image-preview" src="${photoUrl(value.image, 420)}" alt="Property photo preview"></div>
      <fieldset class="location-picker-fieldset"><legend>Pin the approximate location <span class="field-help">This location is shown publicly to guests</span></legend><div class="form-grid"><label>Latitude<input name="latitude" type="number" min="4" max="22" step=".00001" value="${value.latitude !== undefined && value.latitude !== null && Number.isFinite(Number(value.latitude)) ? Number(value.latitude) : ""}" placeholder="Choose on map"></label><label>Longitude<input name="longitude" type="number" min="115" max="128" step=".00001" value="${value.longitude !== undefined && value.longitude !== null && Number.isFinite(Number(value.longitude)) ? Number(value.longitude) : ""}" placeholder="Choose on map"></label></div><div id="property-location-map" role="application" aria-label="Choose your property's approximate location on the Philippines map"></div><p id="property-map-message" class="field-help" aria-live="polite">Tap the map to drop a pin. You can adjust it by tapping again.</p></fieldset>
      <div class="form-grid listing-stats"><label>Price per night (PHP)<input name="price" type="number" min="100" max="999999" step="100" required value="${Number(value.price)}"></label><label>Guests<input name="guests" type="number" min="1" max="20" required value="${Number(value.guests)}"></label><label>Min. nights<input name="minimumNights" type="number" min="1" max="30" required value="${Number(value.minimumNights || 1)}"></label></div>
      <div class="form-grid listing-stats"><label>Bedrooms<input name="bedrooms" type="number" min="0" max="30" required value="${Number(value.bedrooms || 1)}"></label><label>Bathrooms<input name="bathrooms" type="number" min="1" max="30" required value="${Number(value.bathrooms || 1)}"></label><label>Rating (out of 5)<input name="rating" type="number" min="1" max="5" step=".1" required value="${Number(value.rating || 4.6)}"></label></div>
      <label>Amenities <span class="field-help">Separate with commas</span><input name="amenities" maxlength="160" value="${escapeHtml((value.amenities || []).join(", "))}" placeholder="Sea view, kitchen, garden"></label>
      <fieldset class="days-fieldset"><legend>Available check-in days</legend><div class="day-checkboxes">${Booking.DAY_NAMES.map((day, index) => `<label><input type="checkbox" name="days" value="${index}"${value.days.includes(index) ? " checked" : ""}><span>${day.slice(0, 1)}</span><small>${day.slice(0, 3)}</small></label>`).join("")}</div></fieldset>
      <p class="form-error hidden" id="form-error" role="alert"></p><div class="confirm-row"><span class="form-hint">Saved across devices.</span><button class="button button-dark" type="submit">${offering ? "Save changes" : "List this place"} <span aria-hidden="true">→</span></button></div></form>`;
    elements.modal.classList.remove("hidden");
    elements.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    $("#offering-form").addEventListener("submit", submitOffering);
    ["latitude", "longitude"].forEach((coordinate) => {
      $(`[name="${coordinate}"]`).addEventListener("change", () => {
        const latitude = Number($('[name="latitude"]').value);
        const longitude = Number($('[name="longitude"]').value);
        if (Number.isFinite(latitude) && latitude >= 4 && latitude <= 22 &&
          Number.isFinite(longitude) && longitude >= 115 && longitude <= 128 && propertyPickerMap) {
          setPropertyPickerLocation(latitude, longitude);
        }
      });
    });
    $('[name="imageFile"]').addEventListener("change", (event) => {
      const file = event.currentTarget.files[0];
      const error = $("#form-error");
      if (!file) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
        event.currentTarget.value = "";
        error.textContent = "Choose a JPG, PNG, or WebP image smaller than 5 MB.";
        error.classList.remove("hidden");
        return;
      }
      error.classList.add("hidden");
      if (listingImagePreviewUrl) URL.revokeObjectURL(listingImagePreviewUrl);
      listingImagePreviewUrl = URL.createObjectURL(file);
      $("#listing-image-preview").src = listingImagePreviewUrl;
    });
    initializePropertyPickerMap(value);
    $("[data-close-modal]").focus();
  }

  async function submitOffering(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const days = data.getAll("days").map(Number);
    const error = $("#form-error");
    if (!days.length) {
      error.textContent = "Choose at least one check-in day.";
      error.classList.remove("hidden");
      return;
    }
    const imageFile = data.get("imageFile");
    if (imageFile && imageFile.size > 5 * 1024 * 1024) {
      error.textContent = "Choose an image smaller than 5 MB.";
      error.classList.remove("hidden");
      return;
    }
    if (!editingOfferingId && (!imageFile || !imageFile.size)) {
      error.textContent = "Attach a property photo before listing this place.";
      error.classList.remove("hidden");
      return;
    }
    const latitude = data.get("latitude") === "" ? null : Number(data.get("latitude"));
    const longitude = data.get("longitude") === "" ? null : Number(data.get("longitude"));
    if (latitude === null || longitude === null ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < 4 || latitude > 22 || longitude < 115 || longitude > 128) {
      error.textContent = "Tap the map to pin your place in the Philippines, or enter valid coordinates.";
      error.classList.remove("hidden");
      return;
    }
    const previous = state.offerings.find((item) => item.id === editingOfferingId);
    const updated = {
      id: editingOfferingId || `stay-${window.crypto.randomUUID()}`, ownerId: currentUser.id, name: data.get("name").trim(), category: data.get("category"),
      description: data.get("description").trim(), location: data.get("location").trim(), image: previous ? previous.image : "", latitude, longitude,
      price: Number(data.get("price")), guests: Number(data.get("guests")), bedrooms: Number(data.get("bedrooms")),
      bathrooms: Number(data.get("bathrooms")), minimumNights: Number(data.get("minimumNights")), rating: Number(data.get("rating")),
      reviews: previous ? previous.reviews : 0, icon: previous ? previous.icon : "⌂", badge: previous ? previous.badge : "A new favorite",
      amenities: data.get("amenities").split(",").map((item) => item.trim()).filter(Boolean), days
    };
    const submit = $('button[type="submit"]', event.currentTarget);
    const confirmed = await requestConfirmation({
      title: previous ? "Save listing changes?" : "Publish this property?",
      message: `${previous ? "Save your updates to" : "Publish"} “${updated.name}” in ${updated.location} at ${money(updated.price)} per night? ${imageFile && imageFile.size ? "The attached property photo will be uploaded." : ""} Your listing will be visible to Gather visitors.`,
      confirmLabel: previous ? "Save changes" : "Publish listing"
    });
    if (!confirmed) return;
    submit.disabled = true;
    let uploadedImage = null;
    try {
      if (imageFile && imageFile.size) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(imageFile.type)) {
          throw new Error("Choose a JPG, PNG, or WebP image.");
        }
        uploadedImage = await GatherData.uploadListingImage(imageFile, currentUser.id, updated.id);
        updated.image = uploadedImage.url;
      } else if (previous) {
        updated.image = previous.image;
      }
      const saved = await GatherData.saveOffering(updated);
      closeModal();
      if (previous) state.offerings[state.offerings.indexOf(previous)] = saved;
      else state.offerings.unshift(saved);
      renderAll();
      refreshSharedData().catch((refreshError) => {
        console.error("Listing was saved, but shared data could not be refreshed.", refreshError);
        showToast(`Place saved, but refresh failed: ${refreshError.message}`);
      });
      showToast(previous ? "Place details updated." : "Your place is ready to find its people.");
    } catch (caught) {
      if (uploadedImage) {
        try {
          await GatherData.deleteListingImage(uploadedImage.path);
        } catch (cleanupError) {
          console.error("Could not remove the unused uploaded listing photo.", cleanupError);
        }
      }
      error.textContent = caught.message;
      error.classList.remove("hidden");
      submit.disabled = false;
    }
  }

  async function removeOffering(id) {
    const offering = state.offerings.find((item) => item.id === id);
    if (!offering || !currentUser || offering.ownerId !== currentUser.id) return;
    const activeBookings = state.bookings.filter((booking) => booking.offeringId === id && booking.status !== "cancelled");
    const confirmed = await requestConfirmation({
      title: "Remove this listing?",
      message: activeBookings.length
        ? `Remove “${offering.name}”? This will also cancel ${activeBookings.length} active booking request${activeBookings.length === 1 ? "" : "s"} and guests will no longer be able to request this place.`
        : `Remove “${offering.name}” from your listings? Guests will no longer be able to book it.`,
      confirmLabel: "Remove listing",
      danger: true
    });
    if (!confirmed) return;
    try {
      await GatherData.deleteOffering(id);
      state.offerings.splice(state.offerings.indexOf(offering), 1);
      state.bookings.forEach((booking) => {
        if (booking.offeringId === id && booking.status !== "cancelled") booking.status = "cancelled";
      });
      renderAll();
      refreshSharedData().catch((refreshError) => {
        console.error("Place was removed, but shared data could not be refreshed.", refreshError);
        showToast(`Place removed, but refresh failed: ${refreshError.message}`);
      });
      showToast("Place removed.");
    } catch (error) {
      console.error("Could not remove the Gather listing.", error);
      showToast(`Could not remove place: ${error.message}`);
    }
  }

  async function cancelBooking(id) {
    const booking = state.bookings.find((item) => item.id === id);
    if (!booking || !currentUser || booking.accountId !== currentUser.id || booking.status === "cancelled") return;
    const confirmed = await requestConfirmation({
      title: "Cancel this booking?",
      message: `Cancel your ${booking.nights}-night stay at ${booking.offeringName}, ${stayDates(booking.checkin, booking.checkout)}? This cannot be undone, and the dates will become available again.`,
      confirmLabel: "Cancel booking",
      danger: true
    });
    if (!confirmed) return;
    try {
      await GatherData.cancelBooking(id);
      booking.status = "cancelled";
      renderAll();
      refreshSharedData().catch((refreshError) => {
        console.error("Reservation was cancelled, but shared data could not be refreshed.", refreshError);
        showToast(`Reservation cancelled, but refresh failed: ${refreshError.message}`);
      });
      showToast("Reservation cancelled. Those dates are available again.");
    } catch (error) {
      console.error("Could not cancel the Gather booking request.", error);
      showToast(`Could not cancel booking request: ${error.message}`);
    }
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
    $('[data-search-field="guests"]', form).addEventListener("change", (event) => {
      const customGuestCount = $('[data-search-field="custom-guests"]', form);
      const isCustom = event.currentTarget.value === "custom";
      customGuestCount.hidden = !isCustom;
      customGuestCount.required = isCustom;
      if (isCustom && !customGuestCount.value) customGuestCount.value = "9";
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      updateSearchDates(form);
      searchCheckin = $('[data-search-field="checkin"]', form).value;
      searchCheckout = $('[data-search-field="checkout"]', form).value;
      const selectedGuests = $('[data-search-field="guests"]', form).value;
      searchGuests = Booking.getSearchGuestCount(selectedGuests, $('[data-search-field="custom-guests"]', form).value);
      searchTerm = $('[data-search-field="destination"]', form).value.trim();
      selectedCategory = "All stays";
      syncSearchForms();
      renderCategories();
      renderOfferings();
      navigate("search");
    });
  });
  $("#welcome-dismiss").addEventListener("click", dismissWelcomeGate);
  function setTripChatOpen(isOpen) {
    const panel = $("#trip-chat-panel");
    const launcher = $("#floating-chat-launcher");
    panel.hidden = !isOpen;
    launcher.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) window.requestAnimationFrame(() => $("#trip-chat-prompt").focus());
    else launcher.focus();
  }
  $("#floating-chat-launcher").addEventListener("click", () => {
    setTripChatOpen($("#trip-chat-panel").hidden);
  });
  $("#chat-panel-close").addEventListener("click", () => setTripChatOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#trip-chat-panel").hidden &&
        !document.body.classList.contains("modal-open") &&
        !document.body.classList.contains("welcome-gate-open") &&
        !document.body.classList.contains("map-open")) {
      setTripChatOpen(false);
    }
  });
  $("#sort-select").addEventListener("change", (event) => {
    sortMode = event.currentTarget.value;
    renderOfferings();
  });
  $("#results-view-toggle").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view-mode]");
    if (!button) return;
    resultsViewMode = button.dataset.viewMode;
    $("#results-view-toggle").querySelectorAll("[data-view-mode]").forEach((option) => {
      const selected = option === button;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-pressed", String(selected));
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
  function setMapExpanded(expanded) {
    const layout = $("#stay-results-layout");
    const mapSection = $(".stay-map-section");
    const mapColumn = $("#expanded-map-column");
    const expandButton = $("#expand-map");
    if (expanded) mapColumn.append(mapSection);
    else $("#map-preview-slot").append(mapSection);
    mapColumn.hidden = !expanded;
    layout.classList.toggle("map-expanded", expanded);
    document.body.classList.toggle("map-open", expanded);
    expandButton.setAttribute("aria-expanded", String(expanded));
    expandButton.innerHTML = expanded ? "Close map <span aria-hidden=\"true\">×</span>" : 'Show map <span aria-hidden="true">↗</span>';
    $("#map-heading-kicker").textContent = expanded ? "INTERACTIVE MAP" : "MAP PREVIEW";
    $("#stay-map-title").textContent = expanded ? "Stays near your search" : "Explore the area";
    window.setTimeout(() => {
      if (stayMap) stayMap.invalidateSize({ pan: false });
    }, 250);
  }
  $("#expand-map").addEventListener("click", () => {
    setMapExpanded(!$("#stay-results-layout").classList.contains("map-expanded"));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("#stay-results-layout").classList.contains("map-expanded")) {
      setMapExpanded(false);
      $("#expand-map").focus();
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
  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-confirm-accept]")) {
      closeConfirmation(true);
      return;
    }
    if (event.target.closest("[data-confirm-cancel]") || event.target === $("#confirmation-modal")) {
      closeConfirmation(false);
      return;
    }
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
      if (action === "signout") {
        try { await confirmAndEndSession(); }
        catch (error) {
          console.error("Could not sign out of Gather.", error);
          showToast(`Could not sign out: ${error.message}`);
        }
      }
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
      if (nav.dataset.scrollTarget) {
        window.requestAnimationFrame(() => {
          const target = document.getElementById(nav.dataset.scrollTarget);
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
          if (nav.dataset.expandMap === "true" && $("#expand-map").getAttribute("aria-expanded") !== "true") {
            $("#expand-map").click();
          }
        });
      }
      if (nav.dataset.openChat === "true") {
        window.requestAnimationFrame(() => setTripChatOpen(true));
      }
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
      if (!currentUser) {
        openAuthModal("signin", "guest", null);
        showToast("Sign in to save stays to your shared favorites.");
        return;
      }
      const active = !state.favorites.includes(favorite.dataset.favorite);
      const offeringId = favorite.dataset.favorite;
      try {
        await GatherData.setFavorite(currentUser.id, offeringId, active);
        if (active) state.favorites.push(offeringId);
        else state.favorites.splice(state.favorites.indexOf(offeringId), 1);
        if (activeTab === "search" && selectedCategory === "Favorites") renderOfferings();
        favorite.classList.toggle("saved", active);
        favorite.textContent = active ? "♥" : "♡";
        favorite.setAttribute("aria-pressed", String(active));
        favorite.setAttribute("aria-label", `${active ? "Remove" : "Save"} ${state.offerings.find((item) => item.id === offeringId).name} ${active ? "from" : "to"} favorites`);
        showToast(active ? "Saved to your Gather favorites." : "Removed from your favorites.");
      } catch (error) {
        console.error("Could not update Gather favorites.", error);
        showToast(`Could not update favorite: ${error.message}`);
      }
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
    if (pendingConfirmation) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeConfirmation(false);
        return;
      }
      if (event.key === "Tab") {
        const controls = $$(".confirmation-dialog button").filter((button) => !button.disabled);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
    }
    if (event.key === "Escape" && !elements.modal.classList.contains("hidden")) closeModal();
  });
  GatherData.onAuthStateChange((account) => {
    currentUser = account;
    window.dispatchEvent(new CustomEvent("gather-auth-changed"));
    renderAccountButton();
    refreshSharedData().catch((error) => {
      console.error("Could not refresh shared Gather data after an account change.", error);
      showToast(`Could not load shared Gather data: ${error.message}`);
    });
  });
  async function initialize() {
    try {
      currentUser = await GatherData.getCurrentProfile();
      renderAccountButton();
      await refreshSharedData();
    } catch (error) {
      sharedServiceError = error.message;
      console.error("Could not connect to the shared Gather database.", error);
      showToast(`Could not load Gather: ${error.message}`);
      state.offerings.length = 0;
      state.bookings.length = 0;
      state.favorites.length = 0;
      state.unavailableDates.length = 0;
      renderAccountButton();
      renderAll();
    }
    const initialRoute = window.location.hash.slice(1) === "browse" ? "home" : window.location.hash.slice(1);
    if (["home", "search", "bookings", "manage"].includes(initialRoute) && initialRoute !== "home") {
      navigate(initialRoute, false);
    } else {
      navigate("home", false);
    }
    if (window.sessionStorage.getItem("gather-booking-disclaimer-accepted") !== "true") showWelcomeGate();
  }
  initialize();
})();
