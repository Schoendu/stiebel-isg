/*
  STIEBEL ELTRON ISG Logger v2
  OLIMEX ESP32-GATEWAY Rev.C

  - Ethernet (Rev.C: external 50 MHz clock on GPIO0)
  - Modbus TCP READ ONLY to ISG
  - All 78 registers confirmed by the discovery scan
  - Three polling classes:
      LIVE   : 60 s
      ENERGY : 5 min
      CONFIG : 15 min
  - Daily CSV snapshots on microSD
  - Responsive web UI
  - JSON API with all registers

  Target: ESP32 Arduino Core 3.x
*/

// ============================================================
// OLIMEX ESP32-GATEWAY Rev.C Ethernet configuration
// MUST be defined before including ETH.h
// ============================================================

#define ETH_PHY_TYPE  ETH_PHY_LAN8720
#define ETH_PHY_ADDR  0
#define ETH_PHY_MDC   23
#define ETH_PHY_MDIO  18
#define ETH_PHY_POWER -1
#define ETH_CLK_MODE  ETH_CLOCK_GPIO0_IN

#include <Arduino.h>
#include <Network.h>
#include <ETH.h>
#include <FS.h>
#include <SD_MMC.h>
#include <WebServer.h>
#include <time.h>
#include <math.h>

// ============================================================
// Configuration
// ============================================================

static const char *HOSTNAME = "isg-logger";

IPAddress ISG_IP(192, 168, 178, 48);
static const uint16_t ISG_PORT = 502;
static const uint8_t MODBUS_UNIT_ID = 1;

static const uint32_t LIVE_INTERVAL_MS   = 60UL * 1000UL;
static const uint32_t ENERGY_INTERVAL_MS = 5UL * 60UL * 1000UL;
static const uint32_t CONFIG_INTERVAL_MS = 15UL * 60UL * 1000UL;
static const uint32_t SD_RETRY_MS        = 5UL * 60UL * 1000UL;
static const uint32_t NTP_RETRY_MS       = 10UL * 60UL * 1000UL;

static const char *TZ_INFO = "CET-1CEST,M3.5.0,M10.5.0/3";
static const char *NTP_SERVER_1 = "pool.ntp.org";
static const char *NTP_SERVER_2 = "time.cloudflare.com";

static const float WATER_DENSITY_KG_L = 0.998f;
static const float WATER_CP_KJ_KGK = 4.186f;

WebServer server(80);

// ============================================================
// Register model
// ============================================================

enum PollClass : uint8_t {
  POLL_LIVE = 0,
  POLL_ENERGY = 1,
  POLL_CONFIG = 2
};

struct RegisterDef {
  const char *block;
  uint8_t fc;
  uint16_t reg;
  const char *name;
  const char *label;
  uint8_t datatype;
  const char *unit;
  PollClass pollClass;

  // runtime state
  uint16_t raw;
  double value;
  bool valid;
  time_t updatedAt;
};

// datatype 2 = signed int16 * 0.1
// datatype 6 = unsigned int16
// datatype 7 = signed int16 * 0.01
// datatype 8 = enum/integer
// 0x8000 = unavailable
// 0x9000 = special/off/unavailable for scaled values on this system

