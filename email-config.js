window.GATHER_EMAIL_CONFIG = Object.freeze({
  serviceId: "",
  templateId: "",
  publicKey: ""
});

(function () {
  "use strict";
  const endpoint = "https://api.emailjs.com/api/v1.0/email/send";

  function isConfigured() {
    const config = window.GATHER_EMAIL_CONFIG || {};
    return Boolean(config.serviceId && config.templateId && config.publicKey);
  }

  function formatDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" })
      .format(new Date(year, month - 1, day));
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("en-PH", {
      style: "currency", currency: "PHP", maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  async function sendBookingNotification(booking) {
    if (!isConfigured()) return false;
    const config = window.GATHER_EMAIL_CONFIG;
    const response = await window.fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: config.serviceId,
        template_id: config.templateId,
        user_id: config.publicKey,
        template_params: {
          booking_id: booking.id,
          guest_name: booking.name,
          guest_email: booking.email,
          property_name: booking.offeringName,
          property_location: booking.location,
          check_in: formatDate(booking.checkin),
          check_out: formatDate(booking.checkout),
          nights: booking.nights,
          guests: booking.guests,
          price_per_night: formatMoney(booking.price),
          total: formatMoney(booking.total),
          guest_notes: booking.notes || "No notes"
        }
      })
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`EmailJS request failed (${response.status}): ${details}`);
    }
    return true;
  }

  window.GatherEmailNotifications = Object.freeze({ isConfigured, sendBookingNotification });
})();
