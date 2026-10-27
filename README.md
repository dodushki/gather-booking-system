# Gather

A responsive Philippines-focused stay marketplace. The home page introduces destinations and featured stays; a dedicated search page supports destination/date/guest search, price and rating filters, sorting, and a map. The experience uses Gather’s own brand and visual style. Sample stays include city hotels, serviced apartments, heritage inns, farm stays, mountain cabins, and coastal homes across the Philippines; prices use PHP. Presentation guests can browse, save favorites, and make shared demo bookings without email signup; registered guests can review their trips, and hosts can list stays and review guest reservations.

## Run it

On Windows, open PowerShell in this folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Then visit [http://localhost:4173](http://localhost:4173). Stop the local server with Ctrl+C. Use the local server for the full map and account flows; browsers restrict some features when opening `index.html` directly.

## Test it

With the local server running, open [http://localhost:4173/tests.html](http://localhost:4173/tests.html). The page runs focused browser-native checks for stay lengths, minimum stays, guest capacity, overlapping reservations, cancellation, booking validation, EmailJS notifications, and the local Philippines border asset.

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

## Presentation guest mode

The welcome screen explains that Gather is a student presentation demo. Visitors can enter a name and continue without an email address or password. Guest profiles use Supabase anonymous authentication, so each guest can see and manage only their own trips and favorites; hosts can see guest names on reservations for their listings. Guest bookings update shared availability but do not contact a host, send an email, arrange a real stay, or collect payment. Demo reservations remain in the shared database if a guest ends the session; after signing out, that guest can no longer view or cancel them. Enable Anonymous Sign-Ins in the Supabase dashboard before presenting.

## Data and scope

Accounts, listings, uploaded property photos, bookings, favorites, and availability are stored in the shared Supabase project and are visible across browsers after refresh. Signed-in guests and hosts can filter the stay results by Favorites. Gather asks for confirmation before account creation, booking, publishing or updating a listing, cancelling a booking, removing a listing, or signing out; routine actions provide immediate feedback without extra prompts. Hosts can attach JPG, PNG, or WebP listing photos up to 5 MB and pin an approximate public location on the Philippines map; search supports custom guest counts from 9 to 20, matching the listing capacity limit. Email booking notifications are sent only for non-anonymous account bookings through EmailJS to the configured admin email; presentation guest bookings do not trigger them. Account and booking data that was only in local browser storage is not automatically transferred. Property photography, the Supabase client library, and interactive map tiles require internet access; the map uses Leaflet with Esri World Street Map tiles, masks the area beyond the Philippines, and labels stays in English. The local country outline is simplified geoBoundaries data sourced from [OCHA Philippines and NAMRIA](https://data.humdata.org/dataset/philippines-administrative-levels-0-to-3), licensed CC BY 3.0 IGO, with attribution on the map. Ratings and the initial listings are sample data; Gather does not connect to hotel-price providers or take payments. Prices are displayed in Philippine pesos (PHP); reservations are demo bookings, not confirmed stays with real hosts.
