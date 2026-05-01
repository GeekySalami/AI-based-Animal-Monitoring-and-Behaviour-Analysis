import os
import shutil
import tempfile
import threading
import logging
import json
import datetime
import time
from collections import Counter, deque
from concurrent.futures import ThreadPoolExecutor, Future
import requests
import asyncio
from asgiref.sync import sync_to_async

import cv2
import numpy as np
import ollama
from ultralytics import YOLO

from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny

from .models import ip_address
from .serializers import IpAddressSerializer
from animaldb.models import Animal
from animaldb.serializers import AnimalSerializer

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
_models_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "models")
WEIGHTS_PT      = os.path.join(_models_dir, "yolo_v26_best.pt")
WEIGHTS_ONNX    = os.path.join(_models_dir, "yolo_v26_best.onnx")
WEIGHTS_OV      = os.path.join(_models_dir, "yolo_v26_best_openvino_model")

# Prefer OpenVINO (fastest on x86 CPU) > ONNX > PyTorch fallback
if os.path.isdir(WEIGHTS_OV):
    WEIGHTS = WEIGHTS_OV
elif os.path.isfile(WEIGHTS_ONNX):
    WEIGHTS = WEIGHTS_ONNX
else:
    WEIGHTS = WEIGHTS_PT

CONF_THRES      = 0.65
IMG_SIZE        = 640
TRACKER         = "botsort.yaml"

DETECTION_EVERY_N_FRAMES = 2
FRAME_ROTATION  = cv2.ROTATE_180

IOU_MERGE       = 0.45
DIST_FRAC       = 0.15
MAX_AGE_SEC     = 1.5

# Canonical label mapping: YOLO class index -> normalized species name
CLASS_MAP = {
    0: "panthera_leo",
    1: "panthera_pardus",
    2: "elephas_maximus",
    3: "panthera_tigris",
    4: "syncerus_caffer",
    5: "rusa_unicolor",
}

CLASS_WHITELIST = set(CLASS_MAP.values())

ACTIVITY_ANALYSIS_INTERVAL  = 30.0
FRAME_QUEUE_SIZE_MULTIPLIER = 5
RESIZE_DIM      = (224, 224)
SAMPLE_COUNT    = 1
OLLAMA_MODEL    = "qwen3-vl:2b-instruct"
MIN_FRAMES_FOR_ANALYSIS = 8
OLLAMA_OPTIONS  = {
    "num_predict": 16,
    "temperature": 0.1,
    "top_p":       0.1,
    "top_k":       1,
}

ALLOWED_ACTIVITIES = {"strolling", "chasing", "resting", "eating", "running"}

# ---------------------------------------------------------------------------
# Global state mapping
# ---------------------------------------------------------------------------
class CameraState:
    def __init__(self, camera_id, ip):
        self.camera_id = camera_id
        self.ip = ip
        self.cap = None
        self.latest_frame = None
        self.stream_thread = None
        self.stream_running = False
        self.frame_lock = threading.Lock()
        
        self.frame_queue = deque()
        self.queue_lock = threading.Lock()
        self.last_analysis_time = 0.0
        
        self.current_activity = None
        self.activity_lock = threading.Lock()
        self.activity_ready = threading.Event()
        
        self.pending_db = deque()
        self.pending_db_lock = threading.Lock()
        
        self.activity_future = None
        self.activity_future_lock = threading.Lock()
        
        self.counts = Counter() # For SSE
        self.total_unique = 0
        
active_streams = {} # camera_id (str) -> CameraState
streams_lock = threading.Lock()

# Executors
_executor              = ThreadPoolExecutor(max_workers=4)
_inference_executor    = ThreadPoolExecutor(max_workers=1)

# SSE Clients
sse_clients = []
sse_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Dedicated DB writer thread
# ---------------------------------------------------------------------------
_db_write_queue = deque()
_db_write_lock  = threading.Lock()

def _db_writer_loop():
    while True:
        item = None
        with _db_write_lock:
            if _db_write_queue:
                item = _db_write_queue.popleft()
        if item:
            to_db(item)
        else:
            time.sleep(0.05)

_db_writer_thread = threading.Thread(target=_db_writer_loop, daemon=True)
_db_writer_thread.start()

