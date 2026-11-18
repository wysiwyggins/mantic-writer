# Mantic Writer

A p5.js sketch that draws a divination figure from no known system: a cluster of
glyphs, a background colour, a sound, and a name. In the installation, visitors
touch a chord of copper pads. The set of pads touched becomes a **seed**, and the
same chord always produces the same figure, like a fixed lexicon. A knob picks
one of 8 variations of each chord, so every chord has a family of related
figures.

```text
copper pads → Arduino Nano ESP32 ──USB-C (MIDI)──▶ Raspberry Pi 5 ──HDMI──▶ screen / projector + speakers
                (firmware/)                         Chromium kiosk running this sketch
```

The Nano plugs into the Pi over USB and shows up as a MIDI device,
sending one note per pad. No GPIO wiring is needed between the two boards. Any
USB MIDI keyboard will also as a stand-in for the Nano.

## Contents

| Path | What it is |
| --- | --- |
| `index.html`, `sketch.js` | The sketch. `initializeSketch(seed)` builds a figure from a seed |
| `input.js` | Web MIDI input: turns a chord (notes touched, then all released) into a seed |
| `archive.js` | Saving seeds, import/export, attract mode |
| `tilemaps.js`, `assets/tilemaps/` | Pre-made arrangements (Tiled `.tmj` maps) and the chords that show them |
| `nameGenerator.js`, `assets/corpora/` | Tracery grammar and word lists for figure names |
| `firmware/mantic_touch/` | Arduino sketch for the Nano ESP32 touch pads |
| `journal/` | Notes, plus the Nano ESP32 datasheet (`ABX00083-datasheet.pdf`) |

---

## Part 1: Nano ESP32 (touch pads)

### Nano parts

