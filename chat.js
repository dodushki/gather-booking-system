(function () {
  "use strict";

  const form = document.querySelector("#trip-chat-form");
  const input = document.querySelector("#trip-chat-prompt");
  const messagesElement = document.querySelector("#trip-chat-messages");
  if (!form || !input || !messagesElement) return;

  let isSending = false;
  let conversationState = {};

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
    messagesElement.replaceChildren();
    addMessage("assistant", "Hi! I can help you find a stay or prepare a property listing. Tell me what you’re looking for.");
  }

  function addAssistantActions(message, result) {
    if (!result.stays.length && !result.listingDraft) return;
    const actions = document.createElement("div");
    actions.className = "trip-chat-actions";
    result.stays.forEach((offering) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-outline";
      button.dataset.openOffering = String(offering.id);
      button.textContent = `Check dates · ${offering.name} · ₱${Number(offering.price).toLocaleString("en-PH")}/night`;
      button.addEventListener("click", () => {
        const preferences = result.state.preferences || {};
        window.GatherChatBookingPreferences = {
          guests: preferences.guests || null,
          dates: preferences.dates || null
        };
      });
      actions.appendChild(button);
    });
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
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    input.disabled = true;
    addMessage("user", prompt);
    const assistantMessage = addMessage("assistant", "Checking Gather’s current stays…");

    try {
      const data = await window.GatherSupabase.loadData(null);
      const result = window.GatherAssistant.respond(prompt, data, conversationState);
      conversationState = result.state;
      assistantMessage.textContent = result.reply;
      addAssistantActions(assistantMessage, result);
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
