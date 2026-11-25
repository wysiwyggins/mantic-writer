// pot_test.ino — check the potentiometer on D9 by itself, without MIDI.
//
// Upload, then open Tools > Serial Monitor (or Serial Plotter) at 115200 baud
// and turn the knob. Expect raw to sweep about 0..4095 and volts 0..3.3.

const uint8_t POT_PIN = D9;

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000) {}  // wait up to 3 s for the monitor
  analogReadResolution(12);
  pinMode(POT_PIN, INPUT);
  analogSetPinAttenuation(POT_PIN, ADC_11db);  // full 0..~3.1 V range
  Serial.print("D9 is GPIO ");
  Serial.println(digitalPinToGPIONumber(POT_PIN));
}

void loop() {
  int raw = analogRead(POT_PIN);
  int mv = analogReadMilliVolts(POT_PIN);
  Serial.print("raw:");
  Serial.print(raw);
  Serial.print(" mV:");
  Serial.println(mv);
  delay(100);
}