- Arduino Nano ESP32 (ABX00083)
- USB-C data cable (not a charge-only cable)
- Up to 14 pads: copper tape, foil, or any metal object, each with its own wire
  (see [Building the installation](#building-the-installation))
- Optional: a 10 kΩ linear potentiometer (marked "B10K") and a knob, for variations
- Optional: two momentary push buttons, one for a random figure and one for attract mode

### Wiring

| Nano pin | Connect to | Sends |
|---|---|---|
| A0–A7 | Pads 0–7 | Notes 48–55 |
| D2–D7 | Pads 8–13 | Notes 56–61 |
| D8 | Push button, other leg to GND | CC 64 (attract mode on/off) |
| D10 | Push button, other leg to GND | CC 65 (random figure) |
| D9 | Potentiometer middle leg (wiper) | CC 1 (variation) |
| 3V3 | Potentiometer outer leg | |
| GND | Potentiometer other outer leg, buttons | |

Pad *n* sends MIDI note `48 + n`. Only these 14 pins can sense touch: they're
the ESP32-S3's touch channels (GPIO1–14). The other pins (D10–D13, D0, D1) can't
be used as pads. Confirm pins against the pinout pages of the datasheet in
`journal/` before soldering.

On the board, with the USB-C socket at the top and the components facing you,
the left header runs D13, 3V3, B0, **A0–A7**, VBUS, B1, GND, VIN, and the right
header runs D12, D11, D10, **D9**, **D8**, **D7–D2**, GND, RST, D0, D1. The
labels are printed on the board as well.

> **Use 3V3, not VBUS or VIN, for the potentiometer.** The Nano ESP32's pins
> are 3.3 V only, and 5 V on D9 can damage the board.

Tips for reliable touch:

- Keep pad wires short and apart from each other. Long or bundled wires pick up
  false touches.

- Pads don't need resistors or any other parts.
- The Nano calibrates each pad when it powers up, so keep hands off the pads for
  the first second after plugging it in.

### Install the toolchain

1. Install [Arduino IDE 2](https://www.arduino.cc/en/software).
2. **Settings → Additional boards manager URLs**, add:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. **Boards Manager**: search "esp32", install **esp32 by Espressif Systems,
   version 3.x**. (Arduino's own "Arduino ESP32 Boards" package is older and
   lacks the `USBMIDI` library this firmware uses.)
4. **Tools → Board → esp32 → Arduino Nano ESP32**.
5. Leave **Tools → Pin Numbering** at "By Arduino pin (default)". If **Tools → USB Mode** is shown, set it to **USB-OTG (TinyUSB)**.

### Flash the firmware

1. Open `firmware/mantic_touch/mantic_touch.ino`.
2. Plug in the Nano, choose its port under **Tools → Port**, and click **Upload**.
3. If the upload fails or the port disappears (common once the board is running
   as a MIDI device), **double-tap the reset button**. The RGB LED pulses green
   (bootloader mode), and the port reappears. Upload again.

### Check it works

- The blue LED on the Nano blinks on each touch.
- **Mac:** open *Audio MIDI Setup → Window → Show MIDI Studio*. The Nano appears
  as a MIDI device.

- **Raspberry Pi:** `amidi -l` lists it.

### Tune sensitivity

Touch strength depends on pad size, wire length and the room.

1. Set `#define DEBUG 1` at the top of the firmware and upload.
2. Open **Tools → Serial Monitor** at 115200 baud. Each line shows the raw value
   for all 14 pads; a `*` marks pads currently read as touched. The last number
   is the knob (0–127).
3. Compare untouched and touched values. A pad counts as touched above
   `baseline × TOUCH_RATIO` (default 1.30) and as released below
   `baseline × RELEASE_RATIO` (default 1.15). Lower the ratios if touches are
   missed; raise them if pads trigger on their own.
4. Set `DEBUG` back to `0` and upload.

Other settings at the top of the firmware: `BASE_NOTE`, `MIDI_CHANNEL`,
`ATTRACT_CC` (must match `ATTRACT_TOGGLE_CC` in `input.js`), `DEBOUNCE_MS`,
`POT_CC` (must match `VARIATION_CC` in `input.js`), `RANDOM_CC` (must match
`RANDOM_CC` in `input.js`). **If you don't fit a
potentiometer, set `USE_POT` to `0`.** An unconnected D9 picks up noise and
would keep changing the variation at random.

---

## Building the installation

### What makes a good pad

The Nano senses the small electrical capacitance of a body near or touching the
pad. Anything conductive works, and so do some things behind a thin layer of
non-conductive material.

| Works well | Notes |
| --- | --- |
| Metal objects: bowls, bells, keys, spoons, coins, brass hardware, cutlery | Clean bare metal. Lacquered or painted metal only senses through the coating, so test it |
| Copper or aluminium tape, foil | Easy to shape into symbols or regions on a table or wall |
| Conductive paint or ink (e.g. Bare Conductive Electric Paint) | Paint a pad straight onto paper, wood or a wall |
| Conductive thread or fabric | Sewn into cloth or soft objects |
| Water in a glass or ceramic dish | Drop the end of the wire (or a steel screw on it) into the water |
| Fruit, plants, moist clay | Push a wire or nail in. They dry out over days, so expect to re-tune |
| Pads hidden under 1–3 mm of wood veneer, card, cloth or acrylic | Touches register through the cover, more weakly, so you may need to lower `TOUCH_RATIO` |

What doesn't work: anything that can't conduct (plastic, glass, dry wood, stone)
unless a pad is attached to or hidden under it.

### Connecting objects

- **One wire per pad.** Solder the wire on, or use an alligator clip, a ring
  terminal under a screw, or a crimp. The adhesive on copper tape doesn't
  conduct, so solder to the tape or fold the wire end under a strip of it.
- **Keep pad wires short**, ideally under 50 cm. Each wire is part of its pad,
  so a long wire gets touched by anyone walking close to it. Put the Nano near
  the pads, in a box under the table or behind the wall, and use a long USB
  cable from the Nano to the Pi instead (USB-C cables are fine up to about 3 m;
  use an active USB extension beyond that).
- **Keep pad wires apart.** Don't bundle them or use ribbon cable: neighbouring
  wires pick up each other's touches. Space them a finger's width or more, and
  keep them away from mains cables and the Pi's power supply.
- **Pads must not touch each other** or any grounded metal (a metal table frame,
  radiator, lamp). Stand metal objects on wood, cloth or rubber feet.
- **Pads of similar size behave alike.** A large object (a big metal bowl) reads
  very differently from a coin. If one pad is much bigger than the rest, check
  it in the debug output and tune the ratios to suit.
- **Strain-relieve the wires** at the Nano with tape, cable ties or hot glue.
  Visitors will tug on objects. Header pins and solder joints are the first
  thing to break.
- Unused pad pins can be left unconnected.

The pads carry only a tiny low-voltage signal and are safe to touch.

### Placing the knob and buttons

- Mount the potentiometer through a panel or the enclosure lid (a 7 mm hole for
  most panel pots) and fit a knob with a pointer. Wire it to 3V3, D9 and GND as
  in the table above. If the knob turns the wrong way, swap the two outer legs.
- An ordinary smooth (non-clicking) pot is what this expects. The sketch
  divides its turn into 8 equal zones, one per variation (about 34° each on a
  typical 270° pot). Near the boundary between two zones it keeps the current
  variation, so a knob resting on the line doesn't flicker. A printed dial with
  the 8 zones marked helps visitors find their way back to a figure. Fully
  counter-clockwise is zone 0, which gives the plain chord figure.
- The random button is for visitors: put it beside the knob, where it reads as
  "ask without a question". A large arcade-style button works well. Any
  momentary switch does, and it can be a pad-like object with a switch inside.
- The attract-mode button is for the operator, so hide it inside the enclosure
  or on the back if visitors shouldn't use it.

### Before opening

1. Fix every object in its final place, then unplug and replug the Nano's USB
   so it calibrates with everything in position. Keep hands off the pads for
   the first second.
2. Check each pad with `DEBUG` on, in the room, with the room's lighting and
   equipment running. Then turn `DEBUG` off.
3. Test with several people. Dry hands and people in thick-soled shoes read
   weaker. If touches get missed, lower `TOUCH_RATIO`.
4. Whenever objects are moved or added, replug the Nano so it recalibrates.

---

## Part 2: Raspberry Pi 5 (display)

### Pi parts

- Raspberry Pi 5, power supply, microSD card (16 GB+)
- Micro-HDMI to HDMI cable, screen or projector, speakers (HDMI audio or the Pi's USB audio)
- A USB keyboard during setup and for saving figures

### 1. Install the OS

1. Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/) to write
   **Raspberry Pi OS (64-bit), with desktop** to the card. In the Imager
   settings, set a username and password, and Wi-Fi/SSH if you want remote access.
2. Boot the Pi. Run `sudo raspi-config` and set:
   - **System Options → Boot / Auto Login → Desktop Autologin**
   - **Display Options → Screen Blanking → No**
3. Choose the audio output by right-clicking the volume icon in the taskbar
   (e.g. HDMI).

### 2. Copy the sketch onto the Pi

Clone the repo or copy this folder (USB stick, `scp`, etc.) to `~/mantic-writer`,
so that `~/mantic-writer/index.html` exists.

### 3. Serve it locally

Web MIDI only works on `localhost` or https, so the sketch must be served rather
than opened as a file. Create `~/.config/systemd/user/mantic-server.service`:

```ini
[Unit]
Description=Mantic Writer local web server

[Service]
WorkingDirectory=%h/mantic-writer
ExecStart=/usr/bin/python3 -m http.server 8000 --bind 127.0.0.1
Restart=always

[Install]
WantedBy=default.target
```

Then enable it:

```sh
systemctl --user enable --now mantic-server
sudo loginctl enable-linger $USER
curl -s localhost:8000 | head -3   # should print the start of index.html
```

### 4. Grant MIDI permission (once)

With the Nano plugged in, open Chromium normally (not in kiosk mode), go to
`http://localhost:8000`, and click **Allow** when it asks to use MIDI devices.
Chromium remembers this. Then close Chromium.

### 5. Launch full-screen at login

Current Raspberry Pi OS uses the labwc desktop. Add this line to
`~/.config/labwc/autostart` (create the file if needed):

```sh
chromium --kiosk --noerrdialogs --disable-infobars --password-store=basic --autoplay-policy=no-user-gesture-required http://localhost:8000 &
```

- On older images the browser is `chromium-browser` instead of `chromium`.
  `which chromium chromium-browser` shows which you have.

- On older images that use the Wayfire desktop, put the same command under an
  `[autostart]` section in `~/.config/wayfire.ini` instead.

- `--autoplay-policy=no-user-gesture-required` lets sound play without a click.

- `--password-store=basic` stops Chromium from using the system keyring. Without it,
  every boot stops at an "Unlock Default Keyring" password prompt, because
  autologin never unlocks the keyring.

Reboot. The sketch should come up full-screen, and touching pads should draw
figures. Press **Alt-F4** to leave kiosk mode.

---

## Using the installation

| Input | Action |
| --- | --- |
| Touch a chord of pads, then release all | Show that chord's figure (same chord → same figure, order doesn't matter) |
| The Nano's random button (D10) | A completely random figure, like a mouse click |
| Turn the knob | Choose one of 8 variations. A row of 8 marks near the bottom of the screen shows the current zone while the knob turns. The next chord uses that variation, and the figure on screen redraws as it once the knob stops |
| Ctrl-S (Cmd-S on a Mac) | Save the figure on screen |
| Ctrl/Cmd-Backspace | Remove the figure on screen from the saved list |
| Ctrl/Cmd-E | Download the saved list as JSON |
| Drag a JSON file onto the window | Import a saved list (merged with the current one) |
| **A** key, or the Nano's attract button (D8) | Toggle attract mode |
| Space / Enter / click | Random figure (for testing) |
| **+** / **-** keys | Make the tiles bigger or smaller on screen (1x, 2x, 3x…), e.g. to suit a projector. Remembered across restarts |

**Variations**: the knob's zone (one of 8 equal slices of its turn) becomes
part of the seed. Fully counter-clockwise (zone 0) gives the plain chord seed,
e.g. `48.50.53`, so figures saved before the knob existed still come back.
Other zones add a suffix, e.g. `48.50.53~3`. The number of zones is
`VARIATIONS` in `input.js`. If you change it, every zone except 0 gives
different figures, so saved variations won't match their places on the knob
any more.

**Pre-made arrangements**: a few chords show a hand-made arrangement from
`assets/tilemaps/` instead of a generated one. Touching pad 0 alone shows
*royalty*, pad 1 alone *ramparts*, and pad 2 alone *the pit*, each titled
with its file name (underscores become spaces). The knob still
changes their colour, inversion and sound, but not the arrangement. To add a
map, draw it in Tiled with the same 40×30 spritesheet
(`assets/spritesheets/libuse40x30-cp437.png`, 23 columns), save it as `.tmj`
in `assets/tilemaps/`, and add a chord for it to `TILEMAP_CHORDS` at the top of
`tilemaps.js`. The chord key is the sorted note numbers joined by dots: pads 0
and 3 together are `'48.51'`. Flipped tiles work; rotated tiles are drawn
unrotated.

**Attract mode** cycles through saved figures every 12 seconds. It also starts
by itself after 3 minutes with no input (if anything is saved), and any touch on
the pads stops it. Timings are at the top of `archive.js`.

**Saved figures** live in the browser's local storage, so they survive reboots,
but each browser keeps its own list. If you curate figures on your Mac, export
them with Cmd-E and drag the file onto the sketch on the Pi. Export a backup
before the show.

## Developing on a Mac

1. Serve the folder: `python3 -m http.server 8000` (or VS Code Live Server),
   then open `http://localhost:8000` in **Chrome** (Safari has no Web MIDI).
2. Click the page once so audio can start.
3. Play chords on a USB MIDI keyboard or the Nano. A keyboard's mod wheel
   (CC 1) works as the variation knob. Figure seeds are logged to the console,
   and `initializeSketch('48.50.53~3')` in the console draws a specific
   figure.
