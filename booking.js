(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GatherBooking = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STORAGE_KEY = "gather-stays-state-v4";
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const LEGACY_DEFAULT_IMAGES = {
    "isla-norte": "photo-1510414842594-a61c69b5ae57",
    "amihan-cabin": "photo-1449158743715-0a90ebb6d2d8",
    "bahay-tala": "photo-1500375592092-40eb2168fd21",
    "coron-cove": "photo-1507525428034-b723cf961d3e",
    "luntian-city-hotel": "photo-1566073771259-6a8506099945",
    "bgc-serviced-suite": "photo-1522708323590-d24dbb6b0267",
    "vigan-heritage-inn": "photo-1511818966892-d7d671e672a2",
    "tagaytay-farmstay": "photo-1500382017468-9049fed747ef"
  };
  const DEFAULT_OFFERINGS = [
    { id: "isla-norte", name: "Isla Cabana Resort", category: "Beach resorts", description: "A resort in General Luna, Siargao. Send a request to check current room availability and terms.", location: "General Luna, Siargao, Philippines", latitude: 9.7802, longitude: 126.1583, price: 9000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "assets/stays/siargao-cloud9.jpg", badge: "Explore Siargao", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "amihan-cabin", name: "The Manor at Camp John Hay", category: "Mountain hotels", description: "A hotel in Baguio's Camp John Hay. Send a request to check current room availability and terms.", location: "Baguio City, Benguet, Philippines", latitude: 16.4023, longitude: 120.6091, price: 11000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "♧", image: "assets/stays/baguio-camp-john-hay.jpg", badge: "Explore Baguio", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "bahay-tala", name: "Henann Resort Alona Beach", category: "Beach resorts", description: "A resort on Panglao Island. Send a request to check current room availability and terms.", location: "Panglao Island, Bohol, Philippines", latitude: 9.5500, longitude: 123.7720, price: 11000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "❋", image: "assets/stays/alona-beach-panglao.jpg", badge: "Explore Bohol", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "coron-cove", name: "Two Seasons Coron Island Resort", category: "Island resorts", description: "A resort on Coron Island. Send a request to check current room availability and terms.", location: "Coron, Palawan, Philippines", latitude: 11.9360, longitude: 120.2260, price: 26000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "〰", image: "assets/stays/coron-twin-lagoon.jpg", badge: "Explore Palawan", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "luntian-city-hotel", name: "The Peninsula Manila", category: "City hotels", description: "A hotel in Makati's central business district. Send a request to check current room availability and terms.", location: "Makati City, Metro Manila, Philippines", latitude: 14.5547, longitude: 121.0244, price: 18000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "assets/stays/makati-skyline.jpg", badge: "Explore Manila", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "bgc-serviced-suite", name: "Shangri-La The Fort, Manila", category: "City hotels", description: "A hotel in Bonifacio Global City. Send a request to check current room availability and terms.", location: "Bonifacio Global City, Taguig, Philippines", latitude: 14.5502, longitude: 121.0497, price: 19000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "assets/stays/bgc-burgos-circle.jpg", badge: "Explore Taguig", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "vigan-heritage-inn", name: "Hotel Luna", category: "Heritage hotels", description: "A hotel in the historic center of Vigan. Send a request to check current room availability and terms.", location: "Vigan City, Ilocos Sur, Philippines", latitude: 17.5747, longitude: 120.3869, price: 8500, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "assets/stays/vigan-calle-crisologo.jpg", badge: "Explore Vigan", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "tagaytay-farmstay", name: "Taal Vista Hotel", category: "Mountain hotels", description: "A hotel in Tagaytay. Send a request to check current room availability and terms.", location: "Tagaytay, Cavite, Philippines", latitude: 14.1153, longitude: 120.9621, price: 9500, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "♧", image: "assets/stays/tagaytay-taal.jpg", badge: "Explore Tagaytay", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "peninsula-makati", name: "Dusit Thani Manila", category: "City hotels", description: "A hotel in Makati's central business district. Send a request to check current room availability and terms.", location: "Makati City, Metro Manila, Philippines", latitude: 14.5526, longitude: 121.0224, price: 12000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "assets/stays/makati-skyline.jpg", badge: "Explore Makati", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "manila-hotel-ermita", name: "The Manila Hotel", category: "Heritage hotels", description: "A hotel by Manila Bay and Rizal Park. Send a request to check current room availability and terms.", location: "Ermita, Manila, Philippines", latitude: 14.5821, longitude: 120.9747, price: 10000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "assets/stays/makati-skyline.jpg", badge: "Explore Manila", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "okada-manila", name: "Okada Manila", category: "City hotels", description: "A hotel and resort complex in Entertainment City. Send a request to check current room availability and terms.", location: "Parañaque City, Metro Manila, Philippines", latitude: 14.5143, longitude: 120.9822, price: 19000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "assets/stays/makati-skyline.jpg", badge: "Explore Parañaque", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "discovery-shores-boracay", name: "Discovery Shores Boracay", category: "Beach resorts", description: "A resort on Boracay's White Beach. Send a request to check current room availability and terms.", location: "Boracay Island, Aklan, Philippines", latitude: 11.9718, longitude: 121.9185, price: 22000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "❋", image: "assets/stays/alona-beach-panglao.jpg", badge: "Explore Boracay", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "amorita-bohol", name: "Amorita Resort", category: "Beach resorts", description: "A resort above Alona Beach on Panglao Island. Send a request to check current room availability and terms.", location: "Panglao Island, Bohol, Philippines", latitude: 9.5454, longitude: 123.7726, price: 19000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "❋", image: "assets/stays/alona-beach-panglao.jpg", badge: "Explore Panglao", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "bohol-beach-club", name: "Bohol Beach Club", category: "Beach resorts", description: "A beachfront resort on Panglao Island. Send a request to check current room availability and terms.", location: "Panglao Island, Bohol, Philippines", latitude: 9.5718, longitude: 123.7740, price: 11000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "❋", image: "assets/stays/alona-beach-panglao.jpg", badge: "Explore Panglao", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "shangri-la-mactan", name: "Shangri-La Mactan, Cebu", category: "Beach resorts", description: "A resort on Mactan Island. Send a request to check current room availability and terms.", location: "Lapu-Lapu City, Cebu, Philippines", latitude: 10.3090, longitude: 124.0160, price: 22000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "❋", image: "assets/stays/alona-beach-panglao.jpg", badge: "Explore Cebu", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "radisson-blu-cebu", name: "Radisson Blu Cebu", category: "City hotels", description: "A hotel near Cebu City's North Reclamation Area. Send a request to check current room availability and terms.", location: "Cebu City, Cebu, Philippines", latitude: 10.3110, longitude: 123.9180, price: 9000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "assets/stays/makati-skyline.jpg", badge: "Explore Cebu City", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "seda-cebu", name: "Seda Ayala Center Cebu", category: "City hotels", description: "A hotel in Cebu City's Cebu Business Park. Send a request to check current room availability and terms.", location: "Cebu City, Cebu, Philippines", latitude: 10.3170, longitude: 123.9060, price: 7500, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "assets/stays/makati-skyline.jpg", badge: "Explore Cebu City", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "anya-tagaytay", name: "Anya Resort Tagaytay", category: "Nature retreats", description: "A resort in Tagaytay. Send a request to check current room availability and terms.", location: "Tagaytay, Cavite, Philippines", latitude: 14.1070, longitude: 120.9540, price: 17000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "♧", image: "assets/stays/tagaytay-taal.jpg", badge: "Explore Tagaytay", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "lagen-island-el-nido", name: "El Nido Resorts Lagen Island", category: "Island resorts", description: "A resort on Lagen Island in El Nido. Send a request to check current room availability and terms.", location: "El Nido, Palawan, Philippines", latitude: 11.1990, longitude: 119.4070, price: 40000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "〰", image: "assets/stays/coron-twin-lagoon.jpg", badge: "Explore El Nido", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "dusit-davao", name: "Dusit Thani Residence Davao", category: "City hotels", description: "A hotel in Davao City's Lanang district. Send a request to check current room availability and terms.", location: "Davao City, Philippines", latitude: 7.0880, longitude: 125.6100, price: 12000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "assets/stays/makati-skyline.jpg", badge: "Explore Davao", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "seda-centrio-cdo", name: "Seda Centrio", category: "City hotels", description: "A hotel in Cagayan de Oro's Centrio district. Send a request to check current room availability and terms.", location: "Cagayan de Oro, Philippines", latitude: 8.4830, longitude: 124.6480, price: 6500, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "assets/stays/makati-skyline.jpg", badge: "Explore Cagayan de Oro", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "richmonde-iloilo", name: "Richmonde Hotel Iloilo", category: "City hotels", description: "A hotel in Iloilo City's Iloilo Business Park. Send a request to check current room availability and terms.", location: "Iloilo City, Philippines", latitude: 10.7180, longitude: 122.5530, price: 7000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "assets/stays/makati-skyline.jpg", badge: "Explore Iloilo", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "las-casas-bataan", name: "Las Casas Filipinas de Acuzar", category: "Heritage hotels", description: "A heritage resort in Bagac, Bataan. Send a request to check current room availability and terms.", location: "Bagac, Bataan, Philippines", latitude: 14.7920, longitude: 120.5390, price: 12000, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "assets/stays/vigan-calle-crisologo.jpg", badge: "Explore Bataan", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "crimson-filinvest", name: "Crimson Hotel Filinvest City", category: "City hotels", description: "A hotel in Filinvest City, Alabang. Send a request to check current room availability and terms.", location: "Muntinlupa City, Metro Manila, Philippines", latitude: 14.4180, longitude: 121.0400, price: 8500, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "assets/stays/makati-skyline.jpg", badge: "Explore Alabang", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "belmont-manila", name: "Belmont Hotel Manila", category: "City hotels", description: "A hotel in Newport City, near Manila's airport. Send a request to check current room availability and terms.", location: "Pasay City, Metro Manila, Philippines", latitude: 14.5190, longitude: 121.0190, price: 7500, rating: 4.6, reviews: 0, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "assets/stays/makati-skyline.jpg", badge: "Explore Pasay", amenities: [], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 }
  ];

  function createInitialState() {
    return { offerings: DEFAULT_OFFERINGS.map((offering) => ({ ...offering, days: [...offering.days], amenities: [...offering.amenities] })), bookings: [], favorites: [] };
  }

  function withDefaultOfferings(offerings) {
    const normalizedOfferings = offerings.map((offering) => ({
      ...offering,
      rating: Number(offering.rating) > 5 ? Number((Number(offering.rating) / 2).toFixed(1)) : offering.rating
    }));
    const savedById = new Map(normalizedOfferings.map((offering) => [offering.id, offering]));
    const defaultIds = new Set(DEFAULT_OFFERINGS.map((offering) => offering.id));
    const defaults = DEFAULT_OFFERINGS.map((offering) => {
      const saved = savedById.get(offering.id);
      return saved ? {
        ...offering,
        ...saved,
        image: saved.image && saved.image !== LEGACY_DEFAULT_IMAGES[offering.id] ? saved.image : offering.image
      } : { ...offering, days: [...offering.days], amenities: [...offering.amenities] };
    });
    return defaults.concat(normalizedOfferings.filter((offering) => !defaultIds.has(offering.id)));
  }

  function parseDate(dateString) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString || "")) return null;
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function toDateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function addDays(dateString, days) {
    const date = parseDate(dateString);
    if (!date) return "";
    date.setDate(date.getDate() + days);
    return toDateString(date);
  }

  function getNights(checkin, checkout) {
    const start = parseDate(checkin);
    const end = parseDate(checkout);
    if (!start || !end || end <= start) return 0;
    const [startYear, startMonth, startDay] = checkin.split("-").map(Number);
    const [endYear, endMonth, endDay] = checkout.split("-").map(Number);
    return (Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay)) / 86400000;
  }

  function getSearchGuestCount(selection, customCount) {
    const guests = Number(selection === "custom" ? customCount : selection);
    if (!Number.isInteger(guests) || (selection === "custom" ? guests < 9 || guests > 20 : guests < 1 || guests > 8)) {
      throw new Error("Choose between 1 and 20 guests.");
    }
    return guests;
  }

  function validateGuestName(value) {
    const name = String(value || "").trim();
    if (name.length < 2 || name.length > 80) throw new Error("Enter a name between 2 and 80 characters.");
    return name;
  }

  function isAvailable(offering, checkin, checkout, bookings, guests, now) {
    const arrival = parseDate(checkin);
    const departure = parseDate(checkout);
    const nights = getNights(checkin, checkout);
    if (!arrival || !departure || !offering || !Array.isArray(offering.days) || !offering.days.includes(arrival.getDay())) return false;
    if (!Number.isInteger(nights) || nights < Number(offering.minimumNights || 1)) return false;
    if (Number(guests || 1) > Number(offering.guests || 1)) return false;
    const current = now || new Date();
    const today = parseDate(toDateString(current));
    if (arrival < today) return false;
    return !(bookings || []).some((booking) => {
      if (booking.offeringId !== offering.id || booking.status !== "confirmed") return false;
      const bookedCheckin = booking.checkin || booking.date;
      const bookedCheckout = booking.checkout || addDays(bookedCheckin, Number(booking.nights || 1));
      return bookedCheckin < checkout && checkin < bookedCheckout;
    });
  }

  function createBooking(state, details, now) {
    const offering = state.offerings.find((item) => item.id === details.offeringId);
    if (!offering) throw new Error("This stay is no longer available.");
    if (!details.name || !details.name.trim()) throw new Error("Please add your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email || "")) throw new Error("Please enter a valid email address.");
    const arrival = parseDate(details.checkin);
    const departure = parseDate(details.checkout);
    const current = now || new Date();
    const today = parseDate(toDateString(current));
    if (!arrival || !departure || arrival < today || departure <= arrival) throw new Error("Choose valid check-in and check-out dates in the future.");
    const guests = Number(details.guests || 1);
    if (!Number.isInteger(guests) || guests < 1 || guests > Number(offering.guests)) throw new Error("Choose a guest count this place can accommodate.");
    if (!isAvailable(offering, details.checkin, details.checkout, state.bookings, guests, current)) throw new Error("This stay is not available for those dates. Choose a different stay or dates.");
    const nights = getNights(details.checkin, details.checkout);
    const booking = {
      id: details.id || `trip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      offeringId: offering.id,
      offeringName: offering.name,
      category: offering.category,
      location: offering.location,
      image: offering.image,
      checkin: details.checkin,
      checkout: details.checkout,
      nights,
      guests,
      price: Number(offering.price),
      total: Number(offering.price) * nights,
      accountId: details.accountId || "",
      hostId: offering.ownerId || "",
      name: details.name.trim(),
      email: details.email.trim(),
      notes: (details.notes || "").trim(),
      status: "pending",
      createdAt: current.toISOString()
    };
    state.bookings.push(booking);
    return booking;
  }

  return { STORAGE_KEY, DAY_NAMES, DEFAULT_OFFERINGS, createInitialState, withDefaultOfferings, parseDate, toDateString, addDays, getNights, getSearchGuestCount, validateGuestName, isAvailable, createBooking };
});
