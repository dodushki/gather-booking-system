(function () {
  "use strict";
  const config = window.GATHER_SUPABASE_CONFIG;
  if (!config || !config.url || !config.publishableKey || !window.supabase) {
    throw new Error("Gather’s Supabase configuration or client library is missing.");
  }

  const client = window.supabase.createClient(config.url, config.publishableKey);

  function throwIfError(result) {
    if (result.error) throw new Error(result.error.message || "The shared Gather service returned an error.");
    return result.data;
  }

  function fromProfile(row) {
    if (!row) return null;
    return { id: row.id, name: row.name, email: row.email, role: row.role };
  }

  function fromOffering(row) {
    return {
      id: row.id, ownerId: row.owner_id, name: row.name, category: row.category,
      description: row.description, location: row.location, latitude: row.latitude,
      longitude: row.longitude, price: row.price, rating: row.rating, reviews: row.reviews,
      guests: row.guests, bedrooms: row.bedrooms, bathrooms: row.bathrooms, icon: row.icon,
      image: row.image, badge: row.badge, amenities: row.amenities || [], days: row.days || [],
      minimumNights: row.minimum_nights
    };
  }

  function fromBooking(row) {
    return {
      id: row.id, offeringId: row.offering_id, offeringName: row.offering_name,
      category: row.category, location: row.location, image: row.image, checkin: row.checkin,
      checkout: row.checkout, nights: row.nights, guests: row.guests, price: row.price,
      total: row.total, accountId: row.guest_id, hostId: row.host_id, name: row.guest_name,
      email: row.guest_email, notes: row.notes, status: row.status, createdAt: row.created_at
    };
  }

  function toOffering(offering) {
    return {
      id: offering.id,
      owner_id: offering.ownerId,
      name: offering.name,
      category: offering.category,
      description: offering.description,
      location: offering.location,
      latitude: offering.latitude,
      longitude: offering.longitude,
      price: offering.price,
      rating: offering.rating,
      reviews: offering.reviews,
      guests: offering.guests,
      bedrooms: offering.bedrooms,
      bathrooms: offering.bathrooms,
      icon: offering.icon,
      image: offering.image,
      badge: offering.badge,
      amenities: offering.amenities,
      days: offering.days,
      minimum_nights: offering.minimumNights
    };
  }

  async function getProfile(userId) {
    const result = await client.from("profiles").select("id,name,email,role").eq("id", userId).single();
    return fromProfile(throwIfError(result));
  }

  async function loadData(user) {
    const offeringsPromise = client.from("offerings").select("*").order("created_at", { ascending: true });
    const results = await Promise.all(user
      ? [
        offeringsPromise,
        client.from("bookings").select("*").order("checkin", { ascending: true }),
        client.from("favorites").select("offering_id").eq("user_id", user.id),
        client.rpc("get_unavailable_dates")
      ]
      : [offeringsPromise, Promise.resolve(null), Promise.resolve(null), client.rpc("get_unavailable_dates")]);
    const offerings = throwIfError(results[0]).map(fromOffering);
    const bookings = user ? throwIfError(results[1]).map(fromBooking) : [];
    const favorites = user ? throwIfError(results[2]).map((row) => row.offering_id) : [];
    const unavailableDates = throwIfError(results[3]).map((row) => ({
      offeringId: row.offering_id, checkin: row.checkin, checkout: row.checkout, status: "confirmed"
    }));
    return { offerings, bookings, favorites, unavailableDates };
  }

  async function signUp({ name, email, password, role }) {
    const result = await client.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { name: name.trim(), role },
        emailRedirectTo: new URL(window.location.pathname, window.location.origin).href
      }
    });
    const data = throwIfError(result);
    return {
      profile: data.session && data.user ? await getProfile(data.user.id) : null,
      needsEmailConfirmation: !data.session
    };
  }

  async function signIn({ email, password }) {
    const result = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    const data = throwIfError(result);
    return getProfile(data.user.id);
  }

  async function signOut() {
    throwIfError(await client.auth.signOut());
  }

  async function getCurrentProfile() {
    const session = throwIfError(await client.auth.getSession()).session;
    return session ? getProfile(session.user.id) : null;
  }

  function onAuthStateChange(callback) {
    return client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") callback(null);
      else if (session && ["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
        window.setTimeout(() => getProfile(session.user.id).then(callback).catch((error) => {
          console.error("Could not load the signed-in Gather profile.", error);
        }), 0);
      }
    }).data.subscription;
  }

  async function createBooking({ offeringId, checkin, checkout, guests, notes }) {
    const result = await client.rpc("create_booking", {
      p_offering_id: offeringId,
      p_checkin: checkin,
      p_checkout: checkout,
      p_guests: Number(guests),
      p_notes: (notes || "").trim()
    });
    return fromBooking(throwIfError(result));
  }

  async function cancelBooking(bookingId) {
    const result = await client.rpc("cancel_booking", { p_booking_id: bookingId });
    return fromBooking(throwIfError(result));
  }

  async function saveOffering(offering) {
    const result = await client.from("offerings").upsert(toOffering(offering)).select("*").single();
    return fromOffering(throwIfError(result));
  }

  async function deleteOffering(offeringId) {
    return throwIfError(await client.rpc("delete_offering", { p_offering_id: offeringId }));
  }

  async function setFavorite(userId, offeringId, active) {
    const query = active
      ? client.from("favorites").insert({ user_id: userId, offering_id: offeringId })
      : client.from("favorites").delete().eq("user_id", userId).eq("offering_id", offeringId);
    throwIfError(await query);
  }

  window.GatherSupabase = Object.freeze({
    client, getCurrentProfile, loadData, signUp, signIn, signOut, onAuthStateChange,
    createBooking, cancelBooking, saveOffering, deleteOffering, setFavorite
  });
})();
