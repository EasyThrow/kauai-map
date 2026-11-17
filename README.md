# Kauai Trip Map

A password-protected, phone-friendly map of our Kauai trip spots. The spots live in a
Google Sheet. Edit a row, refresh the map, and the change shows up. You don't need to
redeploy.

- Live site: https://easythrow.github.io/kauai-map/
- Shared link to one spot: add `#spot=<id>`, e.g. `https://easythrow.github.io/kauai-map/#spot=example-beach`
- Debug view for checking pins: add `?debug=1`

---

## What the password does and does not protect

**It protects the site.** The deployed page is encrypted (StaticCrypt, AES-256). Without the
password, the page source contains no spots, no Sheet link and no form link. The deploy
refuses to publish if it finds any readable trip data.

**It does not protect the Google Sheet itself.** The map reads the Sheet's "published to the
web" link. Anyone who gets that link can read the **Spots** tab, with or without the password.
So:

- Never put the house address or anything private in the Sheet. The home base pin is a
  general area on purpose.
- Publish only the tabs the site reads (**Spots**, **Plan**, **Stay** and **Who's in**), never
  the whole document. Friends' suggestions stay private in the **Suggestions** tab.
- **Stay** shows the address, so anyone with the Sheet link can see it. Never put door codes,
  Wi-Fi or passwords anywhere in the Sheet. As a backstop, the site hides any Stay line that
  mentions a code, Wi-Fi or a password and flags it in `?debug=1`.
- **Who's in** shows first names and the time each pick was made.
- If the link ever leaks: in the Sheet, File > Share > Publish to web > **Stop publishing**,
  then publish again to get a new link, and update the `SHEET_CSV_URL` secret (step 3).

The terrain images in `public/terrain/` are public on purpose. They show only the shape of the
island.

---

## 1. Import the seed data into a Google Sheet

1. Sign in with the personal Gmail and open **sheets.new**. Name it **Kauai Trip Spots**.
2. Rename the tab at the bottom to **Spots**.
3. **File > Import > Upload**, pick `data/seed.csv` from this folder, choose **Replace current
   sheet**, then **Import data**. You should see the header `id` in cell A1.

`data/seed.csv` is only on this PC. Git ignores it.

## 2. Publish the Sheet as CSV

1. **File > Share > Publish to web**.
2. Under **Link**, choose the **Spots** tab (not "Entire document") and **Comma-separated
   values (.csv)**. Click **Publish**.
3. Under **Published content & settings**, keep **Automatically republish when changes are
   made** checked.
4. Copy the link. Don't paste it into chats or commit it.

For local work, put it in a file named `.env.local` in this folder (git ignores it):

```
VITE_SHEET_CSV_URL=<the published link>
VITE_SUGGEST_FORM_URL=<the form's pre-filled link, see "Suggest a spot" below>
```

`.env.example` shows the format.

## 3. Add the repository secrets

The deploy needs three secrets. They are stored encrypted by GitHub and never appear in the code
or the logs.

| Secret | What it is | Required |
|---|---|---|
| `SITE_PASSWORD` | The password friends type to open the map | Yes |
| `SHEET_CSV_URL` | The published Sheet link from step 2 | Yes |
| `SUGGEST_FORM_URL` | The Suggest form's pre-filled link | No; without it, the Suggest button is hidden |
| `INTEREST_FORM_URL` | The Who's in form's pre-filled link | No; without it, the I'm in buttons are hidden |

**From the terminal (easiest).** In VS Code, open **Terminal > New Terminal** in this folder
and run each line. Paste the value when asked; it stays hidden.

```
gh secret set SITE_PASSWORD
gh secret set SHEET_CSV_URL
gh secret set SUGGEST_FORM_URL
gh secret set INTEREST_FORM_URL
```

**Or on github.com:**

1. Open https://github.com/EasyThrow/kauai-map and click **Settings** (the gear tab at the top
   right of the repo, not your account settings).
2. In the left sidebar, under **Security**, click **Secrets and variables > Actions**.
3. Click the green **New repository secret** button.
4. **Name:** `SITE_PASSWORD`. **Secret:** the password. Click **Add secret**.
5. Repeat for `SHEET_CSV_URL`, `SUGGEST_FORM_URL` and `INTEREST_FORM_URL`.

