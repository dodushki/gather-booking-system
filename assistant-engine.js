(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GatherAssistant = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  const categoryCues = [
    { category: "Beachfront stays", cues: ["beachfront", "beach house", "oceanfront", "seaside", "by the sea", "shore"] },
    { category: "Island stays", cues: ["island", "surf", "snorkel", "diving", "lagoon", "siargao", "coron", "palawan"] },
    { category: "Mountain escapes", cues: ["mountain", "highland", "hiking", "hike", "pine", "cool weather", "baguio", "cabin"] },
    { category: "City hotels", cues: ["city hotel", "hotel", "city break", "nightlife", "shopping", "manila", "makati"] },
    { category: "Serviced apartments", cues: ["apartment", "suite", "serviced apartment", "work desk"] },
    { category: "Heritage inns", cues: ["heritage", "historic", "history", "old town", "vigan", "culture"] },
    { category: "Farm stays", cues: ["farm", "countryside", "rural", "tagaytay", "taal"] },
    { category: "Nature retreats", cues: ["nature", "forest", "retreat"] }
  ];
  const genericLocationWords = new Set(["philippines", "pilipinas", "city", "municipality", "province", "metro"]);
  const stopWords = new Set(["a", "an", "and", "are", "at", "be", "for", "find", "get", "go", "i", "in", "is", "it", "me", "my", "of", "on", "or", "place", "please", "some", "stay", "the", "to", "want", "we", "with"]);
  const knownAmenities = ["beach access", "mountain view", "sea view", "pool", "breakfast", "wifi", "wi-fi", "kitchen", "parking", "garden", "air conditioning", "work desk", "fire pit", "airport transfer"];

  function normalize(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }

  function numberFromText(text) {
    const value = String(text || "").replace(/,/g, "");
    const markedPrice = value.match(/(?:₱|php\s*)(\d{3,6}(?:\.\d{1,2})?|\d{1,2}(?:\.\d)?)\s*(k)?/i);
    const nightlyPrice = value.match(/(\d{3,6}(?:\.\d{1,2})?|\d{1,2}(?:\.\d)?)\s*(k)?\s*(?:php|pesos?|per\s+night|\/\s*night|a\s+night)/i);
    const match = markedPrice || nightlyPrice;
    if (!match) return null;
    const amount = Number(match[1]) * (match[2] ? 1000 : 1);
    return Number.isFinite(amount) && amount >= 100 && amount <= 999999 ? Math.round(amount) : null;
  }

  function extractGuests(text) {
    const match = String(text || "").match(/\b(\d{1,2})\s*(?:guests?|people|persons?|pax)\b|\bfor\s+(\d{1,2})\s*(?:of\s+us|people|guests?|pax)?\b/i);
    const guests = Number(match && (match[1] || match[2]));
    return Number.isInteger(guests) && guests >= 1 && guests <= 20 ? guests : null;
  }

  function extractCategory(text) {
    const query = normalize(text);
    return (categoryCues.find((entry) => entry.cues.some((cue) => query.includes(normalize(cue)))) || {}).category || "";
  }

  function extractLocation(text, offerings) {
    const query = normalize(text);
    const matches = [];
    (offerings || []).forEach((offering) => {
      String(offering.location || "").split(/[,·]/).forEach((part) => {
        const label = part.trim();
        const key = normalize(label);
        if (key.length < 3 || genericLocationWords.has(key)) return;
        if (query.includes(key)) matches.push({ label, length: key.length });
        key.split(" ").forEach((word) => {
          if (word.length >= 4 && !genericLocationWords.has(word) && query.split(" ").includes(word)) matches.push({ label, length: word.length });
        });
      });
    });
    matches.sort((a, b) => b.length - a.length);
    return matches.length ? matches[0].label : "";
  }

  function extractDates(text) {
    const dates = String(text || "").match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
    if (dates.length < 2) return null;
    return { checkin: dates[0], checkout: dates[1] };
  }

  function listingIntent(text) {
    return /\b(list(?:ing)?\s+(?:my|a|the|your)|create\s+(?:a\s+)?listing|(?:add|make)\s+(?:a\s+)?listing|add\s+my\s+(?:property|place|room|house)|host\s+my|rent\s+out\s+my|publish\s+(?:my|a|the)\s+(?:place|property|listing))\b/i.test(text);
  }

  function bookingIntent(text) {
    return /\b(book|booking|find\s+(?:me\s+)?(?:a\s+)?stay|looking\s+for\s+(?:a\s+)?stay|trip|vacation|holiday)\b/i.test(text);
  }

  function parseListingFields(text, offerings) {
    const result = {};
    const name = String(text).match(/\b(?:called|named|listing name is)\s+["“]?([^,.;"\n]+)["”]?/i);
    if (name) result.name = name[1].trim().slice(0, 80);
    const location = String(text).match(/\b(?:located|based)\s+in\s+([^,.;\n]+)|\b(?:in|at)\s+([A-Z][A-Za-zÀ-ÿ' -]{2,45})(?=,|\.|\s+for\s+\d|\s+with\s+|$)/i);
    if (location) result.location = String(location[1] || location[2]).trim().slice(0, 100);
    else result.location = extractLocation(text, offerings);
    const guests = extractGuests(text);
    if (guests) result.guests = guests;
    const price = numberFromText(text);
    if (price) result.price = price;
    const description = String(text).match(/\bdescription\s*(?:is|:)\s*(.{10,240})/i);
    if (description) result.description = description[1].trim().slice(0, 240);
    const category = extractCategory(text);
    if (category) result.category = category;
    result.amenities = knownAmenities.filter((amenity) => normalize(text).includes(normalize(amenity)));
    return result;
  }

  function captureListingAnswer(step, text, offerings) {
    const answer = String(text || "").trim();
    const parsed = parseListingFields(answer, offerings);
    if (step === "name") return { name: (parsed.name || answer.replace(/^(?:it(?:'s| is) called|the name is|call it)\s+/i, "")).trim().slice(0, 80) };
    if (step === "location") return { location: (parsed.location || answer.replace(/^(?:it(?:'s| is) in|located in|it is located in)\s+/i, "")).trim().slice(0, 100) };
    if (step === "guests") {
      const guests = extractGuests(answer) || (/^\d{1,2}$/.test(answer) ? Number(answer) : null);
      return guests && guests <= 20 ? { guests } : {};
    }
    if (step === "price") {
      const price = numberFromText(answer) || (/^\d{3,6}$/.test(answer.replace(/,/g, "")) ? Number(answer.replace(/,/g, "")) : null);
      return price ? { price } : {};
    }
    if (step === "description") {
      return {
        description: answer.slice(0, 240),
        amenities: knownAmenities.filter((amenity) => normalize(answer).includes(normalize(amenity)))
      };
    }
    return {};
  }

  function getListingReply(prompt, offerings, previousState, isNew) {
    const draft = isNew ? {} : { ...(previousState.listingDraft || {}) };
    if (isNew) Object.assign(draft, parseListingFields(prompt, offerings));
    else Object.assign(draft, captureListingAnswer(previousState.listingStep, prompt, offerings));
    draft.category = extractCategory(prompt) || draft.category || "";
    draft.amenities = draft.amenities || [];

    const required = ["name", "location", "guests", "price", "description"];
    const missing = required.find((field) => !draft[field]);
    if (missing) {
      const questions = {
        name: "What name would you like to give your place?",
        location: "Where is it located? A city, town, or island in the Philippines is enough.",
        guests: "How many guests can it accommodate?",
        price: "What nightly price in Philippine pesos should I put in the draft?",
        description: "In a sentence or two, what should guests know about your place?"
      };
      return {
        reply: questions[missing],
        stays: [],
        state: { mode: "listing", listingDraft: draft, listingStep: missing, preferences: previousState.preferences || {} }
      };
    }
    if (draft.name.length < 2 || draft.description.length < 10 || draft.price < 100 || draft.price > 999999 || draft.guests < 1 || draft.guests > 20) {
      return {
        reply: "I couldn’t use one of those details yet. Please check the name, description, nightly price, and capacity, then tell me what to change.",
        stays: [],
        state: { mode: "listing", listingDraft: draft, listingStep: "description", preferences: previousState.preferences || {} }
      };
    }
    draft.category = draft.category || "Other";
    return {
      reply: `I’ve prepared an editable draft for ${draft.name}. Review the details, add the required photo and map pin, and submit it when it’s ready.`,
      stays: [],
      listingDraft: draft,
      state: { mode: "listing", listingDraft: draft, listingStep: "ready", preferences: previousState.preferences || {} }
    };
  }

  function getBookingReply(prompt, data, previousState) {
    const offerings = data.offerings || [];
    const preferences = { ...(previousState.preferences || {}) };
    const destination = extractLocation(prompt, offerings);
    const category = extractCategory(prompt);
    const guests = extractGuests(prompt);
    const amount = numberFromText(prompt);
    const dates = extractDates(prompt);
    if (destination) preferences.destination = destination;
    if (category) preferences.category = category;
    if (guests) preferences.guests = guests;
    if (amount) preferences.maxPrice = amount;
    if (dates) preferences.dates = dates;

    const query = normalize(prompt);
    const words = query.split(/\s+/).filter((word) => word.length > 2 && !stopWords.has(word));
    const requestedAmenities = knownAmenities.filter((amenity) => {
      const key = normalize(amenity);
      return key.length > 2 && query.includes(key);
    });
    const scored = offerings.map((offering) => {
      const searchable = normalize([
        offering.name, offering.category, offering.location, offering.description, offering.badge,
        ...(offering.amenities || [])
      ].join(" "));
      let score = Number(offering.rating || 0) + Math.log10(Number(offering.reviews || 0) + 1);
      words.forEach((word) => { if (searchable.includes(word)) score += 1.5; });
      if (preferences.category && offering.category === preferences.category) score += 5;
      if (preferences.destination && normalize(offering.location).includes(normalize(preferences.destination))) score += 10;
      requestedAmenities.forEach((amenity) => { if (searchable.includes(normalize(amenity))) score += 3; });
      return { offering, score, searchable };
    }).filter(({ offering, searchable }) => {
      if (preferences.destination && !normalize(offering.location).includes(normalize(preferences.destination))) return false;
      if (preferences.category && offering.category !== preferences.category) return false;
      if (preferences.guests && Number(offering.guests) < preferences.guests) return false;
      if (preferences.maxPrice && Number(offering.price) > preferences.maxPrice) return false;
      if (requestedAmenities.some((amenity) => !searchable.includes(normalize(amenity)))) return false;
      if (preferences.dates && !root.GatherBooking.isAvailable(
        offering, preferences.dates.checkin, preferences.dates.checkout,
        (data.bookings || []).concat(data.unavailableDates || []), preferences.guests || 1
      )) return false;
      return true;
    }).sort((a, b) => b.score - a.score).slice(0, 3);

    if (!scored.length) {
      const reasons = [];
      if (preferences.destination) reasons.push(`in ${preferences.destination}`);
      if (preferences.guests) reasons.push(`for ${preferences.guests} guests`);
      if (preferences.maxPrice) reasons.push(`at or below ₱${preferences.maxPrice.toLocaleString("en-PH")} per night`);
      if (preferences.category) reasons.push(preferences.category.toLowerCase());
      const criteria = reasons.length ? ` matching ${reasons.join(", ")}` : "";
      return {
        reply: `I couldn’t find a listed stay${criteria}. Try a nearby destination, a higher budget, or fewer guests, and I’ll check again.`,
        stays: [],
        state: { mode: "booking", preferences, listingDraft: {}, listingStep: "" }
      };
    }
    const label = preferences.destination ? `in ${preferences.destination}` : preferences.category ? `for ${preferences.category.toLowerCase()}` : "from Gather’s current listings";
    const dateNote = preferences.dates ? " I checked those dates against Gather’s current availability records; please confirm them again in the booking form." : " Availability depends on your dates, which you can confirm in the booking form.";
    const opening = scored.length === 1 ? "I found a stay" : "Here are a few stays";
    return {
      reply: `${opening} ${label}.${dateNote}`,
      stays: scored.map(({ offering }) => offering),
      state: { mode: "booking", preferences, listingDraft: {}, listingStep: "" }
    };
  }

  function respond(prompt, data, previousState) {
    const text = String(prompt || "").trim();
    const current = previousState || {};
    const startListing = listingIntent(text);
    const switchToBooking = bookingIntent(text) && !startListing;
    const mode = startListing ? "listing" : switchToBooking ? "booking" : current.mode;
    if (mode === "listing") return getListingReply(text, data.offerings || [], current, startListing);
    return getBookingReply(text, data, current);
  }

  return { respond, extractGuests, extractCategory, extractLocation, extractDates };
});
