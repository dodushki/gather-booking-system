# Gather

A responsive Philippines-focused stay marketplace. Visitors can browse without an account; an account is required to send a booking request. The search page supports destination/date/guest search, category and price/rating filters, sorting, and a map, with a responsive category sidebar. The starter inventory includes at least 25 named Philippine properties and indicative PHP prices.

## Run it

On Windows, open PowerShell in this folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Then visit [http://localhost:4173](http://localhost:4173). Stop the local server with Ctrl+C. Use the local server for the full map and account flows; browsers restrict some features when opening `index.html` directly.

## Test it

With the local server running, open [http://localhost:4173/tests.html](http://localhost:4173/tests.html). The page runs focused browser-native checks for stay lengths, minimum stays, guest capacity, overlapping reservations, cancellation, booking validation, local assistant recommendations and listing drafts, EmailJS notifications, and the local Philippines border asset.

## Booking requests and email notifications

The disclaimer appears once per browser session and explains that listings, rates, and availability may be inaccurate. Submitting a request saves it in Gather; it is not sent to the property and does not reserve a room or confirm a stay. Guests must contact the property directly to verify dates, price, and terms. Pending requests do not block availability. Gather does not process payments or claim property affiliation, and this MVP has no in-app property confirmation workflow.

EmailJS can send private booking-request alerts from the browser. In EmailJS, connect an email service and create a template addressed to the configured administrator (keep the recipient fixed in the template; do not make it user-editable or display it in the app). Use these template variables: `{{booking_id}}`, `{{guest_name}}`, `{{guest_email}}`, `{{property_name}}`, `{{property_location}}`, `{{check_in}}`, `{{check_out}}`, `{{nights}}`, `{{guests}}`, `{{price_per_night}}`, `{{total}}`, and `{{guest_notes}}`. Restrict allowed origins in EmailJS to your GitHub Pages site, then put the service ID, template ID, and EmailJS public key in `email-config.js`. Never put an EmailJS private key or email-account password in this project. Until configured, requests are saved to Supabase and the app reports that no email was sent; an email alert is not a property confirmation.

## Configure shared accounts and bookings

Gather uses Supabase Auth, a shared Postgres database, and Supabase Storage for accounts, listings, reservations, favorites, date availability, and host-uploaded property photos.

1. In the Supabase dashboard for the Gather project, open **SQL Editor**, create a query, paste the contents of `supabase-schema.sql`, and run it. This creates the tables, starter stays, row-level security policies, the public `listing-photos` bucket with host-only uploads, and server-side booking functions. Rerun the script after updates.
2. In **Authentication → URL Configuration**, set the site URL to `https://dodushki.github.io/gather-booking-system/` and add that URL to the allowed redirect URLs. Add `http://localhost:4173/` too for local development. The confirmation link redirects to the current Gather page URL.
3. Keep the Project URL and publishable key in `supabase-config.js`. A publishable key is intended for browser use; never put a Supabase secret/service-role key or database password in the website.
4. Open the live site and create a new account. If email confirmation is enabled in Supabase, verify the message first, then sign in. Old browser-only accounts and data are not migrated automatically.
5. Visitors may browse without signing in. Guests must create or sign in to a regular account before sending a request. Anonymous sign-in is not required for the visitor booking flow.

### Provision a site administrator

There is no shared `admin` / `admin` login. Create a normal account for the person who will administer Gather, verify its email if confirmation is enabled, and sign in once so its profile exists. In Supabase **Authentication → Users**, copy that account's user ID. In **SQL Editor**, run the following with that UUID substituted:

```sql
update public.profiles
set role = 'admin'
where id = 'PASTE-THE-ACCOUNT-UUID-HERE';

select id, name, email, role
from public.profiles
where id = 'PASTE-THE-ACCOUNT-UUID-HERE';
```

Confirm the query returns exactly that account with the `admin` role. The admin dashboard then provides access to all listings and booking records, with controls to edit listing and booking details. To revoke access, change that profile's role back to `guest` or `host`. Signup only creates guest or host profiles; clients cannot promote themselves. Keep SQL Editor access and the administrator account credentials private.

Row-level security limits profile access to its owner (or a trusted Gather administrator), listing changes to the listing's host (or an administrator), and reservation access to the guest and listing host (or an administrator). Booking creation, date-conflict checks, cancellation, listing removal, and administrator booking edits run through restricted database functions. Public users can read only confirmed reservation date ranges needed to show availability; guest contact details are not public. Do not disable RLS or add permissive public policies.

## Gather booking assistant

Gather’s trip chat is available from the floating **Ask Gather** button on every page. It uses a hosted, streaming model to respond naturally, answer greetings, and help people discover Philippines stays. The current deployment uses Groq’s OpenAI-compatible chat API through a Supabase Edge Function. The provider and model are configurable; requests run on the provider’s servers, not your PC or your visitors’ devices. The website does not contain the provider API token.

To enable AI replies:

1. In Groq, create an API key and choose a currently available chat model.
2. In the Supabase project’s **Edge Function secrets**, set `GATHER_AI_BASE_URL` to `https://api.groq.com/openai/v1`, `GATHER_AI_API_KEY` to your Groq API key, and `GATHER_AI_MODEL` to the model you chose. Enter the key only in Supabase secrets; never paste it into chat or commit it to the repository.
3. From a terminal with the Supabase CLI installed, run `supabase login`, `supabase link --project-ref gcrxsoacrdzyksutwjga`, then `supabase functions deploy gather-chat`.

Groq’s quotas, model availability, and terms can change. Until the function and secrets are configured, Gather will explain that its AI is unavailable.

The function validates chat history, sends only the conversation and public listing details to the configured provider, and streams its response to the browser. Do not send passwords, payment information, or other sensitive details in chat. For booking assistance, the model can recommend only supplied listings; Gather checks current on-file availability, gathers dates and guests in chat, shows an estimated total, then requires sign-in and explicit confirmation before saving a pending request. Requests are not sent to the property; guests must contact it directly to confirm. Listing preparation continues to use Gather’s guided draft flow and editable listing form.

## Host and administrator management

Hosts can manage their own listings and review requests associated with them. A trusted site administrator can manage all listings and edit booking details across Gather. Requests are not sent to guests or confirmed in Gather; hosts must contact guests directly to verify dates, rates, and terms.

## Data and scope

Accounts, listings, uploaded property photos, booking requests, favorites, and confirmed date ranges are stored in the shared Supabase project. Signed-in guests and hosts can filter results by Favorites. Hosts can attach JPG, PNG, or WebP listing photos up to 5 MB and pin an approximate public location on the Philippines map; search supports custom guest counts from 9 to 20. The starter property names refer to real-world properties, but displayed rates, capacities, coordinates, room details, property affiliations, and availability are not verified or live inventory. Some photos are representative destination images and may not depict the named property. Gather does not connect to hotel-price providers or take payments. Requests are saved in Gather, not sent to properties; guests should contact properties directly. Prices use PHP; requests are not confirmed stays.

## Destination photo credits

Most starter listings use local photos of real Philippine destinations; they are representative images and may not depict the named property. The Peninsula Manila, Hotel Luna, and Taal Vista Hotel currently use property-specific photos. Credits and license links are shown in the app’s **Photo credits** disclosure and documented in [`assets/stays/ATTRIBUTION.md`](assets/stays/ATTRIBUTION.md). Rerun `supabase-schema.sql` to add the new starter listings and update unowned starter records. The migration updates these photos only when their existing image still matches the previous default, and leaves host-managed photos unchanged.
