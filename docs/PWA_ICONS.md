# FitDesk PWA Icon Setup

## Current Status

- ✅ **Approved master artwork** committed at `design-assets/fitdesk/fitdesk-icon-master.png`
- ✅ **manifest.json** wired with icon references and `start_url: "/dashboard"`
- ✅ **layout.tsx** wired with manifest link and Apple touch icon metadata
- ✅ **icon-192.png** — 192×192 production export
- ✅ **icon-512.png** — 512×512 production export
- ✅ **icon-512-maskable.png** — 512×512 maskable production export
- ✅ **apple-touch-icon.png** — 180×180 Apple home-screen production export

All runtime icons are **final approved production assets**, not placeholders.

---

## Approved Master Artwork

```
design-assets/fitdesk/fitdesk-icon-master.png
```

- **Dimensions:** 1254×1254 px (square)
- **Format:** RGB PNG, full-bleed background, no transparency
- **Design:** FitDesk blue background, centered white dashboard card, blue barbell,
  green success badge — FitDesk Coach Schedule icon
- **Status:** User-approved final brand asset

Do not replace the master artwork without explicit product/brand approval.

---

## Generated Runtime Outputs

| File | Size | Use |
|---|---|---|
| `public/icon-192.png` | 192×192 | Android / PWA standard icon |
| `public/icon-512.png` | 512×512 | Standard PWA application icon |
| `public/icon-512-maskable.png` | 512×512 | Android adaptive / maskable icon |
| `public/apple-touch-icon.png` | 180×180 | iOS home-screen icon |

---

## Regenerating Icons

If the approved master artwork is updated, regenerate runtime outputs by running:

```bash
node scripts/generate-pwa-icons.mjs
```

This script:
- Validates the master PNG at `design-assets/fitdesk/fitdesk-icon-master.png`
- Resizes using PowerShell System.Drawing (built-in .NET — no npm dependency)
- Applies high-quality bicubic interpolation
- Verifies output dimensions after generation

The script will fail with a clear error if the master file is missing or invalid.

---

## No Service Worker / Offline Caching

FitDesk does not currently include a service worker or offline caching.
PWA installability is provided through the manifest and metadata wiring only.
Offline support is a separate future workstream requiring explicit approval.

---

## Manifest Configuration

```json
{
  "start_url": "/dashboard",
  "display":   "standalone",
  "theme_color":      "#1A73E8",
  "background_color": "#FFFFFF"
}
```

`start_url` is `/dashboard` so an installed PWA launch routes directly to the
trainer dashboard rather than the root redirect.