RegisterDef regs[] = {
  // energy_hp1 (19)
  {"energy_hp1", 4, 3523, "hp1_heat_heating_today_kWh",          "HP1 heat heating today",          6, "kWh",  POLL_ENERGY},
  {"energy_hp1", 4, 3524, "hp1_heat_heating_kWh_part",          "HP1 heat heating kWh part",       6, "kWh",  POLL_ENERGY},
  {"energy_hp1", 4, 3525, "hp1_heat_heating_MWh",               "HP1 heat heating MWh",            6, "MWh",  POLL_ENERGY},
  {"energy_hp1", 4, 3526, "hp1_heat_dhw_today_kWh",              "HP1 heat DHW today",              6, "kWh",  POLL_ENERGY},
  {"energy_hp1", 4, 3527, "hp1_heat_dhw_kWh_part",              "HP1 heat DHW kWh part",           6, "kWh",  POLL_ENERGY},
  {"energy_hp1", 4, 3528, "hp1_heat_dhw_MWh",                   "HP1 heat DHW MWh",                6, "MWh",  POLL_ENERGY},
  {"energy_hp1", 4, 3529, "hp1_aux_heat_heating_kWh_part",      "HP1 auxiliary heat heating kWh", 6, "kWh",  POLL_ENERGY},
  {"energy_hp1", 4, 3530, "hp1_aux_heat_heating_MWh",           "HP1 auxiliary heat heating MWh", 6, "MWh",  POLL_ENERGY},
  {"energy_hp1", 4, 3531, "hp1_aux_heat_dhw_kWh_part",          "HP1 auxiliary heat DHW kWh",     6, "kWh",  POLL_ENERGY},
  {"energy_hp1", 4, 3532, "hp1_aux_heat_dhw_MWh",               "HP1 auxiliary heat DHW MWh",     6, "MWh",  POLL_ENERGY},
  {"energy_hp1", 4, 3533, "hp1_electricity_heating_today_kWh",  "HP1 electricity heating today",  6, "kWh",  POLL_ENERGY},
  {"energy_hp1", 4, 3534, "hp1_electricity_heating_kWh_part",   "HP1 electricity heating kWh",    6, "kWh",  POLL_ENERGY},
  {"energy_hp1", 4, 3535, "hp1_electricity_heating_MWh",        "HP1 electricity heating MWh",    6, "MWh",  POLL_ENERGY},
  {"energy_hp1", 4, 3536, "hp1_electricity_dhw_today_kWh",      "HP1 electricity DHW today",      6, "kWh",  POLL_ENERGY},
  {"energy_hp1", 4, 3537, "hp1_electricity_dhw_kWh_part",       "HP1 electricity DHW kWh",        6, "kWh",  POLL_ENERGY},
  {"energy_hp1", 4, 3538, "hp1_electricity_dhw_MWh",            "HP1 electricity DHW MWh",        6, "MWh",  POLL_ENERGY},
  {"energy_hp1", 4, 3546, "hp1_aux_stage1_runtime_h",           "HP1 auxiliary stage 1 runtime",  6, "h",    POLL_ENERGY},
  {"energy_hp1", 4, 3547, "hp1_aux_stage2_runtime_h",           "HP1 auxiliary stage 2 runtime",  6, "h",    POLL_ENERGY},
  {"energy_hp1", 4, 3548, "hp1_aux_stage12_runtime_h",          "HP1 auxiliary stage 1+2 runtime",6, "h",    POLL_ENERGY},

  // energy_management (5)
  {"energy_management", 3, 4001, "sg_ready_enabled",             "SG Ready enabled",               6, "",      POLL_CONFIG},
  {"energy_management", 3, 4002, "sg_ready_input1",              "SG Ready input 1",               6, "",      POLL_LIVE},
  {"energy_management", 3, 4003, "sg_ready_input2",              "SG Ready input 2",               6, "",      POLL_LIVE},
  {"energy_management", 4, 5001, "sg_ready_operating_state",     "SG Ready operating state",       6, "",      POLL_LIVE},
  {"energy_management", 4, 5002, "controller_identification",    "Controller identification",      6, "",      POLL_CONFIG},

  // energy_system (16)
  {"energy_system", 4, 3501, "heat_heating_today_kWh",           "Heat heating today",             6, "kWh",   POLL_ENERGY},
  {"energy_system", 4, 3502, "heat_heating_total_kWh_part",      "Heat heating total kWh part",    6, "kWh",   POLL_ENERGY},
  {"energy_system", 4, 3503, "heat_heating_total_MWh",           "Heat heating total MWh",         6, "MWh",   POLL_ENERGY},
  {"energy_system", 4, 3504, "heat_dhw_today_kWh",               "Heat DHW today",                 6, "kWh",   POLL_ENERGY},
  {"energy_system", 4, 3505, "heat_dhw_total_kWh_part",          "Heat DHW total kWh part",        6, "kWh",   POLL_ENERGY},
  {"energy_system", 4, 3506, "heat_dhw_total_MWh",               "Heat DHW total MWh",             6, "MWh",   POLL_ENERGY},
  {"energy_system", 4, 3507, "aux_heat_heating_kWh_part",        "Auxiliary heat heating kWh",    6, "kWh",   POLL_ENERGY},
  {"energy_system", 4, 3508, "aux_heat_heating_MWh",             "Auxiliary heat heating MWh",    6, "MWh",   POLL_ENERGY},
  {"energy_system", 4, 3509, "aux_heat_dhw_kWh_part",            "Auxiliary heat DHW kWh",        6, "kWh",   POLL_ENERGY},
  {"energy_system", 4, 3510, "aux_heat_dhw_MWh",                 "Auxiliary heat DHW MWh",        6, "MWh",   POLL_ENERGY},
  {"energy_system", 4, 3511, "electricity_heating_today_kWh",    "Electricity heating today",     6, "kWh",   POLL_ENERGY},
  {"energy_system", 4, 3512, "electricity_heating_kWh_part",     "Electricity heating kWh part",  6, "kWh",   POLL_ENERGY},
  {"energy_system", 4, 3513, "electricity_heating_MWh",          "Electricity heating MWh",       6, "MWh",   POLL_ENERGY},
  {"energy_system", 4, 3514, "electricity_dhw_today_kWh",        "Electricity DHW today",         6, "kWh",   POLL_ENERGY},
  {"energy_system", 4, 3515, "electricity_dhw_kWh_part",         "Electricity DHW kWh part",      6, "kWh",   POLL_ENERGY},
  {"energy_system", 4, 3516, "electricity_dhw_MWh",              "Electricity DHW MWh",           6, "MWh",   POLL_ENERGY},

  // heatpump1 (6)
  {"heatpump1", 4, 542, "heatpump1_return_C",                    "Heat pump return",               2, "°C",     POLL_LIVE},
  {"heatpump1", 4, 543, "heatpump1_flow_C",                      "Heat pump flow",                 2, "°C",     POLL_LIVE},
  {"heatpump1", 4, 544, "heatpump1_hotgas_C",                    "Hot gas",                        2, "°C",     POLL_LIVE},
  {"heatpump1", 4, 545, "heatpump1_low_pressure_bar",            "Low pressure",                   7, "bar",    POLL_LIVE},
  {"heatpump1", 4, 547, "heatpump1_high_pressure_bar",           "High pressure",                  7, "bar",    POLL_LIVE},
  {"heatpump1", 4, 548, "heatpump1_flowrate_lmin",               "Flow rate",                      2, "l/min",  POLL_LIVE},

  // settings (9)
  {"settings", 3, 1501, "operating_mode",                        "Operating mode",                 8, "",       POLL_LIVE},
  {"settings", 3, 1502, "hc1_comfort_temperature_C",             "HC1 comfort temperature",        2, "°C",     POLL_CONFIG},
  {"settings", 3, 1503, "hc1_eco_temperature_C",                 "HC1 ECO temperature",            2, "°C",     POLL_CONFIG},
  {"settings", 3, 1504, "hc1_heating_curve_slope",               "HC1 heating curve slope",        7, "",       POLL_CONFIG},
  {"settings", 3, 1508, "fixed_value_operation_C",               "Fixed value operation",          2, "°C",     POLL_CONFIG},
  {"settings", 3, 1509, "heating_bivalence_temp_C",              "Heating bivalence temperature",  2, "°C",     POLL_CONFIG},
  {"settings", 3, 1511, "dhw_eco_temperature_C",                 "DHW ECO temperature",            2, "°C",     POLL_CONFIG},
  {"settings", 3, 1512, "dhw_stages",                            "DHW stages",                     8, "",       POLL_CONFIG},
  {"settings", 3, 1513, "dhw_bivalence_temp_C",                  "DHW bivalence temperature",      2, "°C",     POLL_CONFIG},

  // status (12)
  {"status", 4, 2501, "operating_status",                         "Operating status bitfield",      6, "",       POLL_LIVE},
  {"status", 4, 2502, "power_off_status",                         "Power-off status",               8, "",       POLL_LIVE},
  {"status", 4, 2504, "fault_status",                             "Fault status",                   6, "",       POLL_LIVE},
  {"status", 4, 2505, "can_bus_status",                           "CAN bus status",                 6, "",       POLL_LIVE},
  {"status", 4, 2506, "defrost_initiated",                       "Defrost initiated",              6, "",       POLL_LIVE},
  {"status", 4, 2507, "active_error_number",                     "Active error number",            6, "",       POLL_LIVE},
  {"status", 4, 2508, "message_number",                          "Message number",                 6, "",       POLL_LIVE},
  {"status", 4, 2509, "heating_circuit1_pump",                   "Heating circuit 1 pump",         6, "",       POLL_LIVE},
  {"status", 4, 2512, "buffer_charging_pump1",                   "Buffer charging pump 1",         6, "",       POLL_LIVE},
  {"status", 4, 2514, "dhw_charging_pump",                       "DHW charging pump",              6, "",       POLL_LIVE},
  {"status", 4, 2517, "dhw_circulation_pump",                    "DHW circulation pump",           6, "",       POLL_LIVE},
  {"status", 4, 2542, "compressor1",                              "Compressor 1",                    6, "",       POLL_LIVE},

  // system (11)
  {"system", 4, 507, "outside_temperature_C",                    "Outside temperature",            2, "°C",     POLL_LIVE},
  {"system", 4, 508, "heating_circuit1_actual_C",                 "HC1 actual temperature",         2, "°C",     POLL_LIVE},
  {"system", 4, 510, "heating_circuit1_target_C",                 "HC1 target temperature",         2, "°C",     POLL_LIVE},
  {"system", 4, 516, "return_temperature_actual_C",               "System return temperature",      2, "°C",     POLL_LIVE},
  {"system", 4, 517, "fixed_temperature_target_C",               "Fixed temperature target",       2, "°C",     POLL_CONFIG},
  {"system", 4, 518, "buffer_temperature_actual_C",               "Buffer actual temperature",      2, "°C",     POLL_LIVE},
  {"system", 4, 519, "buffer_temperature_target_C",               "Buffer target temperature",      2, "°C",     POLL_LIVE},
  {"system", 4, 522, "dhw_actual_C",                              "DHW actual temperature",         2, "°C",     POLL_LIVE},
  {"system", 4, 523, "dhw_target_C",                              "DHW target temperature",         2, "°C",     POLL_LIVE},
  {"system", 4, 533, "heating_application_limit_C",               "Heating application limit",      2, "°C",     POLL_CONFIG},
  {"system", 4, 534, "dhw_application_limit_C",                   "DHW application limit",          2, "°C",     POLL_CONFIG}
};

