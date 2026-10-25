# Optional Firefox tab-strip styling

Firefox can load `userChrome.css` from a browser profile, unlike Chromium extensions. Copy `userChrome.css` into the profile's `chrome` directory, enable `toolkit.legacyUserProfileCustomizations.stylesheets` in `about:config`, and restart Firefox.

This file adds a native tab-strip dot: green for the selected or pinned tab and amber for other tabs. Firefox profile CSS cannot read the extension's domain whitelist or adaptive score, so the per-domain red/orange/green status remains in the Tabmind popup.

The Chrome/Brave build is in `versions/v1.5.0`; Firefox uses the compatible build in `versions/v1.5.0-firefox`. Load the Firefox build's `manifest.json` through `about:debugging`.
