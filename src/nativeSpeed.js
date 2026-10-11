// Bambu native presets: https://github.com/X1Plus/X1Plus/wiki/Speed-Adjust-UI
export function nativeSpeedLines(turbo = false) {
  return turbo
    ? ['M204.2 K1.60', 'M220 K2.00', 'M73.2 R0.60', 'M1002 set_gcode_claim_speed_level : 7']
    : ['M204.2 K1.00', 'M220 K1.00', 'M73.2 R1.00', 'M1002 set_gcode_claim_speed_level : 5'];
}

// Only the two known presets are accepted; unrelated machine commands stay blocked.
export function isNativeSpeedLine(line) {
  return [...nativeSpeedLines(), ...nativeSpeedLines(true)].includes(line);
}
