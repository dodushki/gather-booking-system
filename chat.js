(function () {
  "use strict";

  const form = document.querySelector("#trip-chat-form");
  const input = document.querySelector("#trip-chat-prompt");
  const messagesElement = document.querySelector("#trip-chat-messages");
  if (!form || !input || !messagesElement) return;

  const history = [];
  let isSending = false;

  function addMessage(role, text, isError) {
    const message = document.createElement("div");
    message.className = `trip-chat-message ${role}${isError ? " error" : ""}`;
    message.textContent = text;
    messagesElement.appendChild(message);
    messagesElement.scrollTop = messagesElement.scrollHeight;
    return message;
  }

  function resetConversation() {
    history.length = 0;
    messagesElement.replaceChildren();
    addMessage("assistant", "Hi! I can help you plan a stay or prepare a property listing. Tell me what you have in mind, and we’ll take it one step at a time.");
  }

  window.addEventListener("gather-auth-changed", resetConversation);

  const listingCategories = new Set([
    "Island stays", "Beachfront stays", "Mountain escapes", "City hotels",
    "Serviced apartments", "Heritage inns", "Farm stays", "City hideaways",
    "Nature retreats", "Other"
  ]);

  function parseListingDraft(raw) {
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object") return null;
      const price = Math.round(Number(value.price) / 100) * 100;
      const guests = Math.floor(Number(value.guests));
      const name = String(value.name || "").trim().slice(0, 80);
      const location = String(value.location || "").trim().slice(0, 100);
      const description = String(value.description || "").trim().slice(0, 240);
      if (name.length < 2 || !location || description.length < 10 || price < 100 || price > 999999 || guests < 1 || guests > 20) return null;
      return {
        name,
        category: listingCategories.has(value.category) ? value.category : "Other",
        description,
        location,
        price,
        guests,
        amenities: Array.isArray(value.amenities) ? value.amenities.slice(0, 8).map((item) => String(item).trim().slice(0, 40)).filter(Boolean) : []
      };
    } catch (error) {
      console.error("Gather could not read the suggested listing draft.", error);
      return null;
    }
  }

  function addAssistantActions(message, content, offerings) {
    const matches = Array.from(content.matchAll(/\[\[GATHER_STAY:([a-zA-Z0-9_-]+)\]\]/g));
    const stayById = new Map(offerings.map((offering) => [String(offering.id), offering]));
    const validMatches = matches
      .map((match) => stayById.get(match[1]))
      .filter(Boolean);
    const draftMarker = content.match(/\[\[GATHER_LISTING_DRAFT:(\{[\s\S]*?\})\]\]/);
    const listingDraft = draftMarker ? parseListingDraft(draftMarker[1]) : null;
    const hasListingAction = Boolean(draftMarker || content.includes("[[GATHER_CREATE_LISTING]]"));
    message.textContent = content
      .replace(/\s*\[\[GATHER_STAY:[a-zA-Z0-9_-]+\]\]\s*/g, "\n")
      .replace(/\s*\[\[GATHER_LISTING_DRAFT:\{[\s\S]*?\}\]\]\s*/g, "\n")
      .replace(/\s*\[\[GATHER_CREATE_LISTING\]\]\s*/g, "\n")
      .trim();

    if (!validMatches.length && !hasListingAction) return;
    const actions = document.createElement("div");
    actions.className = "trip-chat-actions";
    validMatches.forEach((offering) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-outline";
      button.dataset.openOffering = String(offering.id);
      button.textContent = `Start booking · ${offering.name}`;
      actions.appendChild(button);
    });
    if (hasListingAction) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-outline";
      button.textContent = listingDraft ? "Review listing draft" : "Start a property listing";
      button.addEventListener("click", () => {
        window.GatherChatListingDraft = listingDraft;
        document.querySelector("#add-offering-button").click();
      });
      actions.appendChild(button);
    }
    message.appendChild(actions);
    messagesElement.scrollTop = messagesElement.scrollHeight;
  }

  async function getAccessToken() {
    const response = await window.GatherSupabase.client.auth.getSession();
    if (response.error) throw new Error(response.error.message);
    const token = response.data.session && response.data.session.access_token;
    if (!token) {
      const error = new Error("Please sign in or continue with demo access before chatting with Gather.");
      error.requiresSignIn = true;
      throw error;
    }
    return token;
  }

  async function streamReply(response, message) {
    if (!response.body) throw new Error("Your browser cannot display a live response. Please try a current browser.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let finished = false;

    while (!finished) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          finished = true;
          break;
        }
        try {
          const event = JSON.parse(data);
          const token = event.choices && event.choices[0] && event.choices[0].delta && event.choices[0].delta.content;
          if (token) {
            content += token;
            message.textContent = content;
            messagesElement.scrollTop = messagesElement.scrollHeight;
          }
        } catch (error) {
          console.error("Gather received an invalid AI chat response chunk.", error);
          throw new Error("Gather received an incomplete response. Please try again.");
        }
      }

      if (chunk.done) break;
    }
    if (!content.trim()) throw new Error("Gather did not receive a reply. Please try again.");
    return content;
  }

  function showSignInAction(message) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-outline";
    button.textContent = "Sign in or choose demo access";
    button.addEventListener("click", () => document.querySelector("#account-button").click());
    message.appendChild(button);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = input.value.trim();
    if (!prompt || isSending) return;
    if (prompt.length > 800) {
      addMessage("assistant", "Please keep your message under 800 characters.", true);
      return;
    }

    isSending = true;
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    input.disabled = true;
    addMessage("user", prompt);
    const assistantMessage = addMessage("assistant", "Gather is thinking…");
    let userMessageAdded = false;

    try {
      const token = await getAccessToken();
      const data = await window.GatherSupabase.loadData(null);
      const offerings = data.offerings.slice(0, 30).map((offering) => ({
        id: String(offering.id),
        name: String(offering.name || "").slice(0, 100),
        category: String(offering.category || "").slice(0, 80),
        location: String(offering.location || "").slice(0, 120),
        description: String(offering.description || "").slice(0, 400),
        price: Number(offering.price) || 0,
        guests: Number(offering.guests) || 1,
        amenities: (offering.amenities || []).slice(0, 12).map((amenity) => String(amenity).slice(0, 60))
      }));
      const nextHistory = history.concat({ role: "user", content: prompt }).slice(-10);
      const config = window.GATHER_SUPABASE_CONFIG;
      const endpoint = `${config.url.replace(/\/$/, "")}/functions/v1/gather-chat`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.publishableKey,
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ messages: nextHistory, listings: offerings })
      });

      if (!response.ok) {
        let detail = "The AI assistant is temporarily unavailable. Please try again.";
        try {
          const body = await response.json();
          if (body.error) detail = body.error;
        } catch (error) {
          console.error("Could not read the Gather AI error response.", error);
        }
        const requestError = new Error(detail);
        requestError.requiresSignIn = response.status === 401;
        throw requestError;
      }

      userMessageAdded = true;
      const reply = await streamReply(response, assistantMessage);
      const safeReply = reply
        .replace(/\s*\[\[GATHER_STAY:[a-zA-Z0-9_-]+\]\]\s*/g, " ")
        .replace(/\s*\[\[GATHER_LISTING_DRAFT:\{[\s\S]*?\}\]\]\s*/g, " ")
        .replace(/\s*\[\[GATHER_CREATE_LISTING\]\]\s*/g, " ")
        .trim();
      history.push({ role: "user", content: prompt }, { role: "assistant", content: safeReply });
      addAssistantActions(assistantMessage, reply, offerings);
      input.value = "";
    } catch (error) {
      console.error("Could not complete the Gather AI chat request.", error);
      assistantMessage.textContent = error.message || "Gather could not reply right now. Please try again.";
      assistantMessage.classList.add("error");
      if (error.requiresSignIn) showSignInAction(assistantMessage);
      if (userMessageAdded) history.push({ role: "user", content: prompt });
    } finally {
      isSending = false;
      submitButton.disabled = false;
      input.disabled = false;
      input.focus();
      messagesElement.scrollTop = messagesElement.scrollHeight;
    }
  });
})();
