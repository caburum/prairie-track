# PrairieTrack

A userscript for tracking PrairieLearn and PrairieTest assessments.

## Features

- 📚 Track all upcoming assessments across multiple courses
- 🔄 Auto-refresh stale data (after 3 hours)
- 🎯 Filter assessments by due date and completion status
- 🔔 Toast notifications for data refresh
- ⚡ Uses fetch API for efficient scraping (no popups needed!)

## Installation

### As a Userscript

1. Install a userscript manager:
   - [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Firefox, Edge, Safari, Opera)
   - [Violentmonkey](https://violentmonkey.github.io/) (Chrome, Firefox, Edge)
   - [Greasemonkey](https://www.greasespot.net/) (Firefox)

2. Install PrairieTrack:
   - Click on the userscript manager icon in your browser
   - Select "Create a new script" or "+" button
   - Copy the contents of `PrairieTrack.user.js` into the editor
   - Save the script

3. Navigate to any PrairieLearn page and the script will automatically run!

### Legacy: As a Chrome Extension

The Chrome extension files (manifest.json, popup.html) are still included for backwards compatibility, but the userscript version is recommended.

## Usage

- **On Course List Page**: View all upcoming assessments from all courses in one place
- **On Assessment Page**: Automatically tracks assessments that are:
  - Not yet 100% complete
  - Have an upcoming due date
- **Reload Button**: Click to manually refresh assessment data
- **Auto-refresh**: Data automatically refreshes after 3 hours

## Development

The main script is in `PrairieTrack.user.js` which includes:
- Userscript metadata block
- Toast notification system
- Fetch-based scraping (no popups!)
- Staleness checking and auto-refresh
- Local storage management

## Credits

Created by Anthony Du

## License

See repository for license information.