To check which secrets exist without showing their values, run `gh secret list`.

## 4. Add or edit a spot

Edit the **Spots** tab. Each row is one place. Changes show on the map about 5 minutes after you
save, because Google caches the published copy, and anyone who refreshes sees them.

| Column | Notes |
|---|---|
| `id` | Short, unique, lowercase-with-dashes, e.g. `example-shrimp-truck`. Used in shared links. If you leave it blank, it's made from the name. |
| `name` | Display name |
| `primary_category` | `beach`, `snorkel`, `hike`, `activity`, `restaurant`, `essentials` (grocery, gas, pharmacy, rentals) or `home`. Decides the pin symbol. |
| `categories` | All of its categories, separated by `\|`, e.g. `beach\|snorkel` |
| `region` | `south`, `west`, `east`, `north` or `central` |
| `lat`, `lng` | Exact coordinates (see below) |
| `coord_point` | What the pin marks: parking lot, trailhead, restaurant entrance... |
| `verified` | `N` until you've checked the pin in `?debug=1`, then `Y` |
| `drive_min` | Minutes from the home base, a whole number. Shown as "~X min (+/- 15 min)". Can be blank. |
| `notes` | Short bullets separated by ` // ` |
| `tags` | Any of `reservation-required`, `winter-caution`, `calm-days-only`, `go-early`, `fee`, `check-status`, `lifeguard`, separated by `\|` |
| `price_pp` | Restaurants: average dollars per person, number only |
| `links` | `Label\|URL` pairs separated by ` ;; ` |
| `photo_url`, `photo_credit`, `photo_license` | A free-license photo (Wikimedia Commons or Unsplash) and its credit |
| `sort` | Optional manual order within a category |

**Getting exact coordinates from Google Maps:**

- **Computer:** right-click the spot. The first line of the menu is the coordinates, e.g.
  `21.90000, -159.50000`. Click it to copy.
- **Phone:** long-press to drop a pin. The coordinates appear in the search bar.
- Paste the whole pair into the **`lat`** cell. The map splits it into lat and lng for you.
- For trails, put the pin at the **trailhead parking**. For beaches, put it at the **main access
  or parking**.
- If you only have degrees/minutes/seconds (`21°54'00.0"N`), paste it into the Google Maps search
  box and copy the decimal version it shows.

### Suggest a spot (friends)

Friends tap **+ Suggest**, then tap the map. Or they can long-press on a phone, or right-click on
a computer. A short Google Form opens with the location filled in. Answers land in the private
**Suggestions** tab. The **Ready to add** tab rearranges each one into the Spots column order.

**To approve a suggestion:**

1. Copy its row from **Ready to add**.
2. In **Spots**, right-click the next empty row and choose **Paste special > Values only**.
3. Add a region and drive time if you like.
4. Delete the row from **Suggestions**.

### The Plan tab (agenda)

The site's **Plan** tab reads the **Plan** tab of the Sheet. Each row is one activity. Changes
show up about 5 minutes after you save, just like spots. All times are Hawaii time.

| Column | Notes |
|---|---|
| `id` | Optional short id, e.g. `napali-boat`. Used in shared links. Made from the date and title if blank. |
| `date` | Required, e.g. `2027-02-14` or `2/14/2027` |
| `start`, `end` | e.g. `9:30 AM`. Leave `start` blank for an "any time" item. |
| `title` | Required |
| `spot_id` | The `id` of a spot in **Spots**. Links the card to its pin and puts the spot in the map's Day filter. |
| `meeting_point` | Where to meet, if not the spot itself |
| `who` | e.g. `Everyone` or `Sam, Alex` |
| `cost_pp` | Dollars per person, number only (or a short note) |
| `bring` | What to bring |
| `status` | `booked`, `to-book` or `tentative` (blank = tentative) |
| `book_by` | Booking deadline. `to-book` items show in **Still to book**, soonest first. |
| `booked_by` | Who holds the booking. Put the name here, not the confirmation number. |
| `notes` | Short bullets separated by ` // ` |
| `links` | `Label\|URL` pairs separated by ` ;; ` |

Day 1 is the earliest date in the tab. Before the trip, the Plan shows a countdown. During the trip,
it shows **Up next** and opens at today.