static const size_t REG_COUNT = sizeof(regs) / sizeof(regs[0]);
static_assert(REG_COUNT == 78, "Register table must contain exactly 78 discovered registers");

// ============================================================
// Runtime state
// ============================================================

bool ethernetConnected = false;
bool sdMounted = false;
bool timeSynchronized = false;

uint16_t modbusTransactionId = 0;
uint32_t totalModbusErrors = 0;
uint16_t lastPollErrors[3] = {0, 0, 0};
uint32_t lastPollMillis[3] = {0, 0, 0};
time_t lastPollTime[3] = {0, 0, 0};
uint32_t lastSdRetry = 0;
uint32_t lastNtpAttempt = 0;

// ============================================================
// Helpers
// ============================================================

const char *pollClassName(PollClass pc) {
  switch (pc) {
    case POLL_LIVE: return "1 min";
    case POLL_ENERGY: return "5 min";
    case POLL_CONFIG: return "15 min";
    default: return "?";
  }
}

uint32_t pollInterval(PollClass pc) {
  switch (pc) {
    case POLL_LIVE: return LIVE_INTERVAL_MS;
    case POLL_ENERGY: return ENERGY_INTERVAL_MS;
    case POLL_CONFIG: return CONFIG_INTERVAL_MS;
    default: return LIVE_INTERVAL_MS;
  }
}

RegisterDef *findReg(uint8_t fc, uint16_t reg) {
  for (size_t i = 0; i < REG_COUNT; i++) {
    if (regs[i].fc == fc && regs[i].reg == reg) return &regs[i];
  }
  return nullptr;
}

double regValue(uint8_t fc, uint16_t reg) {
  RegisterDef *r = findReg(fc, reg);
  return (r && r->valid) ? r->value : NAN;
}

uint16_t regRaw(uint8_t fc, uint16_t reg, uint16_t fallback = 0) {
  RegisterDef *r = findReg(fc, reg);
  return (r && r->valid) ? r->raw : fallback;
}

bool regOn(uint8_t fc, uint16_t reg) {
  RegisterDef *r = findReg(fc, reg);
  return r && r->valid && r->raw != 0;
}

String formatTime(time_t t) {
  if (t < 1700000000) return "not synchronized";
  struct tm tmValue;
  localtime_r(&t, &tmValue);
  char buffer[32];
  strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", &tmValue);
  return String(buffer);
}

String currentLogFilename() {
  time_t now = time(nullptr);
  if (now < 1700000000) return "/isg-unsynced.csv";
  struct tm tmValue;
  localtime_r(&now, &tmValue);
  char buffer[40];
  strftime(buffer, sizeof(buffer), "/isg-%Y-%m-%d.csv", &tmValue);
  return String(buffer);
}

String operatingModeName(uint16_t value) {
  switch (value) {
    case 0: return "Emergency";
    case 1: return "Standby";
    case 2: return "Programmed";
    case 3: return "Comfort";
    case 4: return "ECO";
    case 5: return "DHW";
    default: return "Mode " + String(value);
  }
}

String sgStateName(uint16_t value) {
  if (value == 2) return "Normal operation (state 2)";
  return "State " + String(value);
}

String controllerName(uint16_t value) {
  if (value == 449) return "WPMsystem";
  return String(value);
}

String onOff(bool on) {
  return on ? "ON" : "OFF";
}

String okFault(bool fault) {
  return fault ? "FAULT" : "OK";
}

String operatingStatusText(uint16_t raw) {
  String s;
  if (raw & (1U << 0)) s += "HC1 pump | ";
  if (raw & (1U << 5)) s += "DHW | ";
  if (raw & (1U << 6)) s += "compressor | ";
  if (s.length() == 0) return "No known bits set";
  s.remove(s.length() - 3);
  return s;
}

int displayDigits(const RegisterDef &r) {
  if (r.datatype == 7) return 2;
  if (r.datatype == 2) return 1;
  return 0;
}

String numericString(double v, int digits) {
  if (isnan(v)) return "n/a";
  return String(v, digits);
}

String registerDisplay(uint8_t fc, uint16_t reg, int digits = -1) {
  RegisterDef *r = findReg(fc, reg);
  if (!r || !r->valid) {
    if (r && r->raw == 0x9000 && reg == 1508) return "OFF";
    return "n/a";
  }
  if (digits < 0) digits = displayDigits(*r);
  String out = String(r->value, digits);
  if (strlen(r->unit) > 0) out += " " + String(r->unit);
  return out;
}

