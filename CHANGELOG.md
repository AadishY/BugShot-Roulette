# Changelog

All notable changes to this project will be documented in this file.

## [2.1.2] - 2026-06-20

### Changed
- **Upgraded Jackpot Slot Machine 3D Model**: Replaced the flat canvas texture slot machine with a detailed 3D model featuring three separate horizontal cylinders, golden chrome wings/borders, and vertical divider bars.
- **Improved Staggered Spinning Animation**: Reels now spin with proper mechanical-like physics, stopping sequentially (Left reel at 1.8s, Center at 2.15s, Right at 2.5s) and decelerating smoothly to their target symbols using a trigonometric ease-out curve.
- **Adjusted Jackpot Outcomes Probability**: Tuned outcome chances to 20% Jackpot Win (7-7-7 reel match), 30% Normal Win (Cherry-Cherry-Lemon match), and 50% Lose (Apple-Lemon-Bell match).

## [2.1.0] - 2026-06-20

### Fixed
- Corrected audio directory lookup pathways for `slotmachine.mp3`, `jackpot.mp3`, and `jackpotloop.mp3` animation sound elements to properly stream.
- Resolved item inventory icon display bug. Registered dynamic dynamic case-insensitive key bindings so the dynamic item mapping correctly resolves the Jackpot Coins icon in the player drawer, loot modal, and game overview cards.
- **Dealer & Player Blank Shot Exemption**: Firing a blank shell shot at the player (either self-shot or dealer-shot) will no longer count against the player's Jackpot immunity shots. Only live shots (which do damage) and Blood Contract sacrifice will decrement the player's immunity.
- **Round Reload Audio Sync**: The Jackpot looping music will now persist across round transitions (shotgun reloads) if the player still has remaining immunity shots, rather than stopping abruptly when `startRound` is called.

### Added
- **Performance Detector**: Added real-time FPS monitoring in the WebGL canvas loop. Triggers a styled CRT performance warning modal if frame rate falls below 30 FPS, letting the user dynamically toggle settings to Balanced or Potato graphics profiles.
- **Blood Contract Integration**: Using a Blood Contract while Jackpot immunity is active will sacrifice 1 Jackpot immunity shot instead of depleting 1 HP. This will trigger the red flash and green heal RCT animation sequence.
- **Dynamic Background Music Dimming**: Game synthesis music automatically scales down to 35% during standard item interaction playback.
- **Deep Loop Dimming**: Music dims down to 5% (almost fully muted) when the Jackpot immunity background loop is streaming, restoring cleanly when immunity is exhausted.
- **Reorganized Debug Control tab**: Renamed the 'Tarot' section in developer overlay panel to 'Item Power', moving the Jackpot outcome override button selectors there.

### Changed
- **Loot Drop Rarity Re-balancing**:
  - *Normal Mode*: Set Totem of Undying to 1.0% and Jackpot Slot Machine to 2.0%, positioning Jackpot as a rare item just above Totem.
  - *Hard Mode*: Set both Totem of Undying and Jackpot Slot Machine to 1.0%, making them equal rarity drop rules.
  - Decreased Cigarettes drop rate in Normal Mode from 10% to 9% and Tarot Deck Card from 4% to 3% to preserve 100% sum boundaries.
  - Increased Cigarettes drop rate in Hard Mode from 3% to 4% to balance the 1% decrease in Jackpot drop rate.
