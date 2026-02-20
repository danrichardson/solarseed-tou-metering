# Solarseed TOU Energy Metering — GUI Improvement Tasks

This document captures all identified issues and requested improvements for the TOU Energy Metering configuration panel. Use this as a task list when implementing changes.

------

## Bug Fixes

### 1. Energy Sensor Label Says "kWh" — Should Say "W"

The Energy Sensor row currently displays "kWh sensor" next to the entity selector, but the sensor (`sensor.vuetonia_123_1min`) is a **power (W) sensor**, not an energy sensor. Fix the label to accurately reflect the sensor type. Consider auto-detecting the unit from the sensor's `unit_of_measurement` attribute and displaying it dynamically.

### 2. "Solarseed" Title Should Link to Johnny Solarseed

The "Solarseed" text in the header ("Solarseed TOU Energy Metering") should be a clickable link that navigates to the Johnny Solarseed site. Style it so the link is discoverable but not distracting (e.g., subtle underline on hover).

------

## Rate Tier Defaults & Ordering

### 3. Default Rate Tiers Should Follow PGE Convention

When creating a new configuration or presenting defaults, use Portland General Electric's standard tier names and ordering:

| Order | Tier Name | Color  | Default Rate |
| ----- | --------- | ------ | ------------ |
| 1     | Off-Peak  | Green  | $0.1598/kWh  |
| 2     | Mid-Peak  | Orange | $0.2414/kWh  |
| 3     | Peak      | Red    | $0.5189/kWh  |

Current issue: The tiers are labeled "Off-Peak, Peak, Mid-Peak" which is out of order. Always present them in ascending cost order: Off-Peak → Mid-Peak → Peak.

### 4. Rate Labels Should Include Units

The Paint toolbar rate swatches show bare dollar amounts (e.g., "$0.1598") without units. Add `/kWh` to each rate label in the toolbar, matching the "Effective Rates" card format. Example: `$0.1598/kWh`

### 5. Effective Rates Card Style

Reference the "Effective Rates (All-In $/kWh)" card design for consistent rate display. Each tier shows its name, color-coded rate value, and a Copy button. Ensure the main config panel's rate display is consistent with this card's styling.

------

## Accessibility & Contrast

### 6. Grey-on-Dark-Grey Text Has Insufficient Contrast

Multiple UI elements use grey text on the dark background with **far too little contrast**. This fails WCAG AA standards. Specific offenders include:

- "kWh sensor" helper text
- "Select a season, click months to assign" instruction text
- "Click select · Double-click edit" instruction text
- Hour labels (00–23) on the grid
- Day labels (Mon–Sun) on the grid
- Holiday descriptions and dates

**Fix:** Increase text lightness to meet at least WCAG AA (4.5:1 contrast ratio for normal text, 3:1 for large text). Consider using `--secondary-text-color` from HA theme variables rather than hardcoded grey values.

### 7. TOU Grid Colors Need Colorblind-Safe Palette

The green/orange/red color scheme is problematic for red-green colorblind users (~8% of men). Options:

- **Option A:** Add subtle patterns or hatching to each rate zone (stripes, dots, crosshatch)
- **Option B:** Switch to a colorblind-safe palette (e.g., blue for off-peak, orange for mid-peak, dark red/magenta for peak)
- **Option C:** Add text labels or icons within grid cells on hover or as an optional overlay

Whichever approach is chosen, ensure the colors remain semantically meaningful (cheaper = cooler tones, expensive = warmer tones).

------

## Grid Improvements

### 8. Hour Labels — Add 12/24 Hour Toggle

The grid currently shows 24-hour time (00–23). Add a toggle to switch between:

- **24h format:** 00, 01, 02 ... 23
- **12h format:** 12a, 1a, 2a ... 11p

Persist the user's preference. Default could follow the HA user's time format setting if available.

### 9. Hour Label Alignment — Left-Justify to Start of Cell

Currently the hour labels appear centered or ambiguously positioned. **Left-justify** each hour label so it aligns with the **left edge** of its corresponding grid column. This makes it visually clear that "00" means the block starting at 00:00, not centered between 23:00 and 01:00.

------

## Layout & Information Architecture

### 10. Section Grouping Needs Clearer Visual Separation

The vertical stacking of Energy Sensor → Seasons → Paint Toolbar → Grid → Holidays runs together without clear boundaries. Add:

- Subtle card containers or divider lines between major sections
- Consistent padding/margins between groups
- Consider collapsible sections for Seasons and Holidays since they're "set and forget" for most users

### 11. "Configure" Button Is Easy to Miss

The Configure button floats far right in the Energy Sensor row and could be overlooked. Consider making it more prominent or moving it to a more discoverable location.

### 12. Paint Interaction Model Needs Better Discoverability

The "Click select · Double-click edit" instruction is not intuitive for first-time users. Improvements:

- Add a brief onboarding tooltip on first use
- Show an active mode indicator (e.g., "Painting: Off-Peak $0.1598/kWh") that's clearly visible
- Change the cursor when in paint mode
- The unlabeled "+" button should have a tooltip or label: "Add rate tier"

------

## Holidays Section

### 13. Holiday Layout Needs Restructuring

The current two-column layout has inconsistent alignment — holiday names and dates don't line up well. Options:

**Option A — 3-Column Grid:**

| Holiday         | Date            | Observed |
| --------------- | --------------- | -------- |
| New Year's Day  | January 1       | ✓        |
| MLK Jr. Day     | 3rd Mon in Jan  | ☐        |
| Presidents' Day | 3rd Mon in Feb  | ☐        |
| Memorial Day    | Last Mon in May | ✓        |

**Option B — Bigger, Clearer Cards:** Each holiday as a compact card/row with checkbox, name, and date all consistently aligned in a single scrollable list.

**Option C — Compact 3-Column Responsive Grid:** Three holiday items per row at desktop width, collapsing to 2 or 1 on narrow screens. Each item is a self-contained checkbox + name + date block.

Pick whichever approach provides the cleanest alignment and best use of horizontal space. The key issue is **consistent alignment of names and dates**.

------

## Month/Season Selector

### 14. Month Selection Affordances Are Unclear

All 12 month pills look identical in the "All Year" state. Users can't tell:

- Which months are assigned to which season
- What clicking a month will do
- How the "+ Season" button interacts with month selection

**Fix:** Add visual differentiation — dim unassigned months, use season colors on assigned months, and/or add a more prominent instruction. Consider drag-to-select for assigning month ranges to seasons.

------

## Priority Order (Suggested)

1. **Bug fix:** Energy sensor label (quick fix)
2. **Bug fix:** Solarseed link to JSS (quick fix)
3. **Contrast:** Grey text on dark background (accessibility, high impact)
4. **Rate ordering:** PGE defaults in correct order with units (usability)
5. **Grid:** Hour label alignment and 12/24 toggle (usability)
6. **Holidays:** Layout restructuring (visual polish)
7. **Colorblind palette:** Grid colors (accessibility)
8. **Paint UX:** Discoverability improvements (onboarding)
9. **Layout:** Section grouping and visual separation (polish)
10. **Seasons:** Month selector affordances (polish)