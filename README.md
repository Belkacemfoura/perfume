# Perfume app – v0.1

A small web app for running a one-person perfume business from an iPhone. It keeps stock by scent, size and batch, records sales by scanning bottle labels, and tracks expenses and monthly profit. Everything is stored on the phone.

## What's in this version

- Scents with your own names, an "inspired by" note and a price for each size (10, 30, 50, 100 ml)
- Batches covering several scents, with stock left per batch
- Label export for the NIIMBOT B1: an Excel file with one row per bottle
- Scan to sell with the camera, or add a bottle by hand, with discount buttons and Cash or STC Pay
- Expenses with a receipt photo, linked to a batch so the app works out cost per ml
- Home summary: today's sales, this month's revenue, expenses and profit, and stock running low
- Backup and restore through a single file you keep in iCloud Drive

Not in this version yet: reading receipts and STC Pay or WhatsApp screenshots automatically, WhatsApp orders, and bazaar mode.

## Putting it online (free, about 10 minutes)

The app has to be served over https so the iPhone allows the camera. GitHub Pages does that for free.

1. Create a free account at github.com if you don't have one.
2. Create a new repository, for example `perfume`. It can be public. Your data never goes there, only the app's code.
3. Click **Add file › Upload files** and upload everything in this folder: `index.html`, `app.js`, `sw.js`, `manifest.webmanifest`, `README.md` and the `icons` folder.
4. Go to **Settings › Pages**. Under "Build and deployment", choose **Deploy from a branch**, pick `main` and `/ (root)`, then save.
5. After a minute the page shows your address, something like `https://yourname.github.io/perfume/`.

## Installing it on her iPhone

1. Open the address in **Safari**.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Open it from the new icon and allow the camera the first time she scans.

Open it once while online. That saves the scanner and Excel parts for offline use, such as at a bazaar.

## Printing labels on the NIIMBOT B1

1. In the app, open a batch and tap **Export labels for NIIMBOT**. Save the file to Files.
2. In the NIIMBOT app, make a 50 × 30 mm label with a QR code and text fields for the scent name, size and batch.
3. Use the NIIMBOT app's Excel import for batch printing and pick the exported file. Link the QR code to the `QR` column and the text fields to `Scent`, `Size` and `Batch`.
4. Print. You get one label per bottle.

Each QR code holds text like `PF|B-08|S03|50` (batch, scent code, size). That's what the scanner reads.

## Updating the app

Upload the changed files to the same repository. The phone picks up the new version the next time the app is opened online.

## Backups

Records live only on the phone. Use **Settings › Save backup** weekly and keep the file in iCloud Drive. The same file will move her data into the native App Store version later.