def _enqueue_db(data: dict):
    with _db_write_lock:
        _db_write_queue.append(data.copy())

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def normalize_label(label: str | None) -> str:
    """Normalize a species label to a canonical lowercase_underscore form."""
    if not label:
        return "unknown"
    return label.strip().lower().replace(" ", "_")

def iou_xyxy(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter_x1 = max(ax1, bx1);  inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2);  inter_y2 = min(ay2, by2)
    iw = max(0.0, inter_x2 - inter_x1)
    ih = max(0.0, inter_y2 - inter_y1)
    inter = iw * ih
    if inter == 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    denom  = float(area_a + area_b - inter + 1e-6)
    return inter / denom if denom > 0 else 0.0

def centroid(box):
    x1, y1, x2, y2 = box
    return (0.5 * (x1 + x2), 0.5 * (y1 + y2))

def to_db(data: dict):
    try:
        if not data.get("behaviour"):
            data["behaviour"] = "unknown"
        ts = data.get("timestamp", "")
        if isinstance(ts, str) and not ts.endswith("Z") and "+" not in ts:
            data["timestamp"] = ts + "Z"
        serializer = AnimalSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            logger.info("Saved to DB: %s", data)
        else:
            logger.error("Serializer errors: %s | data: %s", serializer.errors, data)
    except Exception as e:
        logger.exception("Exception saving to DB: %s", e)

def _flush_pending_db(state: CameraState):
    with state.pending_db_lock:
        while state.pending_db:
            record = state.pending_db.popleft()
            with state.activity_lock:
                record["behaviour"] = state.current_activity or "unknown"
            _enqueue_db(record)
            logger.info("Flushed pending DB record behaviour=%s", record["behaviour"])

def _handle_activity_result(future: Future, state: CameraState):
    try:
        result = future.result(timeout=10)
    except Exception as e:
        logger.exception("Activity future exception: %s", e)
        return

    if not result:
        logger.error("Activity analysis returned no result.")
        return

    raw = str(result).strip().lower()
    if raw not in ALLOWED_ACTIVITIES:
        logger.error("Invalid activity from Ollama: '%s'", raw)
        return

    with state.activity_lock:
        state.current_activity = raw
        state.activity_ready.set()

    logger.info("Activity updated for %s to '%s'", state.camera_id, raw)
    _flush_pending_db(state)

def _warmup_ollama():
    try:
        logger.info("Warming up Ollama: %s", OLLAMA_MODEL)
        ollama.chat(
            model=OLLAMA_MODEL,
            messages=[{"role": "user", "content": "warmup"}],
            options=OLLAMA_OPTIONS,
        )
        logger.info("Ollama warmup done.")
    except Exception as e:
        logger.exception("Ollama warmup failed: %s", e)

# ---------------------------------------------------------------------------
# Activity analysis
# ---------------------------------------------------------------------------
# Fuzzy keyword map: common synonyms/phrases -> canonical activity
_ACTIVITY_KEYWORDS = {
    "strolling": ["strolling", "stroll", "walking", "walk", "wander", "roaming", "roam", "moving slowly", "pacing"],
    "chasing":   ["chasing", "chase", "pursuing", "pursuit", "hunting", "hunt", "stalking", "stalk", "following prey"],
    "resting":   ["resting", "rest", "sleeping", "sleep", "lying", "lying down", "idle", "still", "stationary", "relaxing", "sitting"],
    "eating":    ["eating", "eat", "feeding", "feed", "grazing", "graze", "drinking", "drink", "foraging", "browsing", "chewing"],
    "running":   ["running", "run", "sprinting", "sprint", "galloping", "gallop", "fleeing", "flee", "bolting", "dashing", "fast movement"],
}

def _map_to_activity(raw: str) -> str | None:
    """Fuzzy-map a raw model response string to one of the ALLOWED_ACTIVITIES."""
    text = raw.strip().lower()
    # Direct match first
    if text in ALLOWED_ACTIVITIES:
        return text
    # Keyword search
    for canonical, keywords in _ACTIVITY_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                return canonical
    return None

