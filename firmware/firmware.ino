// ===== ESP32 GATE CONTROL - SYNCHRONIZED VERSION =====
// Đồng bộ GPIO và Web thông qua MQTT
// Based on working reference code

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ===== WIFI =====
const char* ssid = "IKIGAI";
const char* password = "xincamon";

// ===== MQTT =====
const char* mqtt_server = "broker.emqx.io";
const int mqtt_port = 1883;
const char* mqtt_user = "bathanh0309";
const char* mqtt_pass = "bathanh0309";

WiFiClient espClient;
PubSubClient client(espClient);

// ===== GPIO =====
#define BTN_IN    4   // Nút IN
#define BTN_OUT   5   // Nút OUT
#define LED_IN    0   // Đèn IN (GPIO 0)
#define LED_OUT   1   // Đèn OUT (GPIO 1)

bool gateInOpen = false;
bool gateOutOpen = false;

// ===== TOPICS =====
const char* TOPIC_IN_CMD = "gate/in/cmd";
const char* TOPIC_OUT_CMD = "gate/out/cmd";
const char* TOPIC_STATUS = "gate/status";
const char* TOPIC_PLATE = "bienso/cmd";

// ===== FUNCTIONS =====
// Buttons only send TOGGLE commands - LED state controlled by web via callback
void sendToggleCommandIn() {
  if (client.connected()) {
    client.publish(TOPIC_IN_CMD, "TOGGLE");
    Serial.println("[Button→MQTT] IN TOGGLE sent");
  } else {
    Serial.println("[Button] IN pressed but MQTT disconnected");
  }
}

void sendToggleCommandOut() {
  if (client.connected()) {
    client.publish(TOPIC_OUT_CMD, "TOGGLE");
    Serial.println("[Button→MQTT] OUT TOGGLE sent");
  } else {
    Serial.println("[Button] OUT pressed but MQTT disconnected");
  }
}

void callback(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }
  
  Serial.print("MQTT: ");
  Serial.print(topic);
  Serial.print(" -> ");
  Serial.println(msg);
  
  // Xử lý gate/status từ server (JSON format) - Web là master
  if (String(topic) == TOPIC_STATUS) {
    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, msg);
    
    if (!error) {
      String inState = doc["in"];
      String outState = doc["out"];
      
      // Cập nhật trạng thái cổng IN theo Web
      bool shouldInOpen = (inState == "ON");
      if (shouldInOpen != gateInOpen) {
        gateInOpen = shouldInOpen;
        digitalWrite(LED_IN, gateInOpen ? HIGH : LOW);
        Serial.printf("[Web→GPIO] IN LED %s\n", gateInOpen ? "ON" : "OFF");
      }
      
      // Cập nhật trạng thái cổng OUT theo Web
      bool shouldOutOpen = (outState == "ON");
      if (shouldOutOpen != gateOutOpen) {
        gateOutOpen = shouldOutOpen;
        digitalWrite(LED_OUT, gateOutOpen ? HIGH : LOW);
        Serial.printf("[Web→GPIO] OUT LED %s\n", gateOutOpen ? "ON" : "OFF");
      }
    } else {
      Serial.println("[Error] Invalid JSON in gate/status");
    }
  }
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("MQTT connecting...");
    String clientId = "VisionGate_ESP32_" + String(random(0xffff), HEX);
    
    if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
      Serial.println("OK");
      
      // Subscribe to topics
      client.subscribe(TOPIC_STATUS, 1);      // Main status topic from server
      client.subscribe(TOPIC_IN_CMD, 1);      // Backup (not used anymore)
      client.subscribe(TOPIC_OUT_CMD, 1);     // Backup (not used anymore)
      
      Serial.println("[MQTT] ✓ Subscribed to:");
      Serial.println("  - gate/status");
      Serial.println("  - gate/in/cmd");
      Serial.println("  - gate/out/cmd");
    } else {
      Serial.printf("FAILED (rc=%d)\n", client.state());
      delay(500);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(100);
  
  Serial.println("\n========================================");
  Serial.println("  ESP32 Gate Control - Synchronized");
  Serial.println("========================================\n");
  
  // GPIO
  pinMode(BTN_IN, INPUT_PULLUP);
  pinMode(BTN_OUT, INPUT_PULLUP);
  pinMode(LED_IN, OUTPUT);
  pinMode(LED_OUT, OUTPUT);
  
  digitalWrite(LED_IN, LOW);
  digitalWrite(LED_OUT, LOW);
  
  Serial.println("[GPIO] ✓ Pins initialized");
  Serial.printf("  - LED IN: GPIO %d\n", LED_IN);
  Serial.printf("  - LED OUT: GPIO %d\n", LED_OUT);
  Serial.printf("  - BTN IN: GPIO %d\n", BTN_IN);
  Serial.printf("  - BTN OUT: GPIO %d\n", BTN_OUT);
  
  // WiFi
  Serial.printf("\n[WiFi] Connecting to '%s'", ssid);
  WiFi.begin(ssid, password);
  
  int timeout = 0;
  while (WiFi.status() != WL_CONNECTED && timeout < 30) {
    delay(300);
    Serial.print(".");
    timeout++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" ✓");
    Serial.print("[WiFi] IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(" ✗ FAILED!");
  }
  
  // MQTT
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
  client.setKeepAlive(60);
  
  Serial.println("\n[MQTT] Configured");
  Serial.printf("  - Broker: %s:%d\n", mqtt_server, mqtt_port);
  
  Serial.println("\n========================================");
  Serial.println("  System Ready!");
  Serial.println("========================================\n");
}

void loop() {
  // MQTT connection
  if (WiFi.status() == WL_CONNECTED) {
    if (!client.connected()) {
      reconnect();
    }
    client.loop();
  }
  
  // Nút IN (GPIO 4) - Chỉ gửi lệnh lên MQTT, không điều khiển LED
  static bool lastBtnIn = HIGH;
  bool btnIn = digitalRead(BTN_IN);
  if (lastBtnIn == HIGH && btnIn == LOW) {
    Serial.println("[Button] IN pressed");
    sendToggleCommandIn();
    delay(200);
  }
  lastBtnIn = btnIn;
  
  // Nút OUT (GPIO 5) - Chỉ gửi lệnh lên MQTT, không điều khiển LED
  static bool lastBtnOut = HIGH;
  bool btnOut = digitalRead(BTN_OUT);
  if (lastBtnOut == HIGH && btnOut == LOW) {
    Serial.println("[Button] OUT pressed");
    sendToggleCommandOut();
    delay(200);
  }
  lastBtnOut = btnOut;
  
  delay(10);
}