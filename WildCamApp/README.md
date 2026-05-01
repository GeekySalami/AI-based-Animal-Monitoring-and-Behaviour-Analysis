# 🐾 WildCamApp — Android IP Camera for WildCam AI

An Android application that turns your phone into an IP camera, serving live MJPEG video and GPS coordinates over HTTP. Designed to integrate with the WildCam AI backend for real-time animal detection and behaviour analysis.

## Features

- 📹 **Live MJPEG Stream** at `http://<phone-ip>:8080/video`
- 📍 **GPS Coordinates** at `http://<phone-ip>:8080/location`
- 🌐 **Network Discoverable** — uses the phone's WiFi/Hotspot IP
- 📱 **Live Preview** — see what the camera sees on-screen
- 🌙 **Dark Theme** — easy on the eyes during fieldwork

## Endpoints

| Endpoint | Method | Content-Type | Description |
|:---------|:-------|:-------------|:------------|
| `/video` | GET | `multipart/x-mixed-replace` | MJPEG video stream from back camera |
| `/location` | GET | `application/json` | `{"latitude": 12.34, "longitude": 76.54}` |
| `/` | GET | `text/html` | Status page with embedded stream preview |

---

## 🚀 How to Deploy on Your Android Phone

### Option 1: Android Studio (Recommended)

1. **Install Android Studio** from [developer.android.com/studio](https://developer.android.com/studio)

2. **Open the project**:
   - Launch Android Studio
   - Click **File → Open**
   - Navigate to `overhaul/WildCamApp/` and click **OK**
   - Wait for Gradle sync to complete (first time may take 5-10 minutes)

3. **Connect your phone**:
   - Enable **Developer Options** on your phone:
     - Go to **Settings → About Phone**
     - Tap **Build Number** 7 times
   - Enable **USB Debugging**:
     - Go to **Settings → Developer Options**
     - Enable **USB Debugging**
   - Connect phone via USB cable
   - Tap **Allow** on the USB debugging prompt on your phone

4. **Build and install**:
   - Select your phone from the device dropdown in the toolbar
   - Click the **▶ Run** button (or press `Shift+F10`)
   - The app will be built and installed automatically

### Option 2: Command Line (Without Android Studio)

If you have the Android SDK installed:

```bash
cd overhaul/WildCamApp/

# Build the debug APK
./gradlew assembleDebug

# The APK will be at:
# app/build/outputs/apk/debug/app-debug.apk

# Install on connected phone (USB debugging must be enabled)
adb install app/build/outputs/apk/debug/app-debug.apk
```

### Option 3: Transfer APK Directly

1. Build the APK using either method above
2. Transfer `app-debug.apk` to your phone (via USB, email, Google Drive, etc.)
3. On your phone:
   - Open the APK file
   - Enable **Install from unknown sources** if prompted
   - Tap **Install**

---

## Usage

1. **Launch WildCamApp** on your phone
2. **Grant permissions** (Camera and Location) when prompted
3. **Connect to WiFi** (or create a hotspot)
4. **Tap "Start Server"** — the app will display:
   - Your network IP address (e.g., `192.168.1.5:8080`)
   - Active endpoint URLs
5. **Test from any device** on the same network:
   - Browser: `http://192.168.1.5:8080/video`
   - VLC: `http://192.168.1.5:8080/video`
   - API: `http://192.168.1.5:8080/location`

### Integration with WildCam AI

1. Open the WildCam AI dashboard at `http://localhost:3000`
2. In the sidebar, enter your phone's IP: `192.168.1.5:8080`
3. Click **Register Camera**
4. Click **START ALL CAMERAS**
5. The backend will connect to your phone's camera stream and begin AI analysis

---

## Requirements

- Android 8.0 (API 26) or higher
- Camera hardware
- GPS capability
- WiFi or Hotspot connection

## Permissions Required

| Permission | Purpose |
|:-----------|:--------|
| Camera | Capture video for streaming |
| Fine Location | GPS coordinates for the `/location` endpoint |
| Internet | Serve the HTTP endpoints |
| Wake Lock | Keep screen on during streaming |

---

## Troubleshooting

| Issue | Solution |
|:------|:---------|
| "No network connection" | Ensure WiFi is connected or Hotspot is active |
| Server won't start | Check if port 8080 is already in use by another app |
| No GPS coordinates | Ensure Location is enabled in phone Settings |
| Stream not loading in browser | Verify you're on the same WiFi network |
| Black preview | Grant Camera permission in Settings → Apps → WildCam |
