#include <PubSubClient.h>
#include <WiFi.h>
#include <HTTPClient.h>

// --- Configuration Wi-Fi ---
const char* ssid          = "Orange_wifi_B6F9";
const char* password      = "h2ht8BqRdbL";

// --- Configuration MQTT ThingsBoard ---
const char* mqtt_server   = "mqtt.thingsboard.cloud";
const char* mqtt_user     = "B8xOnADQmS2LxkBVEg1L";
const char* mqtt_password = "";
const char* mqtt_topic    = "v1/devices/me/telemetry";

// --- Définition des pins ---
#define TRIG_PIN 5
#define ECHO_PIN 18
#define LED_ROUGE 2
#define LED_VERTE 16

// --- Configuration du parking ---
#define PLACE_ID 1  // ID de la place de parking
#define DISTANCE_SEUIL 20  // Distance seuil en cm pour considérer la place comme occupée

WiFiClient espClient;
PubSubClient client(espClient);

// Configuration du serveur backend
const char* serverUrl = "http://192.168.1.114:3001";

// Fonction pour configurer la connexion WiFi
void setup_wifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("Connexion au Wi-Fi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWi-Fi connecté !");
  Serial.print("Adresse IP : ");
  Serial.println(WiFi.localIP());
}

// Fonction pour reconnecter au broker MQTT
void reconnect_mqtt() {
  Serial.print("Connexion au broker MQTT...");
  while (!client.connected()) {
    String clientId = "ESP32Client-" + String(random(0xffff), HEX);
    if (client.connect(clientId.c_str(), mqtt_user, mqtt_password)) {
      Serial.println("Connecté !");
    } else {
      Serial.print("Échec, rc=");
      Serial.print(client.state());
      Serial.println(" nouvelle tentative dans 2s...");
      delay(2000);
    }
  }
}

// Fonction pour lire la distance avec le capteur HC-SR04
float readDistanceCM() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 23200L);
  if (duration == 0) {
    Serial.println("Erreur de lecture HC-SR04");
    return -1;
  }

  return (duration * 0.0343) / 2.0;
}

// Fonction pour envoyer une alerte SMS
void envoyerAlerteSMS(float distance) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin("http://192.168.1.114:3001/api/send-sms");
    http.addHeader("Content-Type", "application/json");

    String jsonPayload = "{\"distance\": " + String(distance) + "}";
    int httpResponseCode = http.POST(jsonPayload);

    if (httpResponseCode > 0) {
      Serial.println("✅ SMS envoyé !");
    } else {
      Serial.println("❌ Erreur SMS : " + String(httpResponseCode));
    }

    http.end();
  } else {
    Serial.println("WiFi non connecté !");
  }
}

// Fonction pour envoyer l'état au backend
void updateParkingStatus(float distance) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    
    // Construire l'URL avec l'ID de la place
    String url = String(serverUrl) + "/api/parking-spots/" + String(PLACE_ID) + "/status";
    
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    // Créer le JSON avec la distance
    String jsonData = "{\"distance\":" + String(distance) + "}";
    
    int httpCode = http.POST(jsonData);
    
    if (httpCode > 0) {
      String response = http.getString();
      Serial.println("Réponse du serveur: " + response);
      
      //start modification de claude
      // Vérifier si la place est réservée
      if (response.indexOf("\"status\":\"réservé\"") != -1 || response.indexOf("Place réservée") != -1) {
        Serial.println("Place réservée détectée");
        // Allumer la LED rouge pour les places réservées
        digitalWrite(LED_ROUGE, HIGH);
        digitalWrite(LED_VERTE, LOW);
      } else {
        // Mise à jour normale si la place n'est pas réservée
        if (distance < DISTANCE_SEUIL) {
          digitalWrite(LED_ROUGE, HIGH);
          digitalWrite(LED_VERTE, LOW);
        } else {
          digitalWrite(LED_ROUGE, LOW);
          digitalWrite(LED_VERTE, HIGH);
        }
      }
      //end modification de claude
    } else {
      Serial.println("Erreur HTTP: " + String(httpCode));
    }
    
    http.end();
  }
}

// Fonction pour envoyer l'alerte email via le serveur
void envoyerAlerteEmail(float distance) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin("http://192.168.1.114:3001/api/send-email");
    http.addHeader("Content-Type", "application/json");

    String jsonPayload = "{\"distance\": " + String(distance) + "}";
    int httpResponseCode = http.POST(jsonPayload);

    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("✅ Email envoyé via le serveur !");
    } else {
      Serial.println("❌ Erreur envoi email : " + String(httpResponseCode));
    }

    http.end();
  } else {
    Serial.println("WiFi non connecté !");
  }
}

// --- Publication MQTT ---
void publishDistance(float dist) {
  if (dist < 0 || !client.connected()) return;

  String etat = dist <= 10 ? "Occupe" : "Libre";
  String payloadEtat = "{\"etat\": \"" + etat + "\"}";
  String payloadDist = "{\"distance\": " + String(dist, 1) + "}";

  Serial.print("Publie état : ");
  Serial.println(payloadEtat);
  if (client.publish(mqtt_topic, payloadEtat.c_str())) {
    Serial.println("Publié avec succès (état)");
  } else {
    Serial.println("Échec de publication (état)");
  }

  Serial.print("Publie distance : ");
  Serial.println(payloadDist);
  if (client.publish(mqtt_topic, payloadDist.c_str())) {
    Serial.println("Publié avec succès (distance)");
  } else {
    Serial.println("Échec de publication (distance)");
  }
}

// --- Setup ---
void setup() {
  Serial.begin(115200);
  Serial.println("Démarrage ESP32 + HC-SR04 + MQTT");

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_ROUGE, OUTPUT);
  pinMode(LED_VERTE, OUTPUT);

  digitalWrite(LED_ROUGE, LOW);
  digitalWrite(LED_VERTE, LOW);

  setup_wifi();
  client.setServer(mqtt_server, 1883);
}

// --- Boucle principale ---
void loop() {
  if (!client.connected()) {
    reconnect_mqtt();
  }
  client.loop();

  float distance = readDistanceCM();
  Serial.printf("Distance mesurée : %.1f cm\n", distance);

  if (distance > 0) {
    static unsigned long lastBackendUpdate = 0;
    if (millis() - lastBackendUpdate > 5000) { // Mise à jour toutes les 5 secondes
      lastBackendUpdate = millis();
      updateParkingStatus(distance);
    }

    static unsigned long lastEmailTime = 0;
    if (distance <= DISTANCE_SEUIL && millis() - lastEmailTime > 60000) {
      lastEmailTime = millis();
      envoyerAlerteEmail(distance);
      envoyerAlerteSMS(distance);
    }
  }

  static unsigned long lastPublish = 0;
  if (millis() - lastPublish > 10000) {
    lastPublish = millis();
    publishDistance(distance);
  }

  delay(2000);
}