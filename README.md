# Gather

A responsive Philippines-focused stay marketplace. The home page introduces destinations and featured stays; a dedicated search page supports destination/date/guest search, price and rating filters, sorting, and a map. The experience uses Gather’s own brand and visual style. Sample stays include city hotels, serviced apartments, heritage inns, farm stays, mountain cabins, and coastal homes across the Philippines; prices use PHP. Presentation guests can browse, save favorites, and make shared demo bookings without email signup; registered guests can review their trips, and hosts can list stays and review guest reservations.

## Run it

On Windows, open PowerShell in this folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Then visit [http://localhost:4173](http://localhost:4173). Stop the local server with Ctrl+C. Use the local server for the full map and account flows; browsers restrict some features when opening `index.html` directly.

## Test it

With the local server running, open [http://localhost:4173/tests.html](http://localhost:4173/tests.html). The page runs focused browser-native checks for stay lengths, minimum stays, guest capacity, overlapping reservations, cancellation, booking validation, local assistant recommendations and listing drafts, EmailJS notifications, and the local Philippines border asset.

## Configure booking email notifications

Booking email alerts use EmailJS from the browser. In EmailJS, connect an email service and create a template addressed directly to `quindoza127@gmail.com` (keep the recipient fixed in the template; do not make it user-editable). Use these template variables: `{{booking_id}}`, `{{guest_name}}`, `{{guest_email}}`, `{{property_name}}`, `{{property_location}}`, `{{check_in}}`, `{{check_out}}`, `{{nights}}`, `{{guests}}`, `{{price_per_night}}`, `{{total}}`, and `{{guest_notes}}`. Restrict allowed origins in EmailJS to your GitHub Pages site, then put the service ID, template ID, and EmailJS public key in `email-config.js` and publish the file. The public key and these IDs are designed for browser use; never put an EmailJS private key or email-account password in this project. Until the IDs and public key are configured, bookings are saved locally and the app reports that no email was sent.

## Configure shared accounts and bookings

Gather uses Supabase Auth, a shared Postgres database, and Supabase Storage for accounts, listings, reservations, favorites, date availability, and host-uploaded property photos.

1. In the Supabase dashboard for the Gather project, open **SQL Editor**, create a query, paste the contents of `supabase-schema.sql`, and run it. This creates the tables, starter stays, row-level security policies, the public `listing-photos` bucket with host-only uploads, and server-side booking functions. Rerun the script after updates.
2. In **Authentication → URL Configuration**, set the site URL to `https://dodushki.github.io/gather-booking-system/` and add that URL to the allowed redirect URLs. Add `http://localhost:4173/` too for local development. The confirmation link redirects to the current Gather page URL.
3. Keep the Project URL and publishable key in `supabase-config.js`. A publishable key is intended for browser use; never put a Supabase secret/service-role key or database password in the website.
4. Open the live site and create a new account. If email confirmation is enabled in Supabase, verify the message first, then sign in. Old browser-only accounts and data are not migrated automatically.
5. To let presentation visitors book without email signup, open **Authentication → Sign In / Providers** and enable **Anonymous Sign-Ins**. Then rerun `supabase-schema.sql`; it allows guest profiles and demo bookings without email addresses. Supabase may apply its own anonymous-auth rate limits.

Row-level security limits profile access to its owner, listings to their host for changes, and reservations to the guest and the listing host. Booking creation, date-conflict checks, cancellation, and listing removal run through restricted database functions. Public users can read only confirmed reservation date ranges needed to show availability; guest contact details are not public. Do not disable RLS or add permissive public policies.

## Gather booking assistant

Gather’s trip chat uses a hosted, streaming model to respond naturally, answer greetings, and help people discover Philippines stays. The current deployment uses Groq’s OpenAI-compatible chat API through a Supabase Edge Function. The provider and model are configurable; requests run on the provider’s servers, not your PC or your visitors’ devices. The website does not contain the provider API token.

To enable AI replies:

1. In Groq, create an API key and choose a currently available chat model.
2. In the Supabase project’s **Edge Function secrets**, set `GATHER_AI_BASE_URL` to `https://api.groq.com/openai/v1`, `GATHER_AI_API_KEY` to your Groq API key, and `GATHER_AI_MODEL` to the model you chose. Enter the key only in Supabase secrets; never paste it into chat or commit it to the repository.
3. From a terminal with the Supabase CLI installed, run `supabase login`, `supabase link --project-ref gcrxsoacrdzyksutwjga`, then `supabase functions deploy gather-chat`.

Groq’s quotas, model availability, and terms can change. Until the function and secrets are configured, Gather will explain that its AI is unavailable.

The function validates chat history, sends only the conversation and public listing details to the configured provider, and streams its response to the browser. Do not send passwords, payment information, or other sensitive details in chat. For booking assistance, the model can recommend only supplied listings; Gather verifies any selected stay against current availability, gathers dates and guests in chat, shows the total, and requires explicit confirmation before saving through Gather’s booking service. The model cannot create or confirm bookings on its own. Listing preparation continues to use Gather’s guided draft flow and editable listing form.

## Presentation guest mode

The welcome screen first explains that Gather is a presentation demo, then opens sign-in. From the sign-in dialog, visitors can choose a display name and continue as a demo guest or host without an email address or password. When a session is active, the welcome screen also offers **Sign out or use a different account**; after confirmation it signs out and opens sign-in. Demo hosts use Supabase anonymous authentication with the host role: they can browse, save favorites, book stays, and create or manage their own listings, but have no site-administration, settings, or code access. Hosts can see guest names on reservations for their own listings. Guest bookings update shared availability but do not contact a host, send an email, arrange a real stay, or collect payment. Anonymous sessions remain on the browser where they were created; after signing out, the user can no longer access their trips or manage their listings. Enable Anonymous Sign-Ins in the Supabase dashboard before presenting.

## Data and scope

Accounts, listings, uploaded property photos, bookings, favorites, and availability are stored in the shared Supabase project and are visible across browsers after refresh. Signed-in guests and hosts can filter the stay results by Favorites. Gather asks for confirmation before account creation, booking, publishing or updating a listing, cancelling a booking, removing a listing, or signing out; routine actions provide immediate feedback without extra prompts. Hosts can attach JPG, PNG, or WebP listing photos up to 5 MB and pin an approximate public location on the Philippines map; search supports custom guest counts from 9 to 20, matching the listing capacity limit. Email booking notifications are sent only for non-anonymous account bookings through EmailJS to the configured admin email; presentation guest bookings do not trigger them. Account and booking data that was only in local browser storage is not automatically transferred. The hero photo, Supabase client library, and interactive map tiles require internet access; the eight sample destination photos are stored locally. The map uses Leaflet with Esri World Street Map tiles, masks the area beyond the Philippines, and labels stays in English. The local country outline is simplified geoBoundaries data sourced from [OCHA Philippines and NAMRIA](https://data.humdata.org/dataset/philippines-administrative-levels-0-to-3), licensed CC BY 3.0 IGO, with attribution on the map. Ratings and the initial listings are sample data; Gather does not connect to hotel-price providers or take payments. Prices are displayed in Philippine pesos (PHP); reservations are demo bookings, not confirmed stays with real hosts.

## Destination photo credits

The eight sample listings use local photos of real Philippine destinations; they are representative destination images and may not depict the sample property itself. Credits and license links are shown in the app’s **Photo credits** disclosure and documented in [`assets/stays/ATTRIBUTION.md`](assets/stays/ATTRIBUTION.md). Rerun `supabase-schema.sql` to migrate existing starter listings from the old generic photo URLs. The migration leaves photos that have already been customized unchanged.