### The Stay tab

The site's **Stay** tab reads the **Stay** tab of the Sheet. Until a row is added, it says
"Not booked yet". Add a second row if the trip moves to another place.

| Column | Notes |
|---|---|
| `name` | e.g. `Beach house` |
| `address` | Street address. Used for **Copy address**, and for directions when there are no coordinates. |
| `lat`, `lng` | Optional exact coordinates (paste the Google Maps pair into `lat`). More accurate directions. |
| `check_in`, `check_in_time` | e.g. `2/13/2027` and `4:00 PM` |
| `check_out`, `check_out_time` | e.g. `2/18/2027` and `10:00 AM` |
| `sleeping` | Who sleeps where, separated by ` // `, e.g. `Main: Sam + Alex // Loft: Jordan` |
| `parking` | Parking notes |
| `host` | Host's first name, if useful |
| `notes` | Short bullets separated by ` // ` |
| `links` | `Label|URL` pairs separated by ` ;; `, e.g. the listing |
| `photo_url` | Optional photo of the place |

**Never** add door codes, Wi-Fi details or passwords. Share those in the group chat.

### Who's in (the interest form)

Friends tap **I'm in** on a spot. The site sends their answer to a Google Form and remembers
their first name on that phone. The form's responses tab is published with the Sheet, and the
**Who's in** tab shows each spot's people, most popular first. A person's latest answer for a
spot counts, so tapping again removes them. New picks show for everyone in about 5 minutes.

The form has three questions, named exactly: **Spot** (short answer), **First name** (short
answer) and **In or out** (multiple choice: `In`, `Out`). It must not collect emails or
require sign-in.

## 5. Check new pins with `?debug=1`

Open the map with `?debug=1` at the end of the address, e.g.
`https://easythrow.github.io/kauai-map/?debug=1`.

- **Dashed outline:** the pin is still `verified = N`.
- **Red ring:** the row is skipped for viewers. The Debug panel at the top right says why, for
  example missing coordinates, outside Kauai, an unknown category or a duplicate id.
- The **Debug** panel lists every problem with its Sheet row number. Tap one to fly to it.

To compare every pin with OpenStreetMap and get drive time estimates, run:

```
npm run snapshot
npm run verify
```

This writes `data/verification-report.md`, which stays on this PC. It never changes the Sheet and
never marks anything verified.

## 6. Refresh the saved backup copy

Every deploy saves a copy of the Sheet inside the encrypted page. If Google can't be reached, the
map shows that copy with a small **Showing saved data** note.

To refresh the copy without changing any code:

1. Go to https://github.com/EasyThrow/kauai-map/actions.
2. Click **Deploy map** in the left list.
3. Click **Run workflow > Run workflow**.

Or from the terminal: `gh workflow run deploy.yml`. It takes about 2 minutes.

## 7. Change the password and sign out remembered devices

1. Set the new password: `gh secret set SITE_PASSWORD`, or update it on github.com (step 3).
2. Re-run the deploy (step 6).

Every device that chose **Remember this device** is signed out automatically. Their saved key
only matches the old password. Send friends the new password.

To sign out just your own device, open `https://easythrow.github.io/kauai-map/?staticrypt_logout`.

---

## For development

```
npm install
npm run dev              # local map at http://localhost:5173 (reads .env.local)
npm run preview:locked   # the password-protected build at http://localhost:4173, password "preview"
npm run bake-terrain     # re-render public/terrain/ (only if terrain colors or areas change)
```

| Path | What it is |
|---|---|
| `src/` | Map setup, data loading, checks, and the UI (sheet, list, filters, suggest, debug) |
| `styles/main.css` | All styling |
| `icons/` | Tabler icons (MIT; see `icons/LICENSE`) |
| `public/terrain/` | Baked terrain images |
| `staticrypt/password_template.html` | The password screen |
| `scripts/` | Sheet snapshot, coordinate check, terrain baking, encryption |
| `.github/workflows/deploy.yml` | Build, encrypt and deploy to GitHub Pages |

Map data © OpenStreetMap contributors (via OpenFreeMap / OpenMapTiles). Terrain: AWS Terrain
Tiles. Photos: credited in each popup.
