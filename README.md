# Seen · test booth web app

Five pages that run the same Seen scenario at the same moment:

| Page | Device | What it shows |
|---|---|---|
| `control.html` | Facilitator laptop | Wizard console: pick a scenario, start/pause, force a Seen level, conditions, live previews of every screen |
| `windscreen.html` | Big monitor | The street ahead (3D) |
| `dashboard.html` | Monitor or iPad under the windscreen | The Seen instrument cluster, full screen. Plays the Seen sounds |
| `mirror.html?side=L` / `?side=R` | iPads in the mirror housings | Live side mirror with the Seen cue |
| `index.html` | Any | Links to all of the above for a room |

All pages use the same **room** name (`?room=booth` by default). Every screen in a room follows the console.

## How the sync works
The console writes a small session (scenario, start time, pause, forced levels, conditions) to Firebase.
Each screen runs the same simulation from that start time, so they stay in step without streaming video.
Forced levels are stored with the moment they were pressed, so a screen that joins late still shows the same thing.

Without Firebase (`js/config.js` left as `null`) the pages sync only between tabs/windows **on one computer** — handy for rehearsing.

## 1 · Firebase (once, ~10 minutes)
1. Go to https://console.firebase.google.com → **Add project** (Google Analytics not needed).
2. **Build → Realtime Database → Create database**. Pick a location in Europe. Start in **test mode**.
3. **Project settings (gear) → General → Your apps → Web (</>)**. Register an app (no hosting). Copy the `firebaseConfig` object.
4. Paste it into `js/config.js` as `window.SEEN_FIREBASE = { … }`. Make sure it contains `databaseURL`.
5. Test-mode rules expire after 30 days. For the exhibition, use these rules (Realtime Database → Rules) so only the `rooms` data is writable:
   ```json
   { "rules": { "rooms": { "$room": { ".read": true, ".write": true } } } }
   ```
   Anyone with the link could change a room, so use a room name that isn't easy to guess (e.g. `seen-g07-x4`).

## 2 · Publish on GitHub Pages
1. Create a public repository and upload the whole folder (keep the structure).
2. **Settings → Pages → Build and deployment → Deploy from a branch → main / (root)**.
3. After a minute the site is at `https://<user>.github.io/<repo>/`. Open `control.html` there.

## 3 · On the day
1. Laptop: open `control.html?room=<room>`. Check the connection chip says **Synced online**.
2. Each device: open its link (the console's **Screen links** card has copy buttons), tap **Tap to start** (goes full screen, keeps the screen awake, and on the dashboard allows sound).
3. The chips at the top of the console turn green as screens join.
4. Pick a scenario → **Start**. Keys: `Space` start/pause, `R` restart, `0`–`4` force a level, `A` automatic.
5. Double-tap a screen to see its status badge again.

Tips: plug the iPads in, turn off auto-lock, and use Guided Access so the browser bar can't be swiped open.

## Participant driving (USB wheel + pedals)

1. Plug the wheel and pedals into the **windscreen computer** (the one driving the big monitor). Use Chrome or Edge.
2. Open the windscreen link, press a pedal once so the browser sees the wheel, then click **Set up wheel + pedals** (or press Shift+W). Follow the five steps (turn LEFT first on the steering step; feet off the pedals for the indicator steps). The setup is saved in that browser.
3. In the wizard console, choose **Driving → Participant drives (wheel)**. The drive starts when the participant presses the accelerator.

How it works:
- The participant drives an endless grid of one-way avenues: passing lane (cars overtake here), their lane, bike lane, parked cars (all black). A cross street every 110 m. The street starts empty so they can get used to the wheel; add road users when they're ready. The scenario panel is hidden in this mode.
- The car keeps its lane. Turning the wheel in the last ~20 m before a cross street commits a left or right turn; the pedals still control speed. Indicators: the wheel buttons chosen in setup (keyboard: Q / E).
- After each turn (or each block driven straight) the world re-centres on the car, so the city never ends.
- **Navigation · next turn** sets the arrow on the cluster.
- Cyclists: "Aware" is a subtle cue (dimmer, smaller) and only shows while a cyclist is close. Seen escalates to Caution when the driver indicates or turns toward a cross street whose path would cross the cyclist, and to Urgent once a committed turn is about to meet them.
- The windscreen computer runs the simulation and broadcasts the car about 15 times a second; keep its tab open and in front.
- The wheel's force feedback and the pedal "push back" can't be driven from a browser; Seen's pedal cue is simulated by weakening the accelerator.

## Adding road users during a run

The **Add road users** buttons place cyclists and pedestrians relative to the car, so they work in both scripted and participant runs:
in participant mode: cyclist from behind or slow ahead, in the bike lane (C) or between the two car lanes (V); in scripted mode: cyclist from behind on the left (C), slow cyclist ahead on the left, cyclist from behind on the right (V); pedestrian crossing from the right / left, random pedestrian (P), and a pedestrian at the next left / right corner, who starts crossing the side street when the car is about 24 m away.
