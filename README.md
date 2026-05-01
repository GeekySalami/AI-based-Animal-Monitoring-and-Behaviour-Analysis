# 🐾 WildCam AI — AI-Based Animal Monitoring & Behaviour Analysis

> A full-stack, real-time wildlife surveillance platform that uses **YOLOv8 object detection** and **Ollama-powered vision-language models** to automatically detect, count, track, and analyse the behaviour of animals from IP camera feeds.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Database Models](#database-models)
- [Backend — Django REST API](#backend--django-rest-api)
  - [App: `animaldet` — Real-Time Detection Engine](#app-animaldet--real-time-detection-engine)
  - [App: `animaldb` — Historical Data & Analytics API](#app-animaldb--historical-data--analytics-api)
- [Frontend — Next.js Dashboard](#frontend--nextjs-dashboard)
  - [Pages](#pages)
  - [Components](#components)
- [API Reference](#api-reference)
  - [Detection & Streaming Endpoints (`/det/`)](#detection--streaming-endpoints-det)
  - [Animal Data Endpoints (`/animals/`)](#animal-data-endpoints-animals)
  - [Camera Data Endpoints (`/cameras/`)](#camera-data-endpoints-cameras)
- [Core Functions Reference](#core-functions-reference)
- [Configuration & Tuning](#configuration--tuning)
- [Setup & Installation](#setup--installation)
- [Running the Application](#running-the-application)
- [Testing](#testing)

---

## Overview

WildCam AI is designed for wildlife conservation and research. It connects to IP cameras deployed in the field (e.g., via a mobile phone running the **WildCamApp**), processes the video stream in real-time using a custom-trained **YOLOv8** model to detect and count animals, and then uses **Ollama (Qwen3-VL)** — a multimodal vision-language model — to classify what the detected animals are *doing* (e.g., resting, eating, running).

All detections, behaviours, and GPS coordinates are stored in a database and displayed on an interactive web dashboard featuring live video feeds, time-series charts, behaviour pie-charts, and geospatial heatmaps.

### Supported Species

| Class Index | Scientific Name       | Common Name         |
|:-----------:|:----------------------|:--------------------|
| 0           | `panthera_leo`        | Lion                |
| 1           | `panthera_pardus`     | Leopard             |
| 2           | `elephas_maximus`     | Asian Elephant      |
| 3           | `panthera_tigris`     | Tiger               |
| 4           | `syncerus_caffer`     | African Buffalo     |
| 5           | `rusa_unicolor`       | Sambar Deer         |

### Recognised Activities

| Activity     | Synonyms / Triggers                                        |
|:-------------|:-----------------------------------------------------------|
| `strolling`  | walking, wandering, roaming, moving slowly, pacing         |
| `chasing`    | pursuing, hunting, stalking, following prey                |
| `resting`    | sleeping, lying down, idle, still, stationary, sitting     |
| `eating`     | feeding, grazing, drinking, foraging, browsing, chewing    |
| `running`    | sprinting, galloping, fleeing, bolting, dashing            |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        WildCam Mobile App                          │
│            (IP Camera: MJPEG /video + GPS /location)               │
└─────────────────────┬───────────────────────────────────────────────┘
                      │  HTTP (MJPEG stream + GPS JSON)
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Django Backend (Port 8000)                      │
│                                                                     │
│  ┌──────────────────────────────┐   ┌────────────────────────────┐  │
│  │    animaldet (Detection)     │   │   animaldb (Data Store)    │  │
│  │                              │   │                            │  │
│  │  • YOLO v8 Tracking         │──▶│  • Animal model (CRUD)     │  │
│  │  • Ollama Activity Analysis  │   │  • Camera model (CRUD)     │  │
│  │  • Multi-camera streaming    │   │  • Filters & Aggregation   │  │
│  │  • SSE Live Stats            │   │  • Yearly/Monthly Summary  │  │
│  │  • Entity deduplication      │   │  • Heatmap data            │  │
│  │  • DB writer thread          │   │                            │  │
│  └──────────────────────────────┘   └────────────────────────────┘  │
│                                                                     │
│                         SQLite (db.sqlite3)                         │
└─────────────────────┬───────────────────────────────────────────────┘
                      │  REST API + SSE + MJPEG
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Next.js Frontend (Port 3000)                      │
│                                                                     │
│   • Live Dashboard (SSE + MJPEG video feeds)                        │
│   • Species Detection Time-Series Chart (Recharts)                  │
│   • Behaviour Pie Chart                                             │
│   • Geospatial Heatmap (Leaflet.js)                                 │
│   • Historical Data Table with filters                              │
│   • Camera Management (CRUD)                                        │
│   • Yearly/Monthly Summary Reports (ShadCN UI)                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend
| Technology              | Purpose                                         |
|:------------------------|:------------------------------------------------|
| **Python 3.10+**        | Core language                                   |
| **Django 5.2**          | Web framework                                   |
| **Django REST Framework** | RESTful API layer                              |
| **django-filter**       | Queryset filtering for API endpoints             |
| **Ultralytics YOLOv8**  | Real-time object detection & tracking            |
| **Ollama (Qwen3-VL:2b-instruct)** | Multimodal activity analysis (VLM)    |
| **OpenCV (cv2)**        | Video capture, frame processing, annotation      |
| **SQLite**              | Default database                                 |
| **CORS Headers**        | Cross-origin access for frontend                 |
| **Threading**           | Concurrent camera capture & inference            |
| **ASGI (Daphne/Uvicorn)** | Async support for SSE & streaming             |

### Frontend
| Technology              | Purpose                                         |
|:------------------------|:------------------------------------------------|
| **Next.js 15.5**        | React framework (App Router, Turbopack)          |
| **React 19 RC**         | UI library                                       |
| **TailwindCSS 4**       | Utility-first styling                            |
| **Recharts**            | Area charts, pie charts for analytics            |
| **Leaflet.js**          | Interactive map & heatmap visualisation           |
| **leaflet.heat**        | Heatmap layer plugin for Leaflet                 |
| **Lucide React**        | Icon library                                     |
| **ShadCN/UI (Radix)**   | Dropdown menus, cards, chart components           |

---

## Project Structure

```
overhaul/
├── backend/
│   └── server/                        # Django project root
│       ├── manage.py                  # Django management CLI
│       ├── db.sqlite3                 # SQLite database file
│       ├── server/                    # Django project settings
│       │   ├── settings.py            # Project configuration
│       │   ├── urls.py                # Root URL routing
│       │   ├── asgi.py                # ASGI application entry
│       │   └── wsgi.py                # WSGI application entry
│       ├── animaldet/                 # Detection & streaming app
│       │   ├── models.py              # ip_address model
│       │   ├── views.py               # YOLO detection, Ollama analysis, streaming
│       │   ├── urls.py                # Detection URL routes
│       │   └── serializers.py         # IP address serializer
│       └── animaldb/                  # Data storage & analytics app
│           ├── models.py              # Animal & Camera models
│           ├── views.py               # CRUD, summaries, heatmap endpoints
│           ├── urls.py                # Data API URL routes
│           ├── serializers.py         # Animal & Camera serializers
│           ├── filters.py             # Django-filter filtersets
│           └── tests.py               # API test suite
│
└── frontend/                          # Next.js application
    ├── package.json                   # Dependencies & scripts
    ├── next.config.mjs                # Next.js configuration
    ├── components.json                # ShadCN/UI component config
    └── src/
        ├── app/
        │   ├── layout.js              # Root layout (Geist font)
        │   ├── page.js                # Main live dashboard
        │   ├── globals.css            # Global styles
        │   ├── retrieve/
        │   │   └── page.js            # Data retrieval page
        │   ├── test/
        │   │   └── page.js            # Test page
        │   └── components/
        │       ├── Heatmap.jsx        # Leaflet heatmap component
        │       ├── AnimalTable.jsx    # Filterable animal data table
        │       ├── Camera.jsx         # Camera list/table component
        │       ├── Camview.jsx        # Single camera viewer with controls
        │       ├── Sumarry.jsx        # Yearly/monthly summary & charts
        │       ├── Ipadd.jsx          # IP address input form
        │       ├── Map.jsx            # Basic map component
        │       └── Mapp.jsx           # Heatmap wrapper component
        ├── components/
        │   └── ui/                    # ShadCN/UI primitives (button, card, chart, etc.)
        └── lib/
            └── utils.js               # Utility functions (cn helper)
```

---

## Database Models

### `ip_address` (App: `animaldet`)

Stores the IP addresses of registered camera devices.

| Field       | Type              | Description                          |
|:------------|:------------------|:-------------------------------------|
| `id`        | AutoField (PK)    | Auto-generated primary key           |
| `ip`        | CharField(100)    | Camera IP address (e.g., `192.168.1.100:8080`) |
| `longitude` | FloatField        | GPS longitude (nullable)             |
| `latitude`  | FloatField        | GPS latitude (nullable)              |
| `timestamp` | DateTimeField     | Auto-set on creation                 |

### `Camera` (App: `animaldb`)

Stores camera metadata for historical records.

| Field       | Type                | Description                        |
|:------------|:--------------------|:-----------------------------------|
| `camera_id` | CharField(50) (PK) | Unique camera identifier           |
| `addtime`   | DateTimeField       | Auto-set on creation               |
| `latitude`  | DecimalField(9,6)   | GPS latitude (nullable)            |
| `longitude` | DecimalField(9,6)   | GPS longitude (nullable)           |

### `Animal` (App: `animaldb`)

Stores every detection event with species, count, behaviour, location, and camera reference.

| Field       | Type              | Description                          |
|:------------|:------------------|:-------------------------------------|
| `id`        | AutoField (PK)    | Auto-generated primary key           |
| `species`   | CharField(100)    | Detected species (e.g., `panthera_leo`) |
| `count`     | IntegerField      | Number of individuals detected       |
| `behaviour` | TextField         | Activity classification              |
| `latitude`  | DecimalField(9,6) | GPS latitude of sighting             |
| `longitude` | DecimalField(9,6) | GPS longitude of sighting            |
| `camera_id` | CharField(50)     | Source camera identifier             |
| `timestamp` | DateTimeField     | Timestamp of the detection           |

---

## Backend — Django REST API

### Root URL Configuration (`server/urls.py`)

```python
urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('animaldb.urls')),         # /animals/, /cameras/
    path('det/', include('animaldet.urls')),     # /det/start_stream/, /det/video_feed/, etc.
]
```

---

### App: `animaldet` — Real-Time Detection Engine

This is the core real-time processing engine. It manages camera connections, runs YOLO inference, performs multimodal activity analysis via Ollama, and streams results.

#### Key Classes

##### `CameraState`
Holds all per-camera runtime state. One instance per active camera stream.

| Attribute             | Type                | Description                                    |
|:----------------------|:--------------------|:-----------------------------------------------|
| `camera_id`           | `str`               | Unique camera identifier                       |
| `ip`                  | `str`               | Camera IP address                              |
| `cap`                 | `cv2.VideoCapture`  | OpenCV video capture object                    |
| `latest_frame`        | `np.ndarray`        | Most recent annotated frame for streaming      |
| `stream_thread`       | `Thread`            | Background thread running `capture_frames()`   |
| `stream_running`      | `bool`              | Flag to control the capture loop               |
| `frame_lock`          | `threading.Lock`    | Protects `latest_frame` access                 |
| `frame_queue`         | `deque`             | Buffer of recent frames for activity analysis  |
| `queue_lock`          | `threading.Lock`    | Protects `frame_queue` access                  |
| `last_analysis_time`  | `float`             | Timestamp of last activity analysis            |
| `current_activity`    | `str`               | Latest detected activity (e.g., `"resting"`)   |
| `activity_lock`       | `threading.Lock`    | Protects `current_activity` access             |
| `activity_ready`      | `threading.Event`   | Signals when first activity result is ready    |
| `pending_db`          | `deque`             | Records waiting for activity before DB write   |
| `pending_db_lock`     | `threading.Lock`    | Protects `pending_db` access                   |
| `activity_future`     | `Future`            | Handle to pending activity analysis task       |
| `counts`              | `Counter`           | Current species counts for SSE broadcasting    |
| `total_unique`        | `int`               | Total unique animals currently tracked         |

##### `Entity`
Represents a unique tracked animal instance across frames. Used for deduplication.

| Attribute     | Type        | Description                                     |
|:--------------|:------------|:------------------------------------------------|
| `eid`         | `int`       | Auto-incremented unique entity ID               |
| `box`         | `ndarray`   | Last known bounding box `[x1, y1, x2, y2]`     |
| `last_frame`  | `int`       | Last frame index this entity was seen           |
| `class_hist`  | `Counter`   | Vote-based species classification history       |
| `canonical`   | `str`       | Most-voted species name                         |
| `track_ids`   | `set`       | Set of YOLO tracker IDs associated with entity  |

---

### App: `animaldb` — Historical Data & Analytics API

Provides CRUD endpoints for `Animal` and `Camera` models, plus analytical endpoints for summaries and heatmap data.

#### `AnimalViewSet` — Key Methods

##### `_calculate_event_count(queryset)`
**Purpose**: Prevents overcounting by grouping detection records into "sighting events".

**Logic**: Records from the same camera within a 2-minute window are grouped into one event. The maximum `count` field from each event is used (not the sum), then all event maxima are summed.

**Parameters**: `queryset` — A Django queryset of `Animal` records.

**Returns**: `int` — The total de-duplicated animal count.

##### `species(request)` — `GET /animals/species/`
Returns a list of all unique species names in the database.

##### `years(request)` — `GET /animals/years/`
Returns a list of all unique years present in the `timestamp` field.

##### `yearly_summary(request)` — `GET /animals/yearly-summary/`
Generates an annual summary for a given year (and optionally species).

**Query Parameters**:
- `year` (required): The year to summarise.
- `species` (optional): Filter by species (case-insensitive).

**Response Fields**:
- `year`: The requested year.
- `total_animals`: Event-based total count.
- `max_individuals_spotted`: Largest single event count.
- `favourite_activity`: Most frequent behaviour.
- `top_3_most_visited`: Top 3 coordinates by event count.

##### `monthly_summary(request)` — `GET /animals/monthly-summary/`
Breaks down detections by month for a given year and species.

**Query Parameters**:
- `year` (required): Year to query.
- `species` (required): Species to query (case-insensitive).

**Response**: `{ "jan": 5, "feb": 12, ... "dec": 3 }`

##### `heatmap_data(request)` — `GET /animals/heatmap-data/`
Returns coordinate-aggregated data for geospatial heatmap rendering.

**Query Parameters**:
- `year` (required): Year to query.
- `species` (optional): Filter by species.

**Response**: `[[latitude, longitude, count], ...]`

---

## Frontend — Next.js Dashboard

### Pages

#### 1. Main Dashboard (`/` — `page.js`)
The primary real-time monitoring interface. Features:

- **Sidebar**:
  - Master control button (Start/Stop all camera streams)
  - System status indicator (LIVE/IDLE)
  - Active sensor count
  - Global data filters (species, behaviour, date range)
  - Camera registration form (add IP cameras)
  - Registered camera list with delete functionality

- **Main Panel**:
  - **Camera Feeds**: Live MJPEG video from all active cameras with GPS overlay
  - **Database History Map**: Interactive Leaflet heatmap of all historical detections
  - **Species Detection Time Series**: Recharts AreaChart showing species counts over time
  - **Behaviour Analysis**: Recharts PieChart showing activity distribution

- **Real-time Data Flow**:
  ```
  SSE Connection → /det/live_stats/ → JSON every 1s → Updates all widgets
  MJPEG Stream  → /det/video_feed/<camera_id>/ → Live annotated video
  ```

#### 2. Data Retrieval Page (`/retrieve` — `retrieve/page.js`)
Combines the `AnimalTable`, `Camera`, `Summary`, and `Camview` components for historical data exploration.

### Components

#### `Heatmap.jsx`
Interactive Leaflet map with heat layer for visualising animal detection density.

| Prop            | Type      | Description                                 |
|:----------------|:----------|:--------------------------------------------|
| `speciesFilter` | `string`  | Optional species to filter by               |
| `yearFilter`    | `string`  | Optional year to filter by                  |
| `isEmbedded`    | `boolean` | If true, hides controls for embedded use    |
| `dateFrom`      | `string`  | Optional start date filter                  |
| `dateTo`        | `string`  | Optional end date filter                    |

**API Call**: `GET http://127.0.0.1:8000/animals/?species=...&start_timestamp=...&end_timestamp=...`

**Features**: Dynamic script loading (Leaflet + leaflet.heat), auto-pan to most populated point, species toggle checkboxes, ResizeObserver for embedded mode.

#### `AnimalTable.jsx`
Filterable, sortable table displaying animal sighting records.

**Filters**: Species (text), start date, end date, latitude range, longitude range.

**API Call**: `GET http://127.0.0.1:8000/animals/?species=...&start_timestamp=...&end_timestamp=...&latitude__gte=...&latitude__lte=...&longitude__gte=...&longitude__lte=...`

#### `Sumarry.jsx` (Summary)
Yearly and monthly analytical report with interactive charts.

**API Calls**:
- `GET http://127.0.0.1:8000/animals/species/` — Fetch available species
- `GET http://127.0.0.1:8000/animals/years/` — Fetch available years
- `GET http://127.0.0.1:8000/animals/yearly-summary/?year=...&species=...` — Yearly stats
- `GET http://127.0.0.1:8000/animals/monthly-summary/?year=...&species=...` — Monthly breakdown
- `GET http://127.0.0.1:8000/animals/heatmap-data/?year=...&species=...` — Location heatmap

**Features**: Species & year dropdown selectors, stat cards (max individuals, favourite activity, top locations), area chart for monthly population trends.

#### `Camera.jsx`
Displays a table of all registered IP cameras with their metadata.

**API Call**: `GET http://localhost:8000/det/cam/ip-addresses/`

#### `Camview.jsx`
Single camera viewer with stream start/stop controls.

**API Calls**:
- `GET /det/cameras/` — List cameras
- `POST /det/start_stream/` — Start stream
- `POST /det/stop_stream/` — Stop stream
- `GET /det/video_feed/` — MJPEG video source

#### `Ipadd.jsx`
Form component for registering new IP camera addresses.

---

## API Reference

### Detection & Streaming Endpoints (`/det/`)

| Method | Endpoint                          | Description                                    |
|:------:|:----------------------------------|:-----------------------------------------------|
| POST   | `/det/start_stream/`              | Stop all existing streams, then start streams for all registered cameras. Warms up Ollama concurrently. |
| POST   | `/det/stop_stream/`               | Stop all active camera streams and clear state. |
| GET    | `/det/video_feed/<camera_id>/`    | MJPEG streaming endpoint. Returns `multipart/x-mixed-replace` frames with YOLO annotations. |
| GET    | `/det/live_stats/`                | Server-Sent Events (SSE) endpoint. Emits JSON every ~1s with `active_cameras` list and `recent_history` (last 10 DB records). |
| GET    | `/det/cameras/`                   | List all registered cameras (via `IpAddressViewSet.list`). |
| GET    | `/det/cam/ip-addresses/`          | Full CRUD via DRF Router — list all IP cameras. |
| POST   | `/det/cam/ip-addresses/`          | Register a new camera IP. Body: `{"ip": "192.168.1.100:8080"}` |
| GET    | `/det/cam/ip-addresses/<id>/`     | Retrieve a specific camera record.             |
| PUT    | `/det/cam/ip-addresses/<id>/`     | Update a camera record.                        |
| DELETE | `/det/cam/ip-addresses/<id>/`     | Delete a camera record.                        |

#### `POST /det/start_stream/` — Response Example
```json
{
  "status": "success",
  "message": "Started 2 streams",
  "cameras": [
    {"camera_id": "1", "ip": "192.168.1.100:8080"},
    {"camera_id": "2", "ip": "192.168.1.101:8080"}
  ]
}
```

#### `GET /det/live_stats/` — SSE Event Example
```
data: {
  "active_cameras": ["1", "2"],
  "recent_history": [
    {
      "id": 42,
      "species": "panthera_leo",
      "count": 2,
      "behaviour": "resting",
      "latitude": 12.345678,
      "longitude": 76.543210,
      "camera_id": "1",
      "timestamp": "2026-04-09T14:30:00Z"
    }
  ]
}
```

### Animal Data Endpoints (`/animals/`)

| Method | Endpoint                          | Description                                    |
|:------:|:----------------------------------|:-----------------------------------------------|
| GET    | `/animals/`                       | List all animal records. Supports filtering.   |
| POST   | `/animals/`                       | Create a new animal record.                    |
| GET    | `/animals/<id>/`                  | Retrieve a specific animal record.             |
| PUT    | `/animals/<id>/`                  | Update an animal record.                       |
| DELETE | `/animals/<id>/`                  | Delete an animal record.                       |
| GET    | `/animals/species/`               | List all unique species names.                 |
| GET    | `/animals/years/`                 | List all unique years from timestamps.         |
| GET    | `/animals/yearly-summary/`        | Yearly analytics (requires `?year=`).          |
| GET    | `/animals/monthly-summary/`       | Monthly breakdown (requires `?year=&species=`).|
| GET    | `/animals/heatmap-data/`          | Heatmap coordinates (requires `?year=`).       |

#### Animal Filters (Query Parameters)

| Parameter          | Type     | Description                             |
|:-------------------|:---------|:----------------------------------------|
| `species`          | string   | Case-insensitive exact match            |
| `camera_id`        | string   | Case-insensitive exact match            |
| `start_timestamp`  | datetime | Records on or after this datetime       |
| `end_timestamp`    | datetime | Records on or before this datetime      |
| `latitude_min/max` | decimal  | Latitude range filter                   |
| `longitude_min/max`| decimal  | Longitude range filter                  |

### Camera Data Endpoints (`/cameras/`)

| Method | Endpoint            | Description                              |
|:------:|:--------------------|:-----------------------------------------|
| GET    | `/cameras/`         | List all cameras.                        |
| POST   | `/cameras/`         | Register a new camera.                   |
| GET    | `/cameras/<id>/`    | Retrieve a specific camera.              |
| PUT    | `/cameras/<id>/`    | Update a camera record.                  |
| DELETE | `/cameras/<id>/`    | Delete a camera.                         |

#### Camera Filters

| Parameter  | Type     | Description                               |
|:-----------|:---------|:------------------------------------------|
| `camera_id`| string   | Case-insensitive exact match              |
| `addtime`  | datetime | Range filter (`addtime_after`, `addtime_before`) |

---

## Core Functions Reference

### Detection & Streaming (`animaldet/views.py`)

#### `capture_frames(state: CameraState)`
**The main capture loop.** Runs in a dedicated background thread per camera.

1. Connects to the camera's MJPEG stream via `cv2.VideoCapture`.
2. On every frame: rotates, resizes, and adds to the activity analysis queue.
3. Every `DETECTION_EVERY_N_FRAMES` frames: submits YOLO inference to `_inference_executor`.
4. Matches YOLO detections to existing `Entity` objects using IoU + centroid distance.
5. Every 60 frames with detections: queries GPS from the phone app (`/location` endpoint), builds a detection record, and either writes it to DB (if activity is ready) or queues it pending activity analysis.
6. Annotates the frame with bounding boxes, species labels, confidence scores, and entity counts.
7. Updates `state.latest_frame` for MJPEG streaming.

#### `_run_yolo(frame) → list[Results]`
Runs the YOLO model with BoTSORT tracking on a single frame.

**Parameters**: `frame` — BGR numpy array.

**Config**: `imgsz=640`, `conf=0.76`, `tracker=botsort.yaml`, `persist=True`, `agnostic_nms=True`.

#### `analyze_activity_from_queue(state: CameraState) → str | None`
Performs behaviour classification using Ollama's multimodal vision-language model.

1. Samples frames from the `frame_queue`.
2. Runs YOLO on sampled frames to generate annotated images with bounding boxes.
3. Saves annotated frames as temporary JPEG files.
4. Sends frames + a detailed prompt to `ollama.chat()` (model: `qwen3-vl:2b-instruct`).
5. Parses the JSON response and fuzzy-maps it to one of 5 allowed activities.
6. Cleans up temporary files.

**Returns**: One of `{"strolling", "chasing", "resting", "eating", "running"}` or `None`.

#### `_map_to_activity(raw: str) → str | None`
Fuzzy-maps a raw model response string to a canonical activity using keyword matching.

#### `_handle_activity_result(future: Future, state: CameraState)`
Callback attached to activity analysis futures. Updates `state.current_activity` and flushes pending DB records.

#### `_flush_pending_db(state: CameraState)`
Drains the `state.pending_db` queue, attaching the current activity to each record and enqueuing for DB write.

#### `to_db(data: dict)`
Validates and saves a detection record to the database using `AnimalSerializer`.

#### `_enqueue_db(data: dict)`
Thread-safe enqueue of a detection record to the dedicated DB writer thread.

#### `_db_writer_loop()`
Daemon thread that continuously drains the `_db_write_queue` and calls `to_db()`.

#### `normalize_label(label: str) → str`
Converts a species label to lowercase-underscore canonical form (e.g., `"Panthera Leo"` → `"panthera_leo"`).

#### `iou_xyxy(a, b) → float`
Computes Intersection-over-Union between two `[x1, y1, x2, y2]` bounding boxes.

#### `centroid(box) → tuple[float, float]`
Returns the center point `(cx, cy)` of a bounding box.

#### `gen_frames_async(camera_id) → AsyncGenerator`
Async generator that yields MJPEG-encoded frames for `StreamingHttpResponse`.

#### `video_feed(request, camera_id) → StreamingHttpResponse`
Django view that serves the MJPEG video feed for a specific camera.

#### `start_stream(request) → JsonResponse`
Stops all existing streams, then starts a background capture thread for each registered camera.

#### `stop_stream(request) → JsonResponse`
Stops all active streams by setting `stream_running = False` and releasing resources.

#### `sse_live_stats() → AsyncGenerator`
Async generator that emits SSE events every ~1 second with active camera list and the last 10 database records.

#### `live_stats(request) → StreamingHttpResponse`
Django view that serves the SSE `text/event-stream` endpoint.

#### `_warmup_ollama()`
Pre-loads the Ollama model by sending a dummy chat request. Called asynchronously on stream start.

### Analytics (`animaldb/views.py`)

#### `AnimalViewSet._calculate_event_count(queryset) → int`
Groups records from the same camera within a 2-minute window into sighting events, then sums the maximum count from each event. Prevents overcounting from continuous detection.

#### `AnimalViewSet.yearly_summary(request) → Response`
Computes total animals, max individuals, favourite activity, and top 3 locations for a given year/species using event-based counting.

#### `AnimalViewSet.monthly_summary(request) → Response`
Breaks down event-based counts into 12 monthly buckets (`jan` through `dec`).

#### `AnimalViewSet.heatmap_data(request) → Response`
For each unique `(latitude, longitude)` pair, calculates the event-based count and returns it as a list of `[lat, lon, count]` arrays.

---

## Configuration & Tuning

All tuning constants are defined at the top of `animaldet/views.py`:

### YOLO Configuration
| Constant                    | Value          | Description                                   |
|:----------------------------|:---------------|:----------------------------------------------|
| `WEIGHTS`                   | `yolo_v26_best.pt` | Path to custom YOLO weights file          |
| `CONF_THRES`                | `0.76`         | Confidence threshold for detections            |
| `IMG_SIZE`                  | `640`          | YOLO input image size                          |
| `TRACKER`                   | `botsort.yaml` | Tracking algorithm configuration               |
| `DETECTION_EVERY_N_FRAMES`  | `2`            | Run detection every N frames (skip frames)     |
| `FRAME_ROTATION`            | `ROTATE_180`   | Frame rotation applied to camera input         |

### Entity Tracking
| Constant      | Value  | Description                                          |
|:--------------|:-------|:-----------------------------------------------------|
| `IOU_MERGE`   | `0.45` | IoU threshold for merging detections into entities   |
| `DIST_FRAC`   | `0.15` | Max centroid distance (as fraction of frame diagonal)|
| `MAX_AGE_SEC` | `1.5`  | Seconds before an unseen entity is considered stale  |

### Ollama / Activity Analysis
| Constant                       | Value              | Description                              |
|:-------------------------------|:-------------------|:-----------------------------------------|
| `ACTIVITY_ANALYSIS_INTERVAL`   | `30.0` seconds     | Minimum interval between activity analyses |
| `FRAME_QUEUE_SIZE_MULTIPLIER`  | `5`                | Queue size = multiplier × FPS            |
| `RESIZE_DIM`                   | `(224, 224)`       | Resize dimensions for queued frames      |
| `SAMPLE_COUNT`                 | `1`                | Number of frames sampled for analysis    |
| `OLLAMA_MODEL`                 | `qwen3-vl:2b-instruct` | Ollama VLM model name              |
| `MIN_FRAMES_FOR_ANALYSIS`      | `8`                | Minimum frames in queue before analysis  |
| `OLLAMA_OPTIONS.num_predict`   | `16`               | Max tokens in model response             |
| `OLLAMA_OPTIONS.temperature`   | `0.1`              | Low temperature for deterministic output |

---

## Setup & Installation

### Prerequisites
- **Python 3.10+**
- **Node.js 18+** and **npm**
- **Ollama** installed and running with the `qwen3-vl:2b-instruct` model pulled
- Custom YOLO weights file (`yolo_v26_best.pt`)

### Backend Setup

```bash
# Navigate to backend directory
cd overhaul/backend/server

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac

# Install Python dependencies
pip install django djangorestframework django-filter django-cors-headers
pip install ultralytics opencv-python-headless numpy
pip install ollama requests asgiref

# Run migrations
python manage.py makemigrations
python manage.py migrate

# (Optional) Create superuser for Django admin
python manage.py createsuperuser
```

### Frontend Setup

```bash
# Navigate to frontend directory
cd overhaul/frontend

# Install Node dependencies
npm install
```

### Ollama Setup

```bash
# Pull the required model
ollama pull qwen3-vl:2b-instruct

# Ensure Ollama is running
ollama serve
```

---

## Running the Application

### 1. Start the Backend

```bash
cd overhaul/backend/server

# For SSE/async support, use an ASGI server:
python manage.py runserver 0.0.0.0:8000

# Or with Daphne for full async:
# daphne -b 0.0.0.0 -p 8000 server.asgi:application
```

### 2. Start the Frontend

```bash
cd overhaul/frontend
npm run dev
```

The dashboard will be available at **http://localhost:3000**.

### 3. Register Cameras

1. Open the dashboard at `http://localhost:3000`
2. In the sidebar, enter the IP camera address (e.g., `192.168.1.100:8080`)
3. Click **Register Camera**
4. Click **START ALL CAMERAS** to begin monitoring

### 4. Camera App Requirements

The IP camera app (WildCamApp) must expose:
- `GET http://<ip>/video` — MJPEG video stream
- `GET http://<ip:8080>/location` — JSON with `{"latitude": ..., "longitude": ...}`

---

## Testing

### Backend Tests

```bash
cd overhaul/backend/server
python manage.py test animaldb
```

**Test suite** (`animaldb/tests.py`) covers:
- `test_list_animals` — Verifies listing all animal records
- `test_create_animal` — Verifies creating a new record (with authentication)
- `test_filter_by_species` — Verifies case-insensitive species filtering
- `test_filter_by_timestamp_range` — Verifies date range filtering

---

## License

This project is developed as part of an academic major project for AI-based wildlife monitoring.

---

<p align="center">
  <strong>🌿 WildCam AI</strong> — Protecting Wildlife Through Intelligent Monitoring
</p>
