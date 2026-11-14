// mantic_touch.ino — Arduino Nano ESP32 → USB-MIDI touch pads for Mantic Writer
//
// Each capacitive pad sends a MIDI note (on when touched, off when released).
// The sketch in the browser collects the notes of a gesture into a chord and
// turns the chord into a figure seed, so all chord logic lives in input.js and
// a regular MIDI keyboard behaves the same way.
//
// Build setup (Arduino IDE 2):
//   - Boards Manager: install Espressif's "esp32" package, version 3.x
//     (USBMIDI was added in 3.0). Select board "Arduino Nano ESP32".
//   - Tools > USB Mode: "USB-OTG (TinyUSB)" if the option is shown.
//   - Set DEBUG to 1 to print raw touch values over Serial while tuning
//     TOUCH_RATIO for your pads, then set it back to 0.
//
// Wiring: a wire from each pad pin to a piece of copper tape / foil / metal.
// Keep the wires short and apart from each other. Optional push buttons to GND:
// D8 toggles attract mode, D10 shows a random figure. Optional 10k potentiometer: outer legs to
// 3V3 and GND (NOT 5V/VBUS), wiper to D9. It is sent as MIDI CC 1 (mod wheel)
// and picks which variation of a chord's figure is drawn.

#include <USB.h>
#include <USBMIDI.h>

#define DEBUG 0

// ESP32-S3 touch channels are GPIO1–GPIO14, which the Nano exposes as A0–A7
// and D2–D7 (check the pinout in journal/ABX00083-datasheet.pdf).
const uint8_t PADS[] = { A0, A1, A2, A3, A4, A5, A6, A7, D2, D3, D4, D5, D6, D7 };
const uint8_t NUM_PADS = sizeof(PADS) / sizeof(PADS[0]);

const uint8_t BASE_NOTE = 48;         // pad 0 = C3, pad 1 = C#3, ...
const uint8_t MIDI_CHANNEL = 1;
const uint8_t ATTRACT_CC = 64;        // must match ATTRACT_TOGGLE_CC in input.js
const uint8_t ATTRACT_BUTTON = D8;    // optional push button to GND
const uint8_t RANDOM_CC = 65;         // must match RANDOM_CC in input.js
const uint8_t RANDOM_BUTTON = D10;    // optional push button to GND

#define USE_POT 1                     // set to 0 if no potentiometer is fitted (a floating pin sends noise)
const uint8_t POT_PIN = D9;           // GPIO18, ADC-capable and not a touch pin
const uint8_t POT_CC = 1;             // mod wheel; must match VARIATION_CC in input.js
const float POT_SMOOTHING = 0.1;      // 0..1, lower = smoother but slower

// On the ESP32-S3, touchRead() values RISE when a pad is touched.
const float TOUCH_RATIO = 1.30;       // touched above baseline * 1.30
const float RELEASE_RATIO = 1.15;     // released below baseline * 1.15 (hysteresis)
const uint32_t DEBOUNCE_MS = 20;
const float DRIFT = 0.001;            // how fast an untouched baseline follows slow changes

USBMIDI MIDI;

float baseline[NUM_PADS];
bool touched[NUM_PADS];
uint32_t changedAt[NUM_PADS];
// Momentary buttons wired to GND; each press sends its CC once.
struct PushButton {
  uint8_t pin;
  uint8_t cc;
  bool wasDown;
  uint32_t changedAt;
};
PushButton buttons[] = {
  { ATTRACT_BUTTON, ATTRACT_CC, false, 0 },
  { RANDOM_BUTTON, RANDOM_CC, false, 0 },
};
uint32_t ledOffAt = 0;
float potSmoothed = 0;
int potSent = -1;                     // last CC value sent, -1 = none yet

void calibrate() {
  for (uint8_t i = 0; i < NUM_PADS; i++) {
    uint64_t sum = 0;
    for (int n = 0; n < 50; n++) {
      sum += touchRead(PADS[i]);
      delay(2);
    }
    baseline[i] = sum / 50.0;
    touched[i] = false;
    changedAt[i] = 0;
  }
}

// Send the knob position when it has moved by more than one step, so a pot
// resting between two values doesn't flood the bus. force = send regardless.
void updatePot(bool force) {
#if USE_POT
  potSmoothed += (analogRead(POT_PIN) - potSmoothed) * POT_SMOOTHING;
  int cc = constrain((int)(potSmoothed * 127.0 / 4095.0 + 0.5), 0, 127);
  bool moved = potSent < 0 || abs(cc - potSent) > 1
    || (cc != potSent && (cc == 0 || cc == 127));
  if (moved || force) {
    MIDI.controlChange(POT_CC, cc, MIDI_CHANNEL);
    potSent = cc;
  }
#endif
}

bool anyTouched() {
  for (uint8_t i = 0; i < NUM_PADS; i++) {
    if (touched[i]) return true;
  }
  return false;
}

void flashLed() {
  digitalWrite(LED_BLUE, LOW);  // the RGB LED is active-low
  ledOffAt = millis() + 60;
}

void setup() {
  pinMode(LED_BLUE, OUTPUT);
  digitalWrite(LED_BLUE, HIGH);
  for (PushButton &b : buttons) pinMode(b.pin, INPUT_PULLUP);
#if USE_POT
  analogReadResolution(12);
  potSmoothed = analogRead(POT_PIN);
#endif

  MIDI.begin();
  USB.begin();
#if DEBUG
  Serial.begin(115200);
#endif

  // Keep hands off the pads for the first second after power-up.
  delay(500);
  calibrate();
}

void loop() {
  uint32_t now = millis();

  for (uint8_t i = 0; i < NUM_PADS; i++) {
    uint32_t raw = touchRead(PADS[i]);
    bool isTouched = touched[i]
      ? raw > baseline[i] * RELEASE_RATIO
      : raw > baseline[i] * TOUCH_RATIO;

    if (isTouched != touched[i] && now - changedAt[i] >= DEBOUNCE_MS) {
      changedAt[i] = now;
      if (isTouched) {
        // Re-send the knob at the start of each gesture, in case the browser
        // started after the Nano and never saw the last change.
        if (!anyTouched()) updatePot(true);
        touched[i] = true;
        MIDI.noteOn(BASE_NOTE + i, 100, MIDI_CHANNEL);
        flashLed();
      } else {
        touched[i] = false;
        MIDI.noteOff(BASE_NOTE + i, 0, MIDI_CHANNEL);
      }
    }

    // Track slow drift (temperature, humidity) only while untouched.
    if (!touched[i]) {
      baseline[i] += (raw - baseline[i]) * DRIFT;
    }

#if DEBUG
    Serial.print(raw);
    Serial.print(touched[i] ? "* " : "  ");
#endif
  }
#if DEBUG
#if USE_POT
  Serial.print("pot ");
  Serial.print(potSent);
#endif
  Serial.println();
#endif

  updatePot(false);

  for (PushButton &b : buttons) {
    bool down = digitalRead(b.pin) == LOW;
    if (down != b.wasDown && now - b.changedAt >= 50) {
      b.wasDown = down;
      b.changedAt = now;
      if (down) {
        MIDI.controlChange(b.cc, 127, MIDI_CHANNEL);
        flashLed();
      }
    }
  }

  if (ledOffAt && now >= ledOffAt) {
    digitalWrite(LED_BLUE, HIGH);
    ledOffAt = 0;
  }

  delay(5);
}
