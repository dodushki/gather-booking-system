(function () {
  "use strict";

  const form = document.querySelector("#trip-chat-form");
  const input = document.querySelector("#trip-chat-prompt");
  const messagesElement = document.querySelector("#trip-chat-messages");
  const promptSuggestions = document.querySelector("#trip-chat-prompts");
  if (!form || !input || !messagesElement) return;

  let isSending = false;
  let conversationState = {};
  let conversationMessages = [];

  function addMessage(role, text, isError) {
    const message = document.createElement("div");
    message.className = `trip-chat-message ${role}${isError ? " error" : ""}`;
    message.textContent = text;
    messagesElement.appendChild(message);
    messagesElement.scrollTop = messagesElement.scrollHeight;
    return message;
  }

  function resetConversation() {
    conversationState = {};
    conversationMessages = [];
    messagesElement.replaceChildren();
    addMessage("assistant", "Hi! Tell me where you’d like to go, when you’re traveling, or what kind of stay you have in mind. I can help you choose a place and book it right here.");
    if (promptSuggestions) promptSuggestions.hidden = false;
  }

  document.querySelectorAll("[data-trip-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      input.value = button.dataset.tripPrompt;
      form.requestSubmit();
    });
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  function parseAssistantReply(text, offerings) {
    const stays = [];
    const reply = text.replace(/\[\[GATHER_STAY:([^\]]+)\]\]/g, (marker, id) => {
      const offering = offerings.find((item) => String(item.id) === id.trim());
      if (offering && !stays.some((stay) => stay.id === offering.id)) stays.push(offering);
      return "";
    }).replace(/\[\[GATHER_LISTING_DRAFT:[\s\S]*?\]\]/g, "").trim();
    return { reply, stays: stays.slice(0, 3) };
  }

  function addAssistantActions(message, result) {
    if (!result.stays.length && !result.listingDraft && !result.bookingReady) return;
    const actions = document.createElement("div");
    actions.className = "trip-chat-actions";
    result.stays.forEach((offering) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-outline";
      button.dataset.bookOffering = String(offering.id);
      button.textContent = `Book with Gather · ${offering.name} · ₱${Number(offering.price).toLocaleString("en-PH")}/night`;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const data = await window.GatherSupabase.loadData(null);
          const next = window.GatherAssistant.startBooking(offering.id, data, result.state);
          conversationState = next.state;
          const reply = addMessage("assistant", next.reply);
          addAssistantActions(reply, next);
        } catch (error) {
          console.error("Gather could not start this booking.", error);
          addMessage("assistant", `I couldn’t start that booking. ${error.message || "Please try again."}`, true);
          button.disabled = false;
        }

      });
      actions.appendChild(button);
    });
    if (result.bookingReady) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-dark";
      button.textContent = `Confirm booking · ₱${result.bookingReady.total.toLocaleString("en-PH")}`;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const outcome = await window.GatherChatActions.confirmBooking(result.bookingReady);
          if (outcome.requiresSignIn) {
            addMessage("assistant", "Please sign in or continue as a demo guest to finish. Gather has carried your selected stay and dates into the booking form.");
          } else if (outcome.cancelled) {
            addMessage("assistant", "No booking was made. Your stay details are still here if you’d like to confirm later.");
            button.disabled = false;
          } else {
            addMessage("assistant", `Your ${outcome.nights}-night stay at ${outcome.offeringName} is booked. You can review it in My bookings.`);
          }
        } catch (error) {
          console.error("Gather could not complete the chat booking.", error);
          addMessage("assistant", `I couldn’t complete that booking. ${error.message || "Please try again."}`, true);
          button.disabled = false;
        }
      });
      actions.appendChild(button);
    }
    if (result.listingDraft) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-outline";
      button.textContent = "Review listing draft";
      button.addEventListener("click", () => {
        window.GatherChatListingDraft = result.listingDraft;
        document.querySelector("#add-offering-button").click();
      });
      actions.appendChild(button);
    }
    message.appendChild(actions);
    messagesElement.scrollTop = messagesElement.scrollHeight;
  }

  window.addEventListener("gather-auth-changed", resetConversation);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = input.value.trim();
    if (!prompt || isSending) return;
    if (prompt.length > 800) {
      addMessage("assistant", "Please keep your message under 800 characters.", true);
      return;
    }

    isSending = true;
    if (promptSuggestions) promptSuggestions.hidden = true;
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    input.disabled = true;
    addMessage("user", prompt);
    const assistantMessage = addMessage("assistant", "Gather is thinking…");

    try {
      const data = await window.GatherSupabase.loadData(null);
      if (conversationState.bookingDraft || conversationState.mode === "listing" ||
          window.GatherAssistant.respond(prompt, data, conversationState).state.mode === "listing") {
        const result = window.GatherAssistant.respond(prompt, data, conversationState);
        conversationState = result.state;
        assistantMessage.textContent = result.reply;
        addAssistantActions(assistantMessage, result);
      } else {
        const nextMessages = conversationMessages.concat({ role: "user", content: prompt }).slice(-10);
        let streamedText = "";
        const response = await window.GatherSupabase.chatAssistant({
          messages: nextMessages,
          listings: data.offerings,
          onToken: (token) => {
            streamedText += token;
            assistantMessage.textContent = streamedText.replace(/\[\[GATHER_[A-Z_]*:[^\]]*$/, "").trim();
            messagesElement.scrollTop = messagesElement.scrollHeight;
          }
        });
        const parsed = parseAssistantReply(response, data.offerings || []);
        if (!parsed.reply && !parsed.stays.length) throw new Error("Gather’s AI assistant didn’t return a usable reply.");
        assistantMessage.textContent = parsed.reply;
        const assistantHistory = parsed.reply || "I found a Gather stay that may suit you.";
        conversationMessages = nextMessages.concat({ role: "assistant", content: assistantHistory }).slice(-10);
        addAssistantActions(assistantMessage, {
          ...parsed,
          listingDraft: null,
          bookingReady: null,
          state: { ...conversationState, mode: "booking", preferences: conversationState.preferences || {} }
        });
      }
      input.value = "";
    } catch (error) {
      console.error("Gather could not process the assistant request.", error);
      assistantMessage.textContent = `I couldn’t check Gather’s listings right now. ${error.message || "Please try again."}`;
      assistantMessage.classList.add("error");
    } finally {
      isSending = false;
      submitButton.disabled = false;
      input.disabled = false;
      input.focus();
      messagesElement.scrollTop = messagesElement.scrollHeight;
    }
  });
})();