def analyze_activity_from_queue(state: CameraState):
    logger.info("analyze_activity_from_queue for %s", state.ip)

    with state.queue_lock:
        qlen = len(state.frame_queue)
        if qlen < MIN_FRAMES_FOR_ANALYSIS:
            return None
        sample_count   = min(SAMPLE_COUNT, qlen)
        indices        = sorted({int((i * qlen) / sample_count) for i in range(sample_count)})
        sampled_frames = [state.frame_queue[i].copy() for i in indices]

    temp_dir    = tempfile.mkdtemp(prefix=f"activity_{state.camera_id}_")
    frame_paths = []
    detected_species = set()
    try:
        # Run YOLO on each sampled frame to annotate them with bounding boxes
        for idx, frame in enumerate(sampled_frames):
            try:
                results = model.predict(frame, imgsz=IMG_SIZE, conf=CONF_THRES, verbose=False)
                annotated = results[0].plot() if results and hasattr(results[0], "plot") else frame
                # Collect detected species names for the prompt
                if results and results[0].boxes is not None:
                    clsi = results[0].boxes.cls.cpu().numpy().astype(int)
                    for c in clsi:
                        detected_species.add(normalize_label(CLASS_MAP.get(int(c), model.names[c])))
            except Exception as e:
                logger.warning("YOLO annotation failed for frame %d: %s", idx, e)
                annotated = frame

            fp = os.path.join(temp_dir, f"frame_{idx}.jpg")
            cv2.imwrite(fp, annotated)
            frame_paths.append(fp)

        # Build a context-rich prompt
        species_str = ", ".join(sorted(set(map(normalize_label, detected_species)))) if detected_species else "wildlife"
        prompt_text = (
            f"You are analyzing annotated wildlife camera footage showing {species_str}. "
            "The images have bounding boxes and labels drawn on detected animals. "
            "Based on the body posture, movement, and context visible in these annotated frames, "
            "classify the PRIMARY activity of the animals into EXACTLY ONE of these categories:\n"
            "- strolling (walking calmly, wandering, roaming)\n"
            "- chasing (pursuing prey, hunting, stalking)\n"
            "- resting (lying down, sleeping, sitting still, idle)\n"
            "- eating (feeding, grazing, drinking, foraging)\n"
            "- running (sprinting, galloping, fleeing, fast movement)\n\n"
            'Respond with ONLY valid JSON: {"activity": "<value>"} where value is one of the five categories above. '
            "No explanation, no extra text."
        )

        try:
            response    = ollama.chat(
                model=OLLAMA_MODEL,
                options=OLLAMA_OPTIONS,
                messages=[{"role": "user", "content": prompt_text, "images": frame_paths}],
            )
            raw_content = response["message"]["content"].strip()
        except Exception as e:
            logger.exception("Ollama chat failed: %s", e)
            return None

        logger.info("Ollama raw response for %s: %s", state.camera_id, raw_content)

        # Try JSON parse first
        activity_candidate = None
        try:
            # Handle potential markdown code blocks in response
            clean = raw_content
            if "```" in clean:
                clean = clean.split("```")[1] if len(clean.split("```")) > 1 else clean
                clean = clean.strip().lstrip("json").strip()
            parsed = json.loads(clean)
            if isinstance(parsed, dict) and isinstance(parsed.get("activity"), str):
                activity_candidate = _map_to_activity(parsed["activity"])
        except Exception:
            pass

        # Fallback: fuzzy-match the entire raw response
        if activity_candidate is None:
            activity_candidate = _map_to_activity(raw_content)

        if not activity_candidate:
            logger.warning("Could not map Ollama response to activity: '%s'", raw_content)
            return None

        return activity_candidate
    finally:
        try:
            shutil.rmtree(temp_dir)
        except Exception:
            pass

# ---------------------------------------------------------------------------
# YOLO model
# ---------------------------------------------------------------------------
logger.info("Loading YOLO model from %s", WEIGHTS)
model = YOLO(WEIGHTS)
logger.info("YOLO model loaded.")

# Validate that CLASS_MAP covers all model classes
assert len(model.names) == len(CLASS_MAP), (
    f"CLASS_MAP has {len(CLASS_MAP)} entries but model has {len(model.names)} classes! "
    f"Model classes: {model.names}"
)

def _run_yolo(frame):
    return model.track(
        frame,
        imgsz=IMG_SIZE,
        conf=CONF_THRES,
        tracker=TRACKER,
        persist=True,
        verbose=False,
        agnostic_nms=True,
        iou=0.45,
    )

