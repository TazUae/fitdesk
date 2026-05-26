# FitDesk PWA Icon Setup

## Current Status

- ✅ **manifest.json** created with icon references
- ✅ **layout.tsx** wired with manifest links
- ✅ **icon.svg** created as design template
- ⏳ **PNG icons** need to be generated from mockup designs

## Icon Requirements

The PWA requires icons in these formats:

```
public/
├── icon-192.png          (192×192 for manifest)
├── icon-512.png          (512×512 for manifest)
├── icon-512-maskable.png (512×512 for adaptive icons on Android)
└── apple-touch-icon.png  (180×180 for iOS home screen)
```

## Design Source

The `public/icon.svg` file contains the icon design template (minimalist fitness tracking theme with blue background, white card, dumbbells, progress indicator, and green checkmark).

However, the user provided custom mockup designs that should be used instead of the generic template.

## Processing Your Mockup Designs

If you have custom fitness icon mockup PNG files (as provided in the design phase), process them using one of these methods:

### Option 1: Online Tool (Easiest)

1. Visit https://ezgif.com/
2. Upload your mockup image
3. Resize to each required size:
   - 192×192 → save as `icon-192.png`
   - 512×512 → save as `icon-512.png`
   - 512×512 → save as `icon-512-maskable.png`
   - 180×180 → save as `apple-touch-icon.png`
4. Place all PNG files in the `public/` directory

### Option 2: ImageMagick (Command Line)

If ImageMagick is properly installed on your system:

```bash
cd FitDesk
node scripts/generate-pwa-icons.mjs
```

(Note: This currently requires fixing the ImageMagick command for your Windows environment.)

### Option 3: Python Imaging

If Python 3 and PIL are installed:

```bash
cd FitDesk
python3 scripts/generate_icons.py source_image.png
```

### Option 4: Figma / Design Tool Export

If your mockup is in Figma or a similar tool:

1. Select the artboard/frame
2. Export at 512×512 to PNG → `icon-512.png`
3. Create layers and export at other sizes:
   - 192×192 → `icon-192.png`
   - 180×180 → `apple-touch-icon.png`
   - 512×512 with safe zone padding → `icon-512-maskable.png`

## Maskable Icons (Android)

The `icon-512-maskable.png` file should have the critical design content in the center 80% of the canvas, as the OS will mask the edges to various shapes (circles, rounded squares, etc.).

**Safe zone**: Content should fit within a circle of radius 38% of the canvas width, centered.

## Testing

Once icons are in place, test the PWA installability:

1. Open FitDesk in a modern browser (Chrome, Edge, Firefox on desktop; Chrome/Samsung Internet on Android)
2. The browser should show an "Install" prompt or option in the address bar
3. On iOS Safari, use "Add to Home Screen"
4. Verify the correct icon appears on the home screen

## Verification Checklist

- [ ] `public/icon-192.png` exists
- [ ] `public/icon-512.png` exists
- [ ] `public/icon-512-maskable.png` exists
- [ ] `public/apple-touch-icon.png` exists
- [ ] All icons are valid PNG files
- [ ] No build errors when running `npm run build:verify`
- [ ] PWA install prompt appears in browser
- [ ] Icon displays correctly when installed

## See Also

- [Web App Manifest Spec](https://www.w3.org/TR/appmanifest/)
- [MDN: Web App Manifests](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [Maskable Icons](https://maskable.app/)