// ============================================================
// Derived values
// ============================================================

double combineEnergy(uint16_t kwhPartReg, uint16_t mwhReg) {
  double kwh = regValue(4, kwhPartReg);
  double mwh = regValue(4, mwhReg);
  if (isnan(kwh) || isnan(mwh)) return NAN;
  return mwh * 1000.0 + kwh;
}

double safeRatio(double numerator, double denominator) {
  if (isnan(numerator) || isnan(denominator) || denominator <= 0.0) return NAN;
  return numerator / denominator;
}

double hpDeltaT() {
  double flow = regValue(4, 543);
  double ret = regValue(4, 542);
  if (isnan(flow) || isnan(ret)) return NAN;
  return flow - ret;
}

double thermalPowerKw() {
  double flowRate = regValue(4, 548);
  double dt = hpDeltaT();
  if (isnan(flowRate) || isnan(dt)) return NAN;
  return flowRate * WATER_DENSITY_KG_L * WATER_CP_KJ_KGK * dt / 60.0;
}

double pressureRatio() {
  double low = regValue(4, 545);
  double high = regValue(4, 547);
  if (isnan(low) || isnan(high) || low <= 0.0) return NAN;
  return high / low;
}

double dhwDeltaTarget() {
  double actual = regValue(4, 522);
  double target = regValue(4, 523);
  if (isnan(actual) || isnan(target)) return NAN;
  return target - actual;
}

double heatingEfficiency() {
  return safeRatio(combineEnergy(3502, 3503), combineEnergy(3512, 3513));
}

double dhwEfficiency() {
  return safeRatio(combineEnergy(3505, 3506), combineEnergy(3515, 3516));
}

double hp1HeatingEfficiency() {
  return safeRatio(combineEnergy(3524, 3525), combineEnergy(3534, 3535));
}

double hp1DhwEfficiency() {
  return safeRatio(combineEnergy(3527, 3528), combineEnergy(3537, 3538));
}

// ============================================================
// Ethernet
// ============================================================

void onNetworkEvent(arduino_event_id_t event) {
  switch (event) {
    case ARDUINO_EVENT_ETH_START:
      Serial.println("[ETH] Started");
      ETH.setHostname(HOSTNAME);
      break;
    case ARDUINO_EVENT_ETH_CONNECTED:
      Serial.println("[ETH] Link connected");
      break;
    case ARDUINO_EVENT_ETH_GOT_IP:
      ethernetConnected = true;
      Serial.print("[ETH] IP: ");
      Serial.println(ETH.localIP());
      break;
    case ARDUINO_EVENT_ETH_LOST_IP:
    case ARDUINO_EVENT_ETH_DISCONNECTED:
    case ARDUINO_EVENT_ETH_STOP:
      ethernetConnected = false;
      Serial.println("[ETH] Link/IP unavailable");
      break;
    default:
      break;
  }
}

// ============================================================
// SD
// ============================================================

bool initSD() {
  Serial.println("[SD] Initializing...");
  SD_MMC.end();
  delay(50);

  // Rev.C uses 4-bit SDMMC; false = 4-bit mode
  if (!SD_MMC.begin("/sdcard", false)) {
    Serial.println("[SD] Mount failed");
    return false;
  }
  if (SD_MMC.cardType() == CARD_NONE) {
    Serial.println("[SD] No card detected");
    SD_MMC.end();
    return false;
  }
  Serial.print("[SD] Size: ");
  Serial.print(SD_MMC.cardSize() / 1024 / 1024);
  Serial.println(" MB");
  return true;
}

// ============================================================
// NTP
// ============================================================

bool initTime() {
  lastNtpAttempt = millis();
  Serial.println("[TIME] Starting NTP...");
  configTzTime(TZ_INFO, NTP_SERVER_1, NTP_SERVER_2);

  uint32_t start = millis();
  while (millis() - start < 10000) {
    time_t now = time(nullptr);
    if (now > 1700000000) {
      timeSynchronized = true;
      Serial.print("[TIME] Synchronized: ");
      Serial.println(formatTime(now));
      return true;
    }
    server.handleClient();
    delay(100);
  }
  Serial.println("[TIME] NTP not available");
  return false;
}

// ============================================================
// Raw Modbus TCP
// ============================================================

bool readExact(NetworkClient &client, uint8_t *buffer, size_t length, uint32_t timeoutMs = 2000) {
  size_t received = 0;
  uint32_t start = millis();
  while (received < length) {
    if (millis() - start > timeoutMs) return false;
    int available = client.available();
    if (available > 0) {
      int count = client.read(buffer + received, length - received);
      if (count > 0) received += count;
    } else {
      server.handleClient();
      delay(1);
    }
  }
  return true;
}

bool modbusReadRegister(uint16_t registerNumber, uint8_t functionCode, uint16_t &rawValue) {
  NetworkClient client;
  client.setTimeout(2000);

  if (!client.connect(ISG_IP, ISG_PORT)) return false;

  modbusTransactionId++;
  uint16_t address = registerNumber - 1;
  uint8_t request[12];

  request[0] = modbusTransactionId >> 8;
  request[1] = modbusTransactionId & 0xFF;
  request[2] = 0;
  request[3] = 0;
  request[4] = 0;
  request[5] = 6;
  request[6] = MODBUS_UNIT_ID;
  request[7] = functionCode;
  request[8] = address >> 8;
  request[9] = address & 0xFF;
  request[10] = 0;
  request[11] = 1;

  if (client.write(request, sizeof(request)) != sizeof(request)) {
    client.stop();
    return false;
  }

  uint8_t header[7];
  if (!readExact(client, header, sizeof(header))) {
    client.stop();
    return false;
  }

  uint16_t responseTransaction = (uint16_t(header[0]) << 8) | header[1];
  uint16_t length = (uint16_t(header[4]) << 8) | header[5];

  if (responseTransaction != modbusTransactionId || length < 2 || length > 20) {
    client.stop();
    return false;
  }

  uint8_t payload[20];
  size_t remaining = length - 1;
  if (!readExact(client, payload, remaining)) {
    client.stop();
    return false;
  }
  client.stop();

  if (payload[0] & 0x80) return false;
  if (payload[0] != functionCode) return false;
  if (remaining < 4 || payload[1] != 2) return false;

  rawValue = (uint16_t(payload[2]) << 8) | payload[3];
  return true;
}