# ---------------------------------------------------------------------------
# Entity tracking
# ---------------------------------------------------------------------------
class Entity:
    _next_id = 0
    def __init__(self, box, frame_idx, class_name, track_id=None):
        self.eid        = Entity._next_id
        Entity._next_id += 1
        self.box        = box
        self.last_frame = frame_idx
        class_name      = normalize_label(class_name)
        self.class_hist = Counter([class_name])
        self.canonical  = class_name
        self.track_ids  = set()
        if track_id is not None:
            self.track_ids.add(int(track_id))
    def update(self, box, frame_idx, class_name, track_id=None, clsi_value=None):
        self.box        = box
        self.last_frame = frame_idx
        class_name      = normalize_label(class_name)
        self.class_hist[class_name] += 1
        self.canonical  = self.class_hist.most_common(1)[0][0]
        # Force correction from CLASS_MAP to prevent early-frame drift
        if clsi_value is not None:
            mapped = CLASS_MAP.get(int(clsi_value))
            if mapped:
                self.canonical = normalize_label(mapped)
        if track_id is not None:
            self.track_ids.add(int(track_id))

# ---------------------------------------------------------------------------
# Main capture loop
# ---------------------------------------------------------------------------
def capture_frames(state: CameraState):
    try:
        stream_url = f"http://{state.ip}/video"
        logger.info("Connecting to %s", stream_url)

        state.cap = cv2.VideoCapture(stream_url)
        state.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        fps            = state.cap.get(cv2.CAP_PROP_FPS) or 30.0
        w              = int(state.cap.get(cv2.CAP_PROP_FRAME_WIDTH)  or 640)
        h              = int(state.cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 480)
        diag           = (w ** 2 + h ** 2) ** 0.5
        max_age_frames = max(1, int(MAX_AGE_SEC * fps * DETECTION_EVERY_N_FRAMES))
        queue_max_size = max(10, int(FRAME_QUEUE_SIZE_MULTIPLIER * fps))

        if not state.cap.isOpened():
            logger.error("Cannot open stream at %s", stream_url)
            state.stream_running = False
            return

        entities: list[Entity]  = []
        frame_idx               = 0
        last_results            = None
        inference_future: Future | None = None

        while state.stream_running:
            ret, frame = state.cap.read()
            if not ret:
                time.sleep(0.01)
                continue

            frame_idx += 1
            now = time.time()

            if FRAME_ROTATION is not None:
                frame = cv2.rotate(frame, FRAME_ROTATION)

            small = cv2.resize(frame, RESIZE_DIM, interpolation=cv2.INTER_AREA)
            with state.queue_lock:
                state.frame_queue.append(small)
                if len(state.frame_queue) > queue_max_size:
                    state.frame_queue.popleft()

            with state.activity_future_lock:
                already_pending = state.activity_future is not None and not state.activity_future.done()
            with state.queue_lock:
                qlen = len(state.frame_queue)

            if (not already_pending
                    and qlen >= MIN_FRAMES_FOR_ANALYSIS
                    and (now - state.last_analysis_time) >= ACTIVITY_ANALYSIS_INTERVAL):
                state.last_analysis_time = now
                with state.activity_future_lock:
                    state.activity_future = _executor.submit(analyze_activity_from_queue, state)
                    # Bind state to callback using a lambda
                    state.activity_future.add_done_callback(lambda f, s=state: _handle_activity_result(f, s))

            if frame_idx % DETECTION_EVERY_N_FRAMES == 0:
                if inference_future is not None and inference_future.done():
                    try:
                        last_results = inference_future.result()
                    except Exception as e:
                        last_results = None
                    inference_future = None
                if inference_future is None:
                    inference_future = _inference_executor.submit(_run_yolo, frame.copy())

            if inference_future is not None and inference_future.done():
                try:
                    last_results = inference_future.result()
                except Exception as e:
                    last_results = None
                inference_future = None

            results = last_results

            # Draw our own annotations with CLASS_MAP labels instead of YOLO's
            # model.names (which would show raw labels like "Panthera Leo")
            annotated = frame.copy()

            boxes = results[0].boxes if results else None
            counts = Counter()
            total_unique = 0

            if boxes is not None and len(boxes) > 0:
                xyxy  = boxes.xyxy.cpu().numpy()
                clsi  = boxes.cls.cpu().numpy().astype(int)
                confs = boxes.conf.cpu().numpy()
                names = [normalize_label(CLASS_MAP.get(int(i), model.names[i])) for i in clsi]
                tids  = boxes.id.cpu().numpy().astype(int).tolist() if boxes.id is not None else [None] * len(xyxy)

                # Draw bounding boxes + labels with CLASS_MAP names
                for box, name, conf in zip(xyxy, names, confs):
                    x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
                    cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    label_text = f"{name} {conf:.2f}"
                    (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
                    cv2.rectangle(annotated, (x1, y1 - th - 6), (x1 + tw, y1), (0, 255, 0), -1)
                    cv2.putText(annotated, label_text, (x1, y1 - 4),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1, cv2.LINE_AA)

                for box, name, tid, cls_idx in zip(xyxy, names, tids, clsi):
                    if CLASS_WHITELIST and name not in CLASS_WHITELIST:
                        continue

                    best_e, best_score = None, -1.0
                    cx, cy = centroid(box)
                    for e in entities:
                        if frame_idx - e.last_frame > 5 * max_age_frames:
                            continue
                        iou     = iou_xyxy(box, e.box)
                        ex, ey  = centroid(e.box)
                        dist_ok = (((cx - ex) ** 2 + (cy - ey) ** 2) ** 0.5) < (DIST_FRAC * diag)
                        score   = iou + (0.5 if dist_ok else 0.0)
                        if score > best_score and (iou >= IOU_MERGE or dist_ok):
                            best_e, best_score = e, score

                    if best_e is None:
                        entities.append(Entity(box, frame_idx, name, tid))
                    else:
                        best_e.update(box, frame_idx, name, tid, clsi_value=cls_idx)

                entities = [e for e in entities if frame_idx - e.last_frame <= 5 * max_age_frames]

                for e in entities:
                    if CLASS_WHITELIST and e.canonical not in CLASS_WHITELIST:
                        continue
                    counts[e.canonical] += 1
                total_unique = sum(counts.values())

                y_pos = 40
                cv2.putText(annotated, f"Total Unique Animals: {total_unique}", (20, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                y_pos += 40
                for cls_name, cnt in counts.items():
                    cv2.putText(annotated, f"{cls_name}: {cnt}", (20, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
                    y_pos += 32

                if frame_idx % 60 == 0 and total_unique > 0:
                    latitude = None
                    longitude = None
                    camera_id_for_db = state.camera_id
                    try:
                        base_ip = state.ip.split(':')[0]
                        resp = requests.get(f"http://{base_ip}:8080/location", timeout=2.0)
                        if resp.status_code == 200:
                            loc_data = resp.json()
                            if loc_data.get("latitude") is not None:
                                latitude = round(float(loc_data.get("latitude")), 6)
                            if loc_data.get("longitude") is not None:
                                longitude = round(float(loc_data.get("longitude")), 6)
                    except Exception as e:
                        pass

                    for species, count in counts.items():
                        data = {
                            "species":   normalize_label(species),
                            "count":     count,
                            "behaviour": None,
                            "latitude":  latitude,
                            "longitude": longitude,
                            "camera_id": camera_id_for_db,
                            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                        }
                        if state.activity_ready.is_set():
                            with state.activity_lock:
                                data["behaviour"] = state.current_activity or "unknown"
                            _enqueue_db(data)
                        else:
                            with state.pending_db_lock:
                                state.pending_db.append(data)
                                if len(state.pending_db) > 200:
                                    state.pending_db.popleft()

            # Update state counts for SSE
            state.counts = counts
            state.total_unique = total_unique

            annotated_large = cv2.resize(annotated, (0, 0), fx=2.0, fy=2.0, interpolation=cv2.INTER_LINEAR)
            with state.frame_lock:
                state.latest_frame = annotated_large

    except Exception as exc:
        logger.exception("capture_frames crashed for %s: %s", state.camera_id, exc)
        state.stream_running = False
    finally:
        try:
            if state.cap is not None:
                state.cap.release()
        except Exception:
            pass
        with state.queue_lock:
            state.frame_queue.clear()
        
        with streams_lock:
            if state.camera_id in active_streams:
                del active_streams[state.camera_id]

async def gen_frames_async(camera_id):
    state = None
    while True:
        with streams_lock:
            if camera_id in active_streams:
                state = active_streams[camera_id]
            else:
                state = None
        
        if not state or not state.stream_running:
            break

        await asyncio.sleep(0.03)
        with state.frame_lock:
            frame = None if state.latest_frame is None else state.latest_frame.copy()
        if frame is None:
            continue
        try:
            _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buf.tobytes() + b'\r\n'
        except Exception as e:
            logger.exception("Frame encode error: %s", e)

async def video_feed(request, camera_id):
    with streams_lock:
        if str(camera_id) not in active_streams:
            return JsonResponse({"error": "Stream not running."}, status=400)
    return StreamingHttpResponse(
        gen_frames_async(str(camera_id)),
        content_type='multipart/x-mixed-replace; boundary=frame',
    )


def _stop_all_streams():
    with streams_lock:
        for state in active_streams.values():
            state.stream_running = False
            if state.cap:
                try:
                    state.cap.release()
                except Exception:
                    pass
            state.latest_frame = None
            with state.queue_lock:
                state.frame_queue.clear()
            
            with state.activity_lock:
                state.current_activity = None
                state.activity_ready.clear()
        # threads will eventually exit and remove themselves from active_streams
        # active_streams.clear() is risky while iterations happen, so we let threads remove themselves


@csrf_exempt
@require_http_methods(["POST"])
def start_stream(request):
    _stop_all_streams()
    
    # Needs some time to let old threads die
    time.sleep(1)

    try:
        cameras = ip_address.objects.all()
        started = []
        _executor.submit(_warmup_ollama)

        with streams_lock:
            for camera in cameras:
                if not camera.ip:
                    continue
                cid = str(camera.id)
                state = CameraState(cid, camera.ip)
                state.stream_running = True
                state.last_analysis_time = time.time()
                
                state.stream_thread = threading.Thread(
                    target=capture_frames, args=(state,), daemon=True
                )
                active_streams[cid] = state
                state.stream_thread.start()
                started.append({"camera_id": cid, "ip": camera.ip})

        return JsonResponse({
            "status": "success",
            "message": f"Started {len(started)} streams",
            "cameras": started
        })
    except Exception as e:
        logger.exception("start_stream error: %s", e)
        return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def stop_stream(request):
    try:
        _stop_all_streams()
        return JsonResponse({"status": "All streams stopped successfully."})
    except Exception as e:
        logger.exception("stop_stream error: %s", e)
        return JsonResponse({"error": str(e)}, status=500)


def _get_last_n_animals(n=100):
    """Synchronous helper to query the last n animal records."""
    recent = Animal.objects.all().order_by('-timestamp')[:n]
    return [
        {
            "id": a.id,
            "species": a.species,
            "count": a.count,
            "behaviour": a.behaviour,
            "latitude": float(a.latitude) if a.latitude is not None else None,
            "longitude": float(a.longitude) if a.longitude is not None else None,
            "camera_id": a.camera_id,
            "timestamp": a.timestamp.isoformat() if a.timestamp else None,
        } for a in recent
    ]

async def sse_live_stats():
    try:
        while True:
            await asyncio.sleep(1.0)
            
            stats = {
                "active_cameras": [],
                "recent_history": []
            }
            
            with streams_lock:
                for cid, state in active_streams.items():
                    if state.stream_running:
                        stats["active_cameras"].append(cid)
            
            # Fetch last 100 detections directly from DB
            # Flow: Detection -> DB write -> SSE query -> Frontend
            try:
                stats["recent_history"] = await sync_to_async(_get_last_n_animals, thread_sensitive=True)()
            except Exception as e:
                logger.exception("Error fetching recent animals: %s", e)
            
            data = f"data: {json.dumps(stats)}\n\n"
            yield data
    except asyncio.CancelledError:
        pass

async def live_stats(request):
    response = StreamingHttpResponse(sse_live_stats(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['Connection'] = 'keep-alive'
    response['X-Accel-Buffering'] = 'no'
    return response


class IpAddressViewSet(viewsets.ModelViewSet):
    permission_classes = [AllowAny]
    queryset           = ip_address.objects.all()
    serializer_class   = IpAddressSerializer

    def list(self, request, *args, **kwargs):
        try:
            serializer = self.get_serializer(self.get_queryset(), many=True)
            return JsonResponse(serializer.data, safe=False)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)
