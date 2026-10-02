export type TelemetryPayload = Record<string, string | number | boolean> & {
  device_id: string;
  timestamp: string;
};

type NumberRule = {
  integer?: boolean;
  min: number;
  max: number;
};

const NUMBER_RULES: Record<string, NumberRule> = {
  outside_temperature_c: { min: -100, max: 100 },
  heatpump1_flow_c: { min: -100, max: 250 },
  heatpump1_return_c: { min: -100, max: 250 },
  heatpump1_hotgas_c: { min: -100, max: 250 },
  heatpump1_low_pressure_bar: { min: 0, max: 100 },
  heatpump1_high_pressure_bar: { min: 0, max: 100 },
  heatpump1_flowrate_lmin: { min: 0, max: 1000 },
  thermal_power_kw: { min: -1000, max: 1000 },
  dhw_actual_c: { min: -100, max: 250 },
  dhw_target_c: { min: -100, max: 250 },
  heat_dhw_today_kwh: { min: 0, max: 1_000_000 },
  electricity_dhw_today_kwh: { min: 0, max: 1_000_000 },
  heat_heating_today_kwh: { min: 0, max: 1_000_000 },
  electricity_heating_today_kwh: { min: 0, max: 1_000_000 },
  can_bus_status: { integer: true, min: -2_147_483_648, max: 2_147_483_647 },
  live_poll_errors: { integer: true, min: 0, max: 2_147_483_647 },
  energy_poll_errors: { integer: true, min: 0, max: 2_147_483_647 },
  config_poll_errors: { integer: true, min: 0, max: 2_147_483_647 },
  device_uptime_s: { integer: true, min: 0, max: Number.MAX_SAFE_INTEGER },
};

const BOOLEAN_FIELDS = new Set([
  "compressor1",
  "dhw_charging_pump",
  "buffer_charging_pump1",
  "heating_circuit1_pump",
  "defrost_initiated",
  "modbus_ok",
  "sd_ok",
]);

const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const TIMESTAMP_PATTERN =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function hasValidCalendarDate(timestamp: string): boolean {
  const [year, month, day] = timestamp.slice(0, 10).split("-").map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ];
  return day <= daysInMonth;
}

export class PayloadValidationError extends Error {}

export function validateTelemetryPayload(value: unknown): TelemetryPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PayloadValidationError("payload must be a JSON object");
  }

  const input = value as Record<string, unknown>;
  if (typeof input.device_id !== "string" || !DEVICE_ID_PATTERN.test(input.device_id)) {
    throw new PayloadValidationError(
      "device_id must be 1-64 characters using letters, digits, '.', '_' or '-'",
    );
  }
  if (
    typeof input.timestamp !== "string" ||
    !TIMESTAMP_PATTERN.test(input.timestamp) ||
    !hasValidCalendarDate(input.timestamp) ||
    Number.isNaN(Date.parse(input.timestamp))
  ) {
    throw new PayloadValidationError(
      "timestamp must be a valid ISO 8601 timestamp with Z or an explicit timezone offset",
    );
  }

  const output: TelemetryPayload = {
    device_id: input.device_id,
    timestamp: input.timestamp,
  };
  let measurementCount = 0;

  for (const [field, fieldValue] of Object.entries(input)) {
    if (field === "device_id" || field === "timestamp") continue;

    const numberRule = NUMBER_RULES[field];
    if (numberRule) {
      if (
        typeof fieldValue !== "number" ||
        !Number.isFinite(fieldValue) ||
        (numberRule.integer && !Number.isSafeInteger(fieldValue)) ||
        fieldValue < numberRule.min ||
        fieldValue > numberRule.max
      ) {
        const type = numberRule.integer ? "integer" : "number";
        throw new PayloadValidationError(
          `${field} must be a finite ${type} between ${numberRule.min} and ${numberRule.max}`,
        );
      }
      output[field] = fieldValue;
      measurementCount++;
      continue;
    }

    if (BOOLEAN_FIELDS.has(field)) {
      if (typeof fieldValue !== "boolean") {
        throw new PayloadValidationError(`${field} must be a boolean`);
      }
      output[field] = fieldValue;
      measurementCount++;
      continue;
    }

    throw new PayloadValidationError(`unknown field: ${field}`);
  }

  if (measurementCount === 0) {
    throw new PayloadValidationError("payload must contain at least one measurement field");
  }
  return output;
}