bool decodeRegister(RegisterDef &r, uint16_t raw) {
  r.raw = raw;

  if (raw == 0x8000) {
    r.value = NAN;
    r.valid = false;
    return false;
  }

  if ((r.datatype == 2 || r.datatype == 7) && raw == 0x9000) {
    r.value = NAN;
    r.valid = false;
    return false;
  }

  switch (r.datatype) {
    case 2:
      r.value = double((int16_t)raw) * 0.1;
      break;
    case 6:
      r.value = double(raw);
      break;
    case 7:
      r.value = double((int16_t)raw) * 0.01;
      break;
    case 8:
      r.value = double(raw);
      break;
    default:
      r.value = double(raw);
      break;
  }

  r.valid = true;
  return true;
}

uint16_t pollGroup(PollClass pc) {
  if (!ethernetConnected) return 0;

  uint16_t errors = 0;
  time_t now = time(nullptr);

  Serial.print("[POLL] ");
  Serial.print(pollClassName(pc));
  Serial.println(" group");

  for (size_t i = 0; i < REG_COUNT; i++) {
    if (regs[i].pollClass != pc) continue;

    uint16_t raw = 0;
    if (modbusReadRegister(regs[i].reg, regs[i].fc, raw)) {
      decodeRegister(regs[i], raw);
      regs[i].updatedAt = now;
    } else {
      errors++;
      totalModbusErrors++;
      // Keep the last good cached value on a transient read error.
    }

    server.handleClient();
    delay(2);
  }

  lastPollErrors[(uint8_t)pc] = errors;
  lastPollMillis[(uint8_t)pc] = millis();
  lastPollTime[(uint8_t)pc] = now;

  Serial.print("[POLL] Errors: ");
  Serial.println(errors);
  return errors;
}

bool groupDue(PollClass pc) {
  uint32_t last = lastPollMillis[(uint8_t)pc];
  if (last == 0) return true;
  return (uint32_t)(millis() - last) >= pollInterval(pc);
}

// ============================================================
// CSV logging
// ============================================================

String csvNumber(double value, int digits) {
  if (isnan(value)) return "";
  String s(value, digits);
  s.replace('.', ',');
  return s;
}

String csvRegisterValue(const RegisterDef &r) {
  if (!r.valid) return "";
  return csvNumber(r.value, displayDigits(r));
}

void writeCsvHeader(File &file) {
  file.print("timestamp");
  for (size_t i = 0; i < REG_COUNT; i++) {
    file.print(';');
    file.print(regs[i].name);
  }
  file.print(";heatpump1_deltaT_K");
  file.print(";thermal_power_kW");
  file.print(";pressure_ratio");
  file.print(";dhw_delta_target_K");
  file.print(";heating_efficiency");
  file.print(";dhw_efficiency");
  file.print(";hp1_heating_efficiency");
  file.print(";hp1_dhw_efficiency");
  file.print(";fixed_value_operation_enabled");
  file.print(";live_poll_errors");
  file.print(";energy_poll_errors");
  file.print(";config_poll_errors");
  file.println(";total_modbus_errors");
}

bool saveSnapshot() {
  if (!sdMounted) return false;

  String filename = currentLogFilename();
  bool newFile = !SD_MMC.exists(filename);
  File file = SD_MMC.open(filename, FILE_APPEND);
  if (!file) {
    Serial.println("[SD] Failed to open log file");
    return false;
  }

  if (newFile) writeCsvHeader(file);

  file.print(formatTime(time(nullptr)));
  for (size_t i = 0; i < REG_COUNT; i++) {
    file.print(';');
    file.print(csvRegisterValue(regs[i]));
  }

  file.print(';'); file.print(csvNumber(hpDeltaT(), 2));
  file.print(';'); file.print(csvNumber(thermalPowerKw(), 3));
  file.print(';'); file.print(csvNumber(pressureRatio(), 3));
  file.print(';'); file.print(csvNumber(dhwDeltaTarget(), 2));
  file.print(';'); file.print(csvNumber(heatingEfficiency(), 3));
  file.print(';'); file.print(csvNumber(dhwEfficiency(), 3));
  file.print(';'); file.print(csvNumber(hp1HeatingEfficiency(), 3));
  file.print(';'); file.print(csvNumber(hp1DhwEfficiency(), 3));

  RegisterDef *fixed = findReg(3, 1508);
  int fixedEnabled = (fixed && fixed->raw != 0x9000 && fixed->raw != 0x8000) ? 1 : 0;
  file.print(';'); file.print(fixedEnabled);
  file.print(';'); file.print(lastPollErrors[POLL_LIVE]);
  file.print(';'); file.print(lastPollErrors[POLL_ENERGY]);
  file.print(';'); file.print(lastPollErrors[POLL_CONFIG]);
  file.print(';'); file.println(totalModbusErrors);

  file.close();
  return true;
}

// ============================================================
// HTML helpers
// ============================================================

String statusClass(bool good) {
  return good ? "ok" : "bad";
}

void htmlRow(String &html, const String &label, const String &value, const String &note = "") {
  html += "<tr><td>" + label + "</td><td><strong>" + value + "</strong>";
  if (note.length()) html += "<span class='note'>" + note + "</span>";
  html += "</td></tr>";
}

void htmlCard(String &html, const String &label, const String &value, const String &sub = "") {
  html += "<div class='card'><div class='cardlabel'>" + label + "</div><div class='cardvalue'>" + value + "</div>";
  if (sub.length()) html += "<div class='cardsub'>" + sub + "</div>";
  html += "</div>";
}

String lastPollText(PollClass pc) {
  if (lastPollTime[(uint8_t)pc] == 0) return "not yet";
  return formatTime(lastPollTime[(uint8_t)pc]);
}

String totalEnergyText(uint16_t kwhPartReg, uint16_t mwhReg) {
  double v = combineEnergy(kwhPartReg, mwhReg);
  return isnan(v) ? "n/a" : String(v, 0) + " kWh";
}

void appendAllRegistersTable(String &html) {
  html += "<details><summary>All 78 discovered Modbus registers</summary>";
  html += "<div class='tablewrap'><table><thead><tr><th>Reg</th><th>Name</th><th>Value</th><th>Group</th></tr></thead><tbody>";
  for (size_t i = 0; i < REG_COUNT; i++) {
    RegisterDef &r = regs[i];
    html += "<tr><td>FC" + String(r.fc) + " / " + String(r.reg) + "</td><td>" + String(r.name) + "</td><td>";
    if (r.valid) {
      html += String(r.value, displayDigits(r));
      if (strlen(r.unit)) html += " " + String(r.unit);
    } else if (r.raw == 0x9000 && r.reg == 1508) {
      html += "OFF";
    } else {
      html += "n/a";
    }
    html += "</td><td>" + String(pollClassName(r.pollClass)) + "</td></tr>";
  }
  html += "</tbody></table></div></details>";
}

