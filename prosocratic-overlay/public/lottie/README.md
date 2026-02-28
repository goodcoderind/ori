# Ori Lottie Animations

Place your Lottie JSON files here:

- `ori-sleep.json` — Eyes closed, slow breathing (idle state)
- `ori-noticing.json` — One eye slightly open (signal detected)
- `ori-awake.json` — Both eyes open, lean forward (nudge ready)
- `ori-sparkle.json` — Burst animation (insight moment)
- `ori-fatigue.json` — Soft yawn (fatigue detected)
- `ori-frustrated.json` — Ears flatten, steps back (frustration)

Until these are ready, the overlay uses SVG-based placeholder animations
defined in `src/overlay/components/OriAvatar.tsx`.

## How to create these

1. Design in After Effects or Figma + LottieFiles plugin
2. Export as Lottie JSON
3. Drop files here
4. Update OriAvatar.tsx to import and use `lottie-react`

## Animation specs (from User Journey Doc Section 7)

| State | Animation | Meaning |
|-------|-----------|---------|
| Idle / Student in flow | Eyes closed, slow breathing | "I'm here, nothing to surface right now" |
| Noticing | One eye slightly open | "Something may be worth flagging soon" |
| Has something | Both eyes open, slight lean forward, amber spark | "I have something when you're ready" |
| Insight detected | Sparkle burst, tail wag or equivalent | "That was a real understanding moment" |
| Fatigue detected | Soft yawn animation | "Your focus is dropping. Break?" |
| Student frustrated | Ears flatten, steps back | "Switching to direct explanation mode" |
| Farewell / independence | Stretches, opens fully, then settles peacefully | "The product worked" |
