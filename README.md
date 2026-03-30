# Vehicle Expense Tracker PWA

A simple offline-first Progressive Web App for Android/mobile browsers.

## Features
- Multiple vehicles (cars, bikes)
- Trip add/update/delete with thumbnail upload
- Expense add/update/delete
- Expense filters by vehicle, trip, category, and date
- Auto trip expense totals
- Reports for current month, quarter, year, or current filters
- Fuel mileage insights based on fuel entries and odometer difference

## Data Storage
This app stores all entered data in your device browser storage using **IndexedDB**.

That means:
- **App files** are hosted on GitHub Pages
- **Your data stays on your device**
- GitHub does **not** store your expenses, vehicles, or trips unless you explicitly add a backend later

## How to deploy on GitHub Pages
1. Create a new GitHub repository, for example: `vehicle-tracker`
2. Upload all files from this folder to the repo root
3. Go to **Settings → Pages**
4. Under **Build and deployment**, choose:
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/root**
5. Save
6. Wait for the Pages URL to appear
7. Open the GitHub Pages URL on your Android phone in Chrome
8. Tap **Add to Home Screen**

## Usage notes
- Add at least one vehicle before adding an expense
- For mileage, use category **Fuel** and enter **Fuel Volume**
- Mileage is calculated from the odometer difference between consecutive fuel entries for the same vehicle

## Important limitations
- Since data is stored locally in the browser, clearing browser storage may remove your data
- Data does not sync across devices unless you build a backend later


## Backup and restore
- Use **Download Backup** on the Dashboard to save all local data as JSON
- Use **Restore Backup** to replace the current local app data with a backup file

- Reports page now includes a period selector for month, quarter, year, or applied filters, plus pie charts for breakdowns
