# Mantic Writer

A device for writing ideograms from a set of characters.

## Hardware

A raspberry pi running chromium in kiosk mode loads index.html from a localserver on boot. Connected via USB is a Raspberry Pi Nano running  mantic_touch.ino.

The Nano shows up on the Pi as a USB MIDI device it's conductive pins connect to a tactile interface that can be "played". Any USB MIDI keyboard also works as a stand-in.

## Part 1: Nano ESP32

### Nano parts

- Arduino Nano ESP32 (ABX00083) and a USB-C **data** cable
- Up to 14 pads, each with its own wire (see [Connecting objects](#connecting-objects))
- Optional: a 10 kΩ linear potentiometer ("B10K") and knob, for variations
- Optional: two momentary push buttons, for a random figure and for attract mode

### Wiring

| Nano pin | Connect to | Sends |
| --- | --- | --- |
| A0–A7 | Pads 0–7 | Notes 48–55 |
| D2–D7 | Pads 8–13 | Notes 56–61 |
| D8 | Push button, other leg to GND | CC 64 (attract mode on/off) |
| D10 | Push button, other leg to GND | CC 65 (random figure) |
| D9 | Potentiometer middle leg (wiper) | CC 1 (variation) |
| 3V3 | Potentiometer outer leg | |
| GND | Potentiometer other outer leg, buttons | |

Only these 14 pins can sense touch (the ESP32-S3's touch channels, GPIO1–14). Check pins against the datasheet in `journal/` before soldering. With the USB-C socket at the top and components facing you, the left header runs D13, 3V3, B0, **A0–A7**, VBUS, B1, GND, VIN; the right runs D12, D11, D10, **D9**, **D8**, **D7–D2**, GND, RST, D0, D1.

> **Power the potentiometer from 3V3, not VBUS or VIN.** The pins are 3.3 V only; 5 V on D9 can damage the board.

Pads need no resistors. The Nano calibrates each pad at power-up, so keep hands off them for the first second.

To check the Nano: the blue LED blinks on each touch, and the Nano appears in *Audio MIDI Setup → MIDI Studio* on a Mac, or in `amidi -l` on the Pi.

### Tune sensitivity

1. In the Arduino IDE, set `#define DEBUG 1` in the firmware and upload.
2. Open **Serial Monitor** at 115200 baud. Each line shows all 14 raw pad values (`*` = touched) and the knob (0–127).
3. A pad counts as touched above `baseline × TOUCH_RATIO` (1.30) and released below `baseline × RELEASE_RATIO` (1.15). Lower the ratios if touches are missed; raise them if pads trigger on their own.
4. Set `DEBUG` back to `0` and upload.

Other settings at the top of the firmware: `BASE_NOTE`, `MIDI_CHANNEL`, `DEBOUNCE_MS`, and `ATTRACT_CC`, `POT_CC`, `RANDOM_CC`, which must match `ATTRACT_TOGGLE_CC`, `VARIATION_CC` and `RANDOM_CC` in `input.js`. **Without a potentiometer, set `USE_POT` to `0`**, or the floating D9 pin changes the variation at random.

---

### Connecting objects

- **One wire per pad**: solder, alligator clip, ring terminal or crimp. Copper tape's adhesive doesn't conduct, so solder to the tape or fold the wire under it.
- **Keep pad wires short** (under 50 cm): the wire is part of the pad. Put the Nano near the pads and run a long USB cable to the Pi instead (up to ~3 m, or an active extension).
- **Keep pad wires apart**: no bundles or ribbon cable, a finger's width or more between them, and away from mains and the Pi's power supply.
- **Pads must not touch each other** or grounded metal (table frames, radiators, lamps). Stand metal objects on wood, cloth or rubber.
- **Similar-sized pads behave alike.** Check any much larger pad in the debug output.
- **Strain-relieve the wires** at the Nano; visitors will tug on objects.
- Unused pad pins can be left unconnected. The pads carry only a tiny low-voltage signal and are safe to touch.

### Knob and buttons

- Mount the pot through a panel (usually a 7 mm hole) with a pointer knob. If it turns the wrong way, swap the outer legs.
- Use a smooth (non-clicking) pot. Its turn is split into 8 equal zones (about 34° each on a 270° pot), with a little stickiness at the boundaries so a knob resting on a line doesn't flicker. Fully counter-clockwise is zone 0, the plain chord figure. A printed dial with the zones marked helps visitors find figures again.
- The random button is for visitors ("ask without a question"); a large arcade button works well. The attract-mode button is for the operator, so hide it.

### Before opening

1. Fix every object in place, then replug the Nano so it calibrates (hands off for a second). Do this again whenever objects move.
2. Check each pad with `DEBUG` on, in the room, with lights and equipment running, then turn `DEBUG` off.
3. Test with several people. Dry hands and thick-soled shoes read weaker; lower `TOUCH_RATIO` if touches are missed.

---

## Part 2: Raspberry Pi 5 (display)

### Pi parts

- Raspberry Pi 5, power supply, microSD card (16 GB+)
- Micro-HDMI cable, screen or projector, speakers (HDMI audio or USB audio)
- A USB keyboard for setup and saving figures

### 1. Install the OS

1. Write **Raspberry Pi OS (64-bit), with desktop** with [Raspberry Pi Imager](https://www.raspberrypi.com/software/), setting a username, password, and Wi-Fi/SSH if wanted.
2. In `sudo raspi-config`, set **System Options → Boot / Auto Login → Desktop Autologin** and **Display Options → Screen Blanking → No**.
3. Pick the audio output by right-clicking the volume icon (e.g. HDMI).

### 2. Copy the sketch

Clone or copy this folder to `~/mantic-writer`, so that `~/mantic-writer/index.html` exists.

### 3. Serve it locally

Web MIDI needs `localhost` or https, so the sketch must be served. `serve.py` is a small server that disables caching, so new files take effect on the next reload. Create `~/.config/systemd/user/mantic-server.service`:

```ini
[Unit]
Description=Mantic Writer local web server

[Service]
WorkingDirectory=%h/mantic-writer
ExecStart=/usr/bin/python3 %h/mantic-writer/serve.py 8000
Restart=always

[Install]
WantedBy=default.target
```

```sh
systemctl --user enable --now mantic-server
sudo loginctl enable-linger $USER
curl -s localhost:8000 | head -3   # should print the start of index.html
```

After editing the service file: `systemctl --user daemon-reload && systemctl --user restart mantic-server`.

### 4. Grant MIDI permission (once)

With the Nano plugged in, open Chromium normally, go to `http://localhost:8000`, click **Allow** for MIDI devices, then close Chromium.

### 5. Launch full-screen at login

Add this line to `~/.config/labwc/autostart` (create it if needed):

```sh
chromium --kiosk --noerrdialogs --disable-infobars --password-store=basic --autoplay-policy=no-user-gesture-required http://localhost:8000 &
```

- Older images call the browser `chromium-browser` (`which chromium chromium-browser`), and Wayfire-based ones take the command under `[autostart]` in `~/.config/wayfire.ini`.
- `--autoplay-policy=…` lets sound play without a click.
- `--password-store=basic` avoids an "Unlock Default Keyring" prompt on every boot.

Reboot: the sketch comes up full-screen after its title screen. **Alt-F4** leaves kiosk mode.

---

## Using the installation

| Input | Action |
| --- | --- |
| Touch a chord of pads, then release all | Show that chord's figure (order doesn't matter) |
| Random button (D10), Space, Enter or click | A random figure |
| Turn the knob | Choose one of 8 variations. A slider along the bottom shows the knob position while turning (hidden 3 s after it stops); the figure on screen redraws once the knob stops |
| Ctrl/Cmd-S | Save the figure on screen |
| Ctrl/Cmd-Backspace | Remove the figure on screen from the saved list |
| Ctrl/Cmd-E | Download the saved list as JSON |
| Drag a JSON file onto the window | Import a saved list (merged with the current one) |
| **A** key or attract button (D8) | Toggle attract mode |
| **Q** key | A random figure that quickens (for testing) |
| **+** / **-** keys | Bigger or smaller tiles (1x, 2x, 3x…), remembered across restarts |

**Variations**: the knob's zone is part of the seed. Zone 0 gives the plain chord seed (`48.50.53`), so older saved figures still match; other zones add a suffix (`48.50.53~3`). Changing `VARIATIONS` in `input.js` changes every zone except 0.

**Daily figures**: the date is part of the seed (`48.50.53~3@2026-11-18`), so figures change at midnight by the Pi's clock. Saved seeds keep their date and come back exactly. Pre-made arrangements show every day. Set `DAILY_SEEDS` in `input.js` to `false` to turn this off. Without a network, the Pi only keeps time across power-offs if its RTC battery is fitted.

**Quickening**: about 1 in 100 figures come alive for 30 seconds, growing, churning and withering back while their title glitches, then settling. Which figures quicken is part of the seed, so it replays the same way. Settings are at the top of `quicken.js`.

**Pre-made arrangements**: pad 0 alone shows *royalty*, pad 1 *ramparts*, pad 2 *the pit*, titled by file name. The knob still changes their colour, inversion and sound. To add one, draw a map in Tiled with `assets/spritesheets/libuse40x30-cp437.png` (40×30 tiles, 23 columns), save it as `.tmj` in `assets/tilemaps/`, and add its chord to `TILEMAP_CHORDS` in `tilemaps.js` (sorted notes joined by dots: pads 0 and 3 are `'48.51'`). Flipped tiles work; rotated tiles are drawn unrotated.

**Attract mode** cycles through saved figures every 12 seconds, starts by itself after 3 minutes without input (if anything is saved), and stops on any touch. Timings are in `archive.js`; set `ATTRACT_ENABLED` to `false` there to turn attract mode off completely.

**Saved figures** live in the browser's local storage, which survives reboots but is per-browser. To move figures from a Mac, export with Cmd-E and drag the file onto the sketch on the Pi. Export a backup before the show.

## Developing on a Mac

Run `python3 -m http.server 8000` in this folder and open `http://localhost:8000` in **Chrome** (Safari has no Web MIDI). Click once so audio can start. A USB MIDI keyboard's mod wheel (CC 1) works as the knob. Seeds are logged to the console, and `initializeSketch('48.50.53~3')` draws a specific figure.
