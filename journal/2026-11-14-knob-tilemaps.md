---
project: "Mantic Writer"
date: 2026-11-14
author: "Wiley Wiggins"
---

# The 'keyboard'

I'm now working out the installation version, using the arduino nano esp32 as a midi device with its conductive pins (right now I am just touching the pins directly but I'm going to connect them to some copper tape or other "keys").

Each of the Nano's 14 touch pins sends a MIDI note when it's touched (pad 0 is note 48, pad 1 is 49, and so on) and a note-off when released. The browser treats everything from the first touch until every pad has been released as one gesture, a "chord". It collects every note touched during the gesture, sorts them, and joins them into a short string like `48.50.53`. That string is the seed. Because the notes are sorted, the order and timing don't matter.

The seed goes into a seeded random number generator (seedrandom), and every "random" choice the sketch makes comes from that generator, in the same order every time: the background colour, how many glyphs there are, which glyphs, whether they're flipped, where each one attaches to the cluster, whether the frame is inverted, and which sound plays at which pitch. The name is generated from the finished arrangement, so it follows too. Same chord, same seed, same figure. That makes the pads a kind of fixed lexicon instead of a slot machine. (If a pad ever gets stuck "on", the gesture closes itself after 5 seconds without any MIDI activity.)

Since it's all ordinary MIDI, any USB MIDI keyboard works as a stand-in for the Nano.

The first thing I noticed working this way— while it's desirable that the player be able to touch the same key or "chord" twice and get the same result, we're moving from a really wide spread of variation to seeing a lot of the same results just because of the bottleneck of the number of keys and the tendency of touching the same configurations of keys in hand-sized clusters. So, it feels a little less magic with less variaton.

I'll keep working with it, but to shake this up a little I am adding a digital pin button that acts like a mouse-click does (purely random selection) and a potentiometer that can modify the keys, like scaling them up or down (although it's not necessary to actually transpose the midi notes, since no one can hear their pitch, the actual sounds have random pitch variations).

## Building it out

The README has a new "Building the installation" section about the physical side. Only 14 pins on the Nano can sense touch (A0–A7 and D2–D7, the ESP32-S3's touch channels), so that's the maximum number of pads. Almost anything conductive can be a pad: metal bowls, bells, keys, copper tape, conductive paint, water in a dish, fruit, or a pad hidden under a thin layer of wood veneer or card. The practical rules are short pad wires, wires kept apart from each other, and no objects touching each other or grounded metal. The Nano should sit close to the pads, with a long USB cable running to the Pi instead. Replug the Nano whenever objects move so it recalibrates.

## The knob

There's now a potentiometer on D9 (powered from 3V3, never 5V). It picks one of 8 variations of a chord, so each chord has a family of related figures instead of just one. Fully counter-clockwise is position 0, which gives the original figure, so everything saved before the knob existed still comes back. Turning the knob also redraws the figure on screen as that variation, so you can scrub through a chord's relatives. A MIDI keyboard's mod wheel will do the same thing.

## Pre-made figures

I drew three arrangements in Tiled: *royalty*, *ramparts* and *the pit*. They're shown when someone touches pad 0, 1 or 2 alone. Single pads are the most common gesture, so visitors will find them. They're titled with their file names instead of a generated name, which makes them feel like named entries in the lexicon, more canonical than the others. The knob still changes their colour and sound but not the arrangement.

I'm not totally sure if this was a good idea— the tilemaps are actual images made out of tiles rather than inscrutable arrangements of adjacent tiles, so that might run counter to the feel of the project. While I'm still thinking through it, I haven't actually seen any of the premade tilemaps show up in testing yet, so maybe it's not worth worrying about.

## The chance button

A second push button on D10 gives a completely random figure, the same as a mouse click. At first I made pad 13 the random pad, but a separate button is better. It keeps all 14 pads for chords and separates the two kinds of input. It should probably sit next to the knob. The attract-mode button on D8 stays hidden for the operator.

## Saving and loading

This is the "whole cards saved and replayed" idea from the Sandbox session. Because every figure comes from its seed, saving a figure only means saving the seed: a short string like `48.50.53~3`, or `r2840117705` for a random one. Loading it rebuilds the exact same glyphs, colour, sound and name.

- **Cmd/Ctrl-S** saves the figure on screen (its seed, its name and the time) and briefly shows "SAVED" with the count. **Cmd/Ctrl-Backspace** removes it again. I'll probably also add a save digital pin button so visitors can save cards.
- The saved list lives in the browser's local storage, so it survives reboots. But each browser keeps its own list, so what I save in Chrome on the Mac isn't on the Pi.
- **Cmd/Ctrl-E** downloads the list as a JSON file. Dragging a JSON file onto the window imports it, merged with whatever's already saved. That's how I can curate figures on the Mac and carry them to the Pi, and it's the backup.
- **Attract mode** plays the saved figures back, one every 12 seconds. It starts by itself after 3 minutes with nobody touching anything, and any touch on the pads stops it. The **A** key or the hidden button on D8 toggles it by hand.

So the saved list is a kind of curated deck sitting on top of the larger space of possible figures. A saved seed only rebuilds the same figure as long as the code, spritesheet and word lists stay the same. Changing the number of knob zones, or how a figure is generated, would also change what some saved seeds show. The pre-made maps already did this for pads 0–2 on their own.

## Small fixes

- In chrome (not in Safari, but Safari doesn't have web midi) on the Mac's Retina screen there were faint lines around some tiles, slivers of the neighbouring glyph on the spritesheet leaking in when Chrome scaled the tiles up. Turning off image smoothing (`noSmooth()`) fixed it.
- At one point every figure came up "Unknown Figure". It was only Chrome running a cached mix of old and new files, and a hard reload fixed it. After copying new files over to the Pi, I need to clear Chromium's cache or the kiosk may keep running the old version.

## Next

- Troubleshoot the arduino nano with the Rpi5 (it doesn't seem to trigger anything there yet, but it could be a cable/power issue)
- Wire the knob and both buttons and re-upload the firmware (none of the new firmware has been compiled yet).
- Make a printed dial for the knob's 8 positions.
- Choose the pad objects and test them in the space with several people.