// ============================================================
// Web page
// ============================================================

void handleRoot() {
  String html;
  html.reserve(26000);

  html += R"HTML(<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="30">
<title>ISG Logger</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1f2937;background:#f4f6f8}
body{margin:0}.wrap{max-width:1100px;margin:auto;padding:18px}.top{display:flex;gap:12px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}
h1{font-size:1.55rem;margin:.1rem 0}.muted{color:#6b7280;font-size:.9rem}.pill{display:inline-block;padding:.25rem .55rem;border-radius:999px;background:#e5e7eb;margin:.1rem .2rem .1rem 0;font-size:.78rem}.ok{color:#087f5b}.bad{color:#b42318}
nav{position:sticky;top:0;background:#f4f6f8;padding:.55rem 0;z-index:2;white-space:nowrap;overflow:auto}nav a{color:#334155;text-decoration:none;margin-right:.8rem;font-weight:600;font-size:.9rem}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:10px;margin:14px 0}.card{background:white;border-radius:12px;padding:13px;box-shadow:0 1px 3px #00000014}.cardlabel{font-size:.82rem;color:#6b7280}.cardvalue{font-size:1.45rem;font-weight:700;margin-top:.2rem}.cardsub{font-size:.75rem;color:#6b7280;margin-top:.2rem}
section{background:white;border-radius:12px;padding:14px;margin:12px 0;box-shadow:0 1px 3px #00000014}h2{font-size:1.05rem;margin:.1rem 0 .65rem}table{border-collapse:collapse;width:100%}td,th{padding:.48rem .35rem;border-bottom:1px solid #e5e7eb;text-align:left}td:last-child{width:42%;text-align:right}.note{display:block;color:#6b7280;font-size:.72rem;font-weight:400}.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:12px}.tablewrap{overflow:auto}summary{cursor:pointer;font-weight:700;padding:.8rem 0}.footer{font-size:.8rem;color:#6b7280;margin:14px 0}a{color:#2563eb}
</style></head><body><div class="wrap">)HTML";

  html += "<div class='top'><div><h1>STIEBEL ELTRON ISG Logger</h1><div class='muted'>ESP32-GATEWAY Rev.C · " + ETH.localIP().toString() + "</div></div>";
  html += "<div><span class='pill'>Live: 1 min</span><span class='pill'>Energy: 5 min</span><span class='pill'>Config: 15 min</span></div></div>";

  html += "<nav><a href='#live'>Live</a><a href='#heating'>Heating & DHW</a><a href='#energy'>Energy</a><a href='#diag'>System & diagnostics</a><a href='#all'>All registers</a><a href='/files'>CSV files</a><a href='/api/current'>JSON</a></nav>";

  html += "<section id='live'><h2>Live operation</h2><div class='cards'>";
  htmlCard(html, "Outside", registerDisplay(4, 507));
  htmlCard(html, "Flow", registerDisplay(4, 543));
  htmlCard(html, "Return", registerDisplay(4, 542));
  htmlCard(html, "Delta T", isnan(hpDeltaT()) ? "n/a" : String(hpDeltaT(), 1) + " K");
  htmlCard(html, "Flow rate", registerDisplay(4, 548));
  htmlCard(html, "Thermal power", isnan(thermalPowerKw()) ? "n/a" : String(thermalPowerKw(), 2) + " kW", "hydraulic estimate");
  htmlCard(html, "DHW", registerDisplay(4, 522), "target " + registerDisplay(4, 523));
  htmlCard(html, "Compressor", onOff(regOn(4, 2542)));
  html += "</div>";

  html += "<div class='two'><table>";
  htmlRow(html, "Operating mode", operatingModeName(regRaw(3, 1501)));
  htmlRow(html, "HC1 pump", onOff(regOn(4, 2509)));
  htmlRow(html, "Buffer charging pump", onOff(regOn(4, 2512)));
  htmlRow(html, "DHW charging pump", onOff(regOn(4, 2514)));
  htmlRow(html, "DHW circulation pump", onOff(regOn(4, 2517)));
  htmlRow(html, "Defrost", onOff(regOn(4, 2506)));
  html += "</table><table>";
  htmlRow(html, "Hot gas", registerDisplay(4, 544));
  htmlRow(html, "Low pressure", registerDisplay(4, 545));
  htmlRow(html, "High pressure", registerDisplay(4, 547));
  htmlRow(html, "Pressure ratio", isnan(pressureRatio()) ? "n/a" : String(pressureRatio(), 2));
  htmlRow(html, "DHW target gap", isnan(dhwDeltaTarget()) ? "n/a" : String(dhwDeltaTarget(), 1) + " K");
  htmlRow(html, "Last live poll", lastPollText(POLL_LIVE), "errors: " + String(lastPollErrors[POLL_LIVE]));
  html += "</table></div></section>";

  html += "<section id='heating'><h2>Heating & DHW settings</h2><div class='two'><table>";
  htmlRow(html, "HC1 actual", registerDisplay(4, 508));
  htmlRow(html, "HC1 target", registerDisplay(4, 510));
  htmlRow(html, "Comfort temperature", registerDisplay(3, 1502));
  htmlRow(html, "ECO temperature", registerDisplay(3, 1503));
  htmlRow(html, "Heating curve slope", registerDisplay(3, 1504, 2));
  htmlRow(html, "Heating bivalence", registerDisplay(3, 1509));
  html += "</table><table>";
  htmlRow(html, "Buffer actual", registerDisplay(4, 518));
  htmlRow(html, "Buffer target", registerDisplay(4, 519));
  htmlRow(html, "DHW actual", registerDisplay(4, 522));
  htmlRow(html, "DHW target", registerDisplay(4, 523));
  htmlRow(html, "DHW ECO temperature", registerDisplay(3, 1511));
  htmlRow(html, "DHW stages", registerDisplay(3, 1512, 0));
  htmlRow(html, "DHW bivalence", registerDisplay(3, 1513));

  RegisterDef *fixed = findReg(3, 1508);
  String fixedText = (fixed && fixed->raw == 0x9000) ? "OFF" : registerDisplay(3, 1508);
  htmlRow(html, "Fixed-value operation", fixedText);
  html += "</table></div><div class='muted'>Configuration values are refreshed every 15 minutes; operating mode is refreshed every minute.</div></section>";

  html += "<section id='energy'><h2>Energy</h2><div class='cards'>";
  htmlCard(html, "Heat today · heating", registerDisplay(4, 3501, 0));
  htmlCard(html, "Electricity today · heating", registerDisplay(4, 3511, 0));
  htmlCard(html, "Heat today · DHW", registerDisplay(4, 3504, 0));
  htmlCard(html, "Electricity today · DHW", registerDisplay(4, 3514, 0));
  htmlCard(html, "Heating efficiency", isnan(heatingEfficiency()) ? "n/a" : String(heatingEfficiency(), 2));
  htmlCard(html, "DHW efficiency", isnan(dhwEfficiency()) ? "n/a" : String(dhwEfficiency(), 2));
  html += "</div><div class='two'><table>";
  htmlRow(html, "Heat heating total", totalEnergyText(3502, 3503));
  htmlRow(html, "Electricity heating total", totalEnergyText(3512, 3513));
  htmlRow(html, "Heat DHW total", totalEnergyText(3505, 3506));
  htmlRow(html, "Electricity DHW total", totalEnergyText(3515, 3516));
  htmlRow(html, "Aux heat heating total", totalEnergyText(3507, 3508));
  htmlRow(html, "Aux heat DHW total", totalEnergyText(3509, 3510));
  html += "</table><table>";
  htmlRow(html, "HP1 heating efficiency", isnan(hp1HeatingEfficiency()) ? "n/a" : String(hp1HeatingEfficiency(), 2));
  htmlRow(html, "HP1 DHW efficiency", isnan(hp1DhwEfficiency()) ? "n/a" : String(hp1DhwEfficiency(), 2));
  htmlRow(html, "Aux stage 1 runtime", registerDisplay(4, 3546, 0));
  htmlRow(html, "Aux stage 2 runtime", registerDisplay(4, 3547, 0));
  htmlRow(html, "Aux stage 1+2 runtime", registerDisplay(4, 3548, 0));
  htmlRow(html, "Last energy poll", lastPollText(POLL_ENERGY), "errors: " + String(lastPollErrors[POLL_ENERGY]));
  html += "</table></div></section>";

  bool fault = regOn(4, 2504);
  bool canOk = regRaw(4, 2505, 999) == 0;
  html += "<section id='diag'><h2>System & diagnostics</h2><div class='two'><table>";
  htmlRow(html, "System status", okFault(fault));
  htmlRow(html, "CAN bus", canOk ? "OK" : "Status " + String(regRaw(4, 2505)));
  htmlRow(html, "Active error number", String(regRaw(4, 2507)));
  htmlRow(html, "Message number", String(regRaw(4, 2508)));
  htmlRow(html, "Power-off status", String(regRaw(4, 2502)));
  htmlRow(html, "Operating status", operatingStatusText(regRaw(4, 2501)), "raw: " + String(regRaw(4, 2501)));
  html += "</table><table>";
  htmlRow(html, "SG Ready", regRaw(3, 4001) == 1 ? "Enabled" : "Disabled");
  htmlRow(html, "SG Ready input 1", onOff(regOn(3, 4002)));
  htmlRow(html, "SG Ready input 2", onOff(regOn(3, 4003)));
  htmlRow(html, "SG Ready state", sgStateName(regRaw(4, 5001)));
  htmlRow(html, "Controller", controllerName(regRaw(4, 5002)));
  htmlRow(html, "Ethernet", ethernetConnected ? "UP · " + ETH.localIP().toString() : "DOWN");
  htmlRow(html, "microSD", sdMounted ? "Mounted" : "Unavailable");
  htmlRow(html, "Total Modbus errors", String(totalModbusErrors));
  htmlRow(html, "Last config poll", lastPollText(POLL_CONFIG), "errors: " + String(lastPollErrors[POLL_CONFIG]));
  html += "</table></div></section>";

  html += "<section id='all'><h2>Register inventory</h2><div class='muted'>This table contains every register that was confirmed as available in the discovery scan. Slow-changing values are cached between polls.</div>";
  appendAllRegistersTable(html);
  html += "</section>";

  html += "<div class='footer'>CSV snapshot every minute · file: " + currentLogFilename() + " · page refresh: 30 s · <a href='/health'>health</a></div>";
  html += "</div></body></html>";

  server.send(200, "text/html; charset=utf-8", html);
}

// ============================================================
// JSON API: all 78 values + derived metrics
// ============================================================

void handleApiCurrent() {
  String json;
  json.reserve(14000);
  json += "{\"timestamp\":\"" + formatTime(time(nullptr)) + "\",\"ip\":\"" + ETH.localIP().toString() + "\",\"values\":{";

  for (size_t i = 0; i < REG_COUNT; i++) {
    if (i) json += ',';
    json += "\"" + String(regs[i].name) + "\":";
    if (regs[i].valid) json += String(regs[i].value, displayDigits(regs[i]));
    else json += "null";
  }

  json += "},\"derived\":{";
  json += "\"heatpump1_deltaT_K\":" + (isnan(hpDeltaT()) ? String("null") : String(hpDeltaT(), 2));
  json += ",\"thermal_power_kW\":" + (isnan(thermalPowerKw()) ? String("null") : String(thermalPowerKw(), 3));
  json += ",\"pressure_ratio\":" + (isnan(pressureRatio()) ? String("null") : String(pressureRatio(), 3));
  json += ",\"dhw_delta_target_K\":" + (isnan(dhwDeltaTarget()) ? String("null") : String(dhwDeltaTarget(), 2));
  json += ",\"heating_efficiency\":" + (isnan(heatingEfficiency()) ? String("null") : String(heatingEfficiency(), 3));
  json += ",\"dhw_efficiency\":" + (isnan(dhwEfficiency()) ? String("null") : String(dhwEfficiency(), 3));
  json += ",\"hp1_heating_efficiency\":" + (isnan(hp1HeatingEfficiency()) ? String("null") : String(hp1HeatingEfficiency(), 3));
  json += ",\"hp1_dhw_efficiency\":" + (isnan(hp1DhwEfficiency()) ? String("null") : String(hp1DhwEfficiency(), 3));
  json += "},\"polling\":{\"live_s\":60,\"energy_s\":300,\"config_s\":900}";
  json += ",\"errors\":{\"live\":" + String(lastPollErrors[POLL_LIVE]) + ",\"energy\":" + String(lastPollErrors[POLL_ENERGY]) + ",\"config\":" + String(lastPollErrors[POLL_CONFIG]) + ",\"total\":" + String(totalModbusErrors) + "}}";

  server.send(200, "application/json", json);
}

// ============================================================
// CSV files
// ============================================================

void handleFiles() {
  if (!sdMounted) {
    server.send(503, "text/plain", "SD card unavailable");
    return;
  }

  File root = SD_MMC.open("/");
  if (!root) {
    server.send(500, "text/plain", "Could not open SD root");
    return;
  }

  String html = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>ISG CSV files</title><style>body{font-family:system-ui;max-width:800px;margin:2rem auto;padding:0 1rem}li{margin:.6rem 0}</style></head><body><h1>ISG CSV files</h1><ul>";

  File file = root.openNextFile();
  while (file) {
    if (!file.isDirectory()) {
      String name = String(file.name());
      if (name.endsWith(".csv")) {
        String path = name;
        if (!path.startsWith("/")) path = "/" + path;
        html += "<li><a href='/download?file=" + path + "'>" + name + "</a> · " + String(file.size()) + " bytes</li>";
      }
    }
    file.close();
    file = root.openNextFile();
  }
  root.close();

  html += "</ul><p><a href='/'>Back</a></p></body></html>";
  server.send(200, "text/html; charset=utf-8", html);
}

void handleDownload() {
  if (!sdMounted) {
    server.send(503, "text/plain", "SD card unavailable");
    return;
  }
  if (!server.hasArg("file")) {
    server.send(400, "text/plain", "Missing file parameter");
    return;
  }

  String path = server.arg("file");
  if (!path.startsWith("/") || path.indexOf("..") >= 0 || !path.endsWith(".csv")) {
    server.send(400, "text/plain", "Invalid path");
    return;
  }
  if (!SD_MMC.exists(path)) {
    server.send(404, "text/plain", "File not found");
    return;
  }

  File file = SD_MMC.open(path, FILE_READ);
  if (!file) {
    server.send(500, "text/plain", "Could not open file");
    return;
  }

  String filename = String(file.name());
  server.sendHeader("Content-Disposition", "attachment; filename=\"" + filename + "\"");
  server.streamFile(file, "text/csv");
  file.close();
}

void initWebServer() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/api/current", HTTP_GET, handleApiCurrent);
  server.on("/files", HTTP_GET, handleFiles);
  server.on("/download", HTTP_GET, handleDownload);
  server.on("/health", HTTP_GET, []() {
    String status = "OK\nIP=" + ETH.localIP().toString() + "\nSD=" + String(sdMounted ? "mounted" : "unavailable") + "\nREGISTERS=" + String(REG_COUNT) + "\n";
    server.send(200, "text/plain", status);
  });
  server.onNotFound([]() { server.send(404, "text/plain", "Not found"); });
  server.begin();
  Serial.println("[HTTP] Server started");
}

// ============================================================
// Console summary
// ============================================================

void printLiveSummary() {
  Serial.print("[ISG] Outside: ");
  Serial.print(regValue(4, 507), 1);
  Serial.print(" C | Flow/Return: ");
  Serial.print(regValue(4, 543), 1);
  Serial.print(" / ");
  Serial.print(regValue(4, 542), 1);
  Serial.print(" C | Flow rate: ");
  Serial.print(regValue(4, 548), 1);
  Serial.print(" l/min | Thermal: ");
  Serial.print(thermalPowerKw(), 2);
  Serial.print(" kW | DHW: ");
  Serial.print(regValue(4, 522), 1);
  Serial.print(" C | Compressor: ");
  Serial.print(regOn(4, 2542) ? "ON" : "OFF");
  Serial.print(" | Live errors: ");
  Serial.println(lastPollErrors[POLL_LIVE]);
}

// ============================================================
// Setup / loop
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("======================================");
  Serial.println("STIEBEL ELTRON ISG Logger v2");
  Serial.println("OLIMEX ESP32-GATEWAY Rev.C");
  Serial.print("Configured registers: ");
  Serial.println(REG_COUNT);
  Serial.println("======================================");

  sdMounted = initSD();
  lastSdRetry = millis();

  Network.onEvent(onNetworkEvent);
  Serial.println("[ETH] Initializing Rev.C PHY...");
  ETH.begin();

  uint32_t start = millis();
  while (!ethernetConnected && millis() - start < 15000) delay(100);

  initWebServer();

  if (ethernetConnected) {
    initTime();
    pollGroup(POLL_LIVE);
    pollGroup(POLL_ENERGY);
    pollGroup(POLL_CONFIG);
    printLiveSummary();
    if (sdMounted && saveSnapshot()) Serial.println("[SD] Initial snapshot saved");
  } else {
    Serial.println("[ETH] No network yet; polling will start after link/IP is available");
  }
}

