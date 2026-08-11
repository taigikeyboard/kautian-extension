# Implementation Plan

## Goal

Let users independently show or hide the random-word and random-proverb buttons beside 「搜尋」, with both enabled by default, and release the change as version 0.1.2.

## Stages

1. **Settings model** — Add persisted defaults for both random controls and cover them with a unit test. `completed`
2. **Options UI** — Add two switches and connect them to `chrome.storage.sync`. `completed`
3. **Content UI** — Apply the settings when mounting and whenever sync storage changes. `completed`
4. **Release metadata and verification** — Update all package/manifest versions to 0.1.2; run tests and build. `completed`

## Success Criteria

- Both random controls appear for new/existing users without stored values.
- Each settings-page switch independently hides or shows its corresponding control without reloading the dictionary page.
- Tests and production build pass.
- Manifest and npm package metadata report 0.1.2.
