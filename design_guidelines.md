# Design Guidelines: Real-Time Audio Sharing App

## Design Approach
**System Selected:** Material Design with modern minimalist influences
**Rationale:** Utility-focused real-time communication tool requiring clear status indicators, intuitive controls, and instant visual feedback. Drawing inspiration from Discord, Zoom, and Linear for clean communication interfaces.

## Core Design Elements

### Typography
- **Primary Font:** Inter (Google Fonts)
- **Headings:** Font weight 700, sizes: text-4xl (hero), text-2xl (section titles), text-xl (cards)
- **Body Text:** Font weight 400, text-base for standard content, text-sm for secondary info
- **Room ID Display:** Monospace font (JetBrains Mono), font weight 600, text-3xl for emphasis
- **Status Text:** Font weight 500, text-sm with uppercase tracking

### Layout System
**Spacing Units:** Tailwind 4, 6, 8, 12, 16, 24 (p-4, p-6, p-8, etc.)
- Primary padding: p-8 for cards, p-6 for buttons
- Section spacing: py-16 for vertical rhythm
- Component gaps: gap-6 between major elements, gap-4 within groups

### Page Structure

**Landing Page:**
- Centered layout with max-w-4xl container
- Hero section with app title (text-5xl font-bold) and tagline (text-xl)
- Two prominent action cards side-by-side (grid-cols-1 md:grid-cols-2)
- Each card: p-12, rounded-2xl, shadow-xl with icon (96px), title, description, and large button

**Host Room Interface:**
- Full-height layout with centered content max-w-2xl
- Room ID prominently displayed in bordered card (p-8, rounded-xl)
- Copy button with icon positioned inline with room ID
- Status indicator row showing "Broadcasting" with animated pulse dot
- Participant count with user icon
- Audio waveform visualization area (h-32)
- Stop/Leave controls at bottom

**Join Room Interface:**
- Centered card layout max-w-md
- Large input field for room ID (h-16, text-center, text-2xl, rounded-xl)
- Join button spans full width (h-14)
- Connection status with loading spinner during join attempt
- Error messages displayed below input with alert styling

### Component Library

**Buttons:**
- Primary: h-14, px-8, rounded-xl, font-semibold, text-lg
- Secondary: h-12, px-6, rounded-lg, font-medium
- Icon buttons: Square aspect ratio (w-12 h-12), rounded-lg

**Cards:**
- Main cards: p-8 to p-12, rounded-2xl, shadow-lg
- Info cards: p-6, rounded-xl, border treatment
- Status cards: p-4, rounded-lg, inline-flex layout

**Inputs:**
- Text input: h-14, px-6, rounded-xl, border-2, text-lg
- Room ID input: Centered text, monospace font, letter-spacing tracking-widest

**Status Indicators:**
- Live indicator: Flex row with animated dot (w-3 h-3, rounded-full) + text
- Participant count: Icon + number, inline-flex gap-2
- Connection status: Badge style (px-4 py-2, rounded-full, text-sm font-medium)

### Icons
**Library:** Heroicons (via CDN)
- Host icon: Microphone/radio wave
- Join icon: Login/arrow right
- Copy icon: Clipboard/document duplicate
- Users icon: User group
- Audio icon: Volume/speaker
- Status icon: Circle dot for live indicator

### Interactive States
- Button hover: Subtle scale transform (hover:scale-105 transition-transform)
- Input focus: Border emphasis and subtle shadow
- Card hover on landing: Lift effect (hover:-translate-y-1 transition-transform)
- Copy success: Brief checkmark animation replacing copy icon

### Visual Hierarchy
**Landing Page:**
1. App title and tagline (centered, max-w-2xl)
2. Two equal-weight action cards below
3. Minimal footer with app description

**Active Room:**
1. Room ID (largest, most prominent)
2. Status indicators (medium emphasis)
3. Audio visualization (visual anchor)
4. Controls (accessible but secondary)

### Animations
- Pulse animation on live indicator dot (animate-pulse)
- Smooth transitions on hover states (transition-all duration-200)
- Loading spinner during connection (animate-spin)
- No unnecessary scroll or page transitions

### Accessibility
- High contrast text throughout
- Minimum 44px touch targets for buttons
- Clear focus indicators on all interactive elements
- ARIA labels for status indicators ("Live", "Connected", etc.)
- Screen reader friendly room ID announcements

### Images
**No hero image required** - This is a utility app focused on functionality. Use icon-based visual hierarchy instead of photography.