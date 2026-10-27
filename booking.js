(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GatherBooking = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STORAGE_KEY = "gather-stays-state-v4";
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const DEFAULT_OFFERINGS = [
    { id: "isla-norte", name: "Isla Norte Beach House", category: "Island stays", description: "A breezy island hideaway, a swim before breakfast, and nowhere else you need to be.", location: "General Luna, Siargao, Philippines", latitude: 9.7802, longitude: 126.1583, price: 6800, rating: 4.8, reviews: 124, guests: 4, bedrooms: 2, bathrooms: 1, icon: "⌂", image: "photo-1510414842594-a61c69b5ae57", badge: "Guest favorite", amenities: ["Beach access", "Air conditioning", "Kitchen"], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 2 },
    { id: "amihan-cabin", name: "Amihan Mountain Cabin", category: "Mountain escapes", description: "Cool mornings, pine-scented air, and a slow cup of coffee above the city.", location: "Baguio City, Benguet, Philippines", latitude: 16.4023, longitude: 120.5960, price: 4200, rating: 4.9, reviews: 86, guests: 4, bedrooms: 2, bathrooms: 1, icon: "♧", image: "photo-1449158743715-0a90ebb6d2d8", badge: "Exceptional", amenities: ["Mountain view", "Fire pit", "Kitchen"], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "bahay-tala", name: "Bahay Tala by the Sea", category: "Beachfront stays", description: "Barefoot mornings, a hammock in the shade, and the sea just beyond the deck.", location: "Panglao Island, Bohol, Philippines", latitude: 9.5805, longitude: 123.7371, price: 8900, rating: 4.8, reviews: 59, guests: 4, bedrooms: 2, bathrooms: 2, icon: "❋", image: "photo-1500375592092-40eb2168fd21", badge: "A little slice of paradise", amenities: ["Sea view", "Pool", "Breakfast"], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 2 },
    { id: "coron-cove", name: "Coron Cove Cottage", category: "Island stays", description: "An easy island base for lagoon days, salty swims, and dinner under the stars.", location: "Coron, Palawan, Philippines", latitude: 11.9986, longitude: 120.2043, price: 5400, rating: 4.7, reviews: 207, guests: 3, bedrooms: 2, bathrooms: 1, icon: "〰", image: "photo-1507525428034-b723cf961d3e", badge: "Rare island find", amenities: ["Island views", "Garden", "Airport transfer"], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 2 },
    { id: "luntian-city-hotel", name: "Luntian City Hotel", category: "City hotels", description: "A calm, leafy hideaway in the middle of Makati, close to galleries, cafés, and the business district.", location: "Makati City, Metro Manila, Philippines", latitude: 14.5547, longitude: 121.0244, price: 5200, rating: 4.6, reviews: 318, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "photo-1566073771259-6a8506099945", badge: "City favorite", amenities: ["Rooftop pool", "Breakfast", "Wi-Fi"], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "bgc-serviced-suite", name: "BGC Garden Suite", category: "Serviced apartments", description: "A light-filled apartment with room to settle in, steps from parks, restaurants, and city life.", location: "Bonifacio Global City, Taguig, Philippines", latitude: 14.5502, longitude: 121.0497, price: 6100, rating: 4.7, reviews: 142, guests: 3, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "photo-1522708323590-d24dbb6b0267", badge: "Room to settle in", amenities: ["Kitchen", "Work desk", "City view"], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "vigan-heritage-inn", name: "Casa de Abel Heritage Inn", category: "Heritage inns", description: "Stay in a lovingly restored Vigan home, with a quiet courtyard just off the cobbled old town.", location: "Vigan City, Ilocos Sur, Philippines", latitude: 17.5747, longitude: 120.3869, price: 3900, rating: 4.8, reviews: 94, guests: 2, bedrooms: 1, bathrooms: 1, icon: "⌂", image: "photo-1511818966892-d7d671e672a2", badge: "A heritage hideaway", amenities: ["Heritage home", "Courtyard", "Breakfast"], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 },
    { id: "tagaytay-farmstay", name: "Hapag Farm Stay", category: "Farm stays", description: "Slow mornings, garden-to-table meals, and cool countryside air with a view of Taal.", location: "Tagaytay, Cavite, Philippines", latitude: 14.1153, longitude: 120.9621, price: 4800, rating: 4.8, reviews: 76, guests: 4, bedrooms: 2, bathrooms: 1, icon: "♧", image: "photo-1500382017468-9049fed747ef", badge: "Countryside favorite", amenities: ["Garden", "Farm breakfast", "Taal view"], days: [0, 1, 2, 3, 4, 5, 6], minimumNights: 1 }
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
      return saved ? { ...offering, ...saved } : { ...offering, days: [...offering.days], amenities: [...offering.amenities] };
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
      if (booking.offeringId !== offering.id || booking.status === "cancelled") return false;
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
      status: "confirmed",
      createdAt: current.toISOString()
    };
    state.bookings.push(booking);
    return booking;
  }

  return { STORAGE_KEY, DAY_NAMES, DEFAULT_OFFERINGS, createInitialState, withDefaultOfferings, parseDate, toDateString, addDays, getNights, getSearchGuestCount, validateGuestName, isAvailable, createBooking };
});
