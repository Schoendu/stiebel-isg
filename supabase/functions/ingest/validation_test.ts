import {
  PayloadValidationError,
  validateTelemetryPayload,
} from "./validation.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`values are not equal: ${JSON.stringify(actual)}`);
  }
}

function assertThrows(action: () => unknown, message?: string): void {
  try {
    action();
  } catch (error) {
    if (!(error instanceof PayloadValidationError)) {
      throw new Error("unexpected error type");
    }
    if (message && !error.message.includes(message)) {
      throw new Error(`error did not include: ${message}`);
    }
    return;
  }
  throw new Error("expected validation to throw");
}

Deno.test("accepts and preserves a valid telemetry payload", () => {
  const payload = {
    device_id: "plant-room-1",
    timestamp: "2026-10-02T10:15:00+02:00",
    outside_temperature_c: 8.4,
    compressor1: true,
    live_poll_errors: 0,
  };
  assertEquals(validateTelemetryPayload(payload), payload);
});

Deno.test("rejects timestamps without timezone information", () => {
  assertThrows(
    () => validateTelemetryPayload({
      device_id: "plant-room-1",
      timestamp: "2026-10-02T10:15:00",
      modbus_ok: true,
    }),
    "explicit timezone offset",
  );
});

Deno.test("rejects invalid calendar dates", () => {
  assertThrows(
    () => validateTelemetryPayload({
      device_id: "plant-room-1",
      timestamp: "2026-02-31T10:15:00Z",
      modbus_ok: true,
    }),
  );
});

Deno.test("rejects unknown, null, and out-of-range fields", () => {
  for (const extra of [
    { received_at: "2026-10-02T10:15:01Z" },
    { outside_temperature_c: null },
    { heatpump1_high_pressure_bar: 101 },
  ]) {
    assertThrows(
      () => validateTelemetryPayload({
        device_id: "plant-room-1",
        timestamp: "2026-10-02T10:15:00Z",
        ...extra,
      }),
    );
  }
});

Deno.test("rejects identifiers outside the contract", () => {
  assertThrows(
    () => validateTelemetryPayload({
      device_id: "plant room/1",
      timestamp: "2026-10-02T10:15:00Z",
      modbus_ok: true,
    }),
  );
});
