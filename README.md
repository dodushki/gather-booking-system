# Gather

A responsive Philippines-focused stay marketplace. The home page introduces destinations and featured stays; a dedicated search page supports destination/date/guest search, price and rating filters, sorting, and a map. The experience uses Gather’s own brand and visual style. Sample stays include city hotels, serviced apartments, heritage inns, farm stays, mountain cabins, and coastal homes across the Philippines; prices use PHP. Guests can create accounts to reserve and review trips; hosts can create accounts to list stays and review their guest reservations.

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

## Data and scope

Accounts, password hashes, sessions, bookings, listings, and favorites are stored in this browser’s local storage. Account data is not shared across devices or browsers. Passwords are hashed in the browser, but this local-only demo is **not a secure authentication service**: without a server and database, accounts and listings can be changed or read on the same device. Do not reuse real passwords or enter sensitive information. Booking notifications send booking and guest contact details through EmailJS to the configured admin email. Property photography and interactive map tiles require internet access; the map uses Leaflet with Esri World Street Map tiles, masks the area beyond the Philippines, and labels available stays in English. The local country outline is simplified geoBoundaries data sourced from [OCHA Philippines and NAMRIA](https://data.humdata.org/dataset/philippines-administrative-levels-0-to-3), licensed CC BY 3.0 IGO, with attribution on the map. Ratings and listings are sample data; Gather does not connect to hotel-price providers, take payments, provide remote inventory, or synchronize availability between users. Prices are displayed in Philippine pesos (PHP); reservations are local demos, not confirmed stays with real hosts.