void loop() {
  server.handleClient();

  if (!sdMounted && (uint32_t)(millis() - lastSdRetry) >= SD_RETRY_MS) {
    lastSdRetry = millis();
    sdMounted = initSD();
  }

  if (ethernetConnected && !timeSynchronized && (lastNtpAttempt == 0 || (uint32_t)(millis() - lastNtpAttempt) >= NTP_RETRY_MS)) {
    initTime();
  }

  if (ethernetConnected && groupDue(POLL_LIVE)) {
    pollGroup(POLL_LIVE);

    // Refresh slower groups when due before writing the one-minute snapshot.
    if (groupDue(POLL_ENERGY)) pollGroup(POLL_ENERGY);
    if (groupDue(POLL_CONFIG)) pollGroup(POLL_CONFIG);

    printLiveSummary();

    if (sdMounted) {
      if (saveSnapshot()) Serial.println("[SD] Snapshot saved");
      else Serial.println("[SD] Snapshot write failed");
    }
  }

  // If the board came online after boot, initialize all groups immediately.
  if (ethernetConnected && lastPollMillis[POLL_LIVE] == 0) {
    if (!timeSynchronized) initTime();
    pollGroup(POLL_LIVE);
    pollGroup(POLL_ENERGY);
    pollGroup(POLL_CONFIG);
    printLiveSummary();
    if (sdMounted) saveSnapshot();
  }

  delay(2);
}
