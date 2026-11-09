---
name: Anya Kasuri
description: Inter, black on white, with contextual organisation previews.
colors:
  black: "#000000"
  white: "#ffffff"
typography:
  introduction:
    fontFamily: '"Inter Variable", sans-serif'
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.625
  introduction-sm:
    fontFamily: '"Inter Variable", sans-serif'
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.625
  preview:
    fontFamily: '"Inter Variable", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  preview-title:
    fontFamily: '"Inter Variable", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  square: "0px"
spacing:
  "1": "0.25rem"
  "3": "0.75rem"
  "4": "1rem"
  "6": "1.5rem"
  "16": "4rem"
components:
  preview-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.black}"
    typography: "{typography.preview}"
    rounded: "{rounded.square}"
    padding: "{spacing.4}"
    width: "18rem"
---

# Design System: Anya Kasuri

## Overview

The implemented system uses regular Inter, generous white space, and black text. Organisation links reveal compact, factual previews. The home composition and scope remain in `.impeccable/surfaces/src-pages-index-astro.md`.

## Colors

Black supplies text, underlines, borders, and focus outlines; white supplies the page and preview surfaces. Selection reverses these roles (`selection:bg-black selection:text-white`). Colour within local organisation imagery is retained, not reused as interface accents.

## Typography

Inter Variable is locally bundled; `font-sans` is defined in `src/styles/global.css`. The introduction uses `text-xl leading-relaxed sm:text-2xl`: 20px/32.5px below `sm`, 24px/39px from `sm`. Preview text uses `text-sm leading-normal` (14px/21px); only its title uses `font-medium`. These pixel equivalents assume the default 16px root.

## Layout

The current home centres its paragraph in both axes using `flex min-h-svh items-center justify-center`. `px-6 py-16 sm:px-[15vw] lg:px-[30vw]` gives 24px mobile gutters and 64px vertical padding, then 15vw gutters from 640px and 30vw from 1024px. The desktop content measure is therefore 40vw. The paragraph is `text-center`; previews are `text-left`.

## Elevation & Depth

Preview overlays use `z-10`, an opaque surface, and a border, with no shadow or animated transition.

## Shapes

Preview cards are square with `border border-black` (1px). Images use `object-contain`, retaining their full composition rather than cropping.

## Components

`PreviewLink.astro` renders a normal external anchor, not a button or modal. Its persistent dotted underline uses `underline decoration-dotted decoration-1 underline-offset-4`. Keyboard focus adds `focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-black`.

The initially invisible `role="tooltip"` wrapper becomes visible through `data-open`. Its card uses the frontmatter's preview-card tokens, with `max-w-[calc(100vw-3rem)]`. Local TVM and Post-Credits images are converted by Astro to WebP at width 512; their displayed boxes use `mb-3 h-40 w-full object-contain` (12px bottom gap, 160px height). MWS has no image. Each card contains a medium-weight title and one descriptive sentence separated by `mt-1` (4px). The anchor's `aria-describedby` references that sentence; the page also has an `sr-only` heading.

The wrapper is viewport-bottom-fixed by default (`fixed bottom-6 left-1/2 -translate-x-1/2 pb-3`): 24px bottom offset plus 12px transparent bottom padding. Only **width ≥1024px AND height ≥700px** switches it to `absolute bottom-full` above its relative link wrapper; horizontal centring is retained.

Non-touch pointer entry opens one preview unless keyboard-visible focus is active. Focus entering a link opens its preview and closes others; leaving its wrapper closes it. Pointer movement retains an unfocused preview inside the axis-aligned safe corridor spanning the link and tooltip rectangles, including their gap; leaving it closes the preview without a timer. A focused preview remains open during pointer movement. Escape closes all previews. Touch pointer events do not open or dismiss previews; normal link navigation is preserved.
