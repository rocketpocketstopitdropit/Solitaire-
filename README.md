# Solitaire

Klondike solitaire for Android (and any phone browser). Tap or drag cards, play Draw 1 or Draw 3, use hints and unlimited undo, and your game saves automatically.

When you run out of useful moves, the game tells you, and says whether the deal could have been won from the start. Then you choose: restart the same deal or take a new one.

## Install on Android

Open **https://github.com/rocketpocketstopitdropit/Solitaire-/releases/latest/download/Solitaire.apk** on your phone, then open the downloaded file and allow installs from your browser when asked. Later builds install over the top and keep your saved game and record.

There's also a web version at **https://rocketpocketstopitdropit.github.io/Solitaire-/**. In Chrome, use the menu → *Install app* (or *Add to Home screen* in Safari on iPhone). It works offline after the first visit.

## How "no more useful moves" works

- **Stuck check** (`src/solver.js`, `hasUsefulMove`): after every move, the game searches every sequence of moves you could make with the cards you can see. Cycling the stock, shuffling cards between columns and taking cards back off a foundation don't count. If no sequence puts a new card on a foundation, turns over a face-down card or plays a card out of the stock, you're stuck. It never peeks at face-down cards.
- **Was the deal winnable?** (`solve`): when a deal starts, a background worker solves it with every card visible, the way published studies measure winnability. Draw 3 with unlimited passes is winnable about 82% of the time. The answer stays hidden until you're stuck, so there are no spoilers. A few very complex deals can't be settled within the limit (about 4 minutes, or roughly 5.7 million positions), and the game says so.

## Project layout

- `src/game.html`, `src/solver.js`: the game and the solver.
- `tools/build.py`: builds `web/index.html` (the web app, also bundled into the Android app) and `dist/artifact.html`.
- `tools/icons.py`: draws the web app icons.
- `app/`: a small Android shell (Java, no libraries) that shows `web/` full screen.
- `test/`: `node test/verify.js` replays every solution the solver finds with a separate rules check. `node test/stuck.js` plays random games until they get stuck and confirms the solver agrees. `node test/quick.js 3 100` measures solve rates.

## Building

GitHub Actions builds the APK on every push (`.github/workflows/build.yml`) and publishes `web/` to GitHub Pages (`pages.yml`). Locally: `python3 tools/build.py`, then `./gradlew assembleDebug` with the Android SDK installed.
