import cv2
import threading
import asyncio
import json
from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from rest_framework import viewsets
from rest_framework.decorators import action
from .models import ip_address
from .serializers import IpAddressSerializer
from rest_framework.permissions import AllowAny 
import logging

logger = logging.getLogger(__name__)

# Global variables
cap = None
latest_frame = None
stream_thread = None
stream_running = False
frame_lock = threading.Lock()
current_camera_id = None


def capture_frames(ip):
    """Continuously capture frames in the background."""
    global cap, latest_frame, stream_running

    try:
        # Try different URL formats
        stream_url = f"http://{ip}/video"
        logger.info(f"Attempting to connect to: {stream_url}")
        
        cap = cv2.VideoCapture(stream_url)
        
        # Set shorter timeout for reads
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        if not cap.isOpened():
            logger.error(f"Error: Cannot open video stream at {ip}")
            stream_running = False
            return

        logger.info(f"Successfully connected to camera at {ip}")

        while stream_running:
            ret, frame = cap.read()
            if not ret:
                logger.warning("Failed to read frame")
                # Check if we should still be running
                if not stream_running:
                    break
                continue
            with frame_lock:
                latest_frame = frame

    except Exception as e:
        logger.error(f"Error in capture_frames: {str(e)}")
        stream_running = False
    finally:
        # Cleanup when stopped
        if cap is not None:
            try:
                cap.release()
                logger.info("Video capture released")
            except Exception as e:
                logger.error(f"Error releasing capture: {str(e)}")
        logger.info("Stream thread stopped cleanly.")


async def gen_frames_async():
    """Yields frames for HTTP streaming."""
    global latest_frame, stream_running

    while stream_running:
        await asyncio.sleep(0.03)
        with frame_lock:
            if latest_frame is None:
                continue
            try:
                _, buffer = cv2.imencode('.jpg', latest_frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                frame = buffer.tobytes()
            except Exception as e:
                logger.error(f"Error encoding frame: {str(e)}")
                continue

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')


async def video_feed(request):
    """View to stream video to browser."""
    
    if not stream_running:
        return JsonResponse({"error": "Stream not started yet."}, status=400)
    
    return StreamingHttpResponse(
        gen_frames_async(),
        content_type='multipart/x-mixed-replace; boundary=frame'
    )


@csrf_exempt
@require_http_methods(["POST"])
def start_stream(request):
    """Starts the capture thread for a specific camera."""
    global stream_thread, stream_running, current_camera_id, cap, latest_frame

    try:
        # Parse request body
        try:
            data = json.loads(request.body.decode('utf-8'))
            logger.info(f"Received request data: {data}")
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error: {str(e)}")
            return JsonResponse({"error": "Invalid JSON format"}, status=400)
        
        camera_id = data.get('camera_id')
        
        if not camera_id:
            logger.error("No camera_id provided")
            return JsonResponse({"error": "camera_id is required"}, status=400)

        # Get camera IP from database
        try:
            camera = ip_address.objects.get(id=camera_id)
            logger.info(f"Found camera: {camera.id}, IP: {camera.ip}")
        except ip_address.DoesNotExist:
            logger.error(f"Camera with id {camera_id} not found")
            return JsonResponse({"error": f"Camera with id {camera_id} not found"}, status=404)
        except Exception as e:
            logger.error(f"Database error: {str(e)}")
            return JsonResponse({"error": f"Database error: {str(e)}"}, status=500)

        # Stop existing stream if running
        if stream_running:
            logger.info("Stopping existing stream...")
            stream_running = False
            if stream_thread and stream_thread.is_alive():
                stream_thread.join(timeout=2)
            if cap:
                cap.release()
                cap = None
            latest_frame = None

        # Validate IP address
        if not camera.ip:
            logger.error(f"Camera {camera_id} has no IP address")
            return JsonResponse({"error": "Camera has no IP address configured"}, status=400)

        # Start new stream
        stream_running = True
        current_camera_id = camera_id
        stream_thread = threading.Thread(
            target=capture_frames, 
            args=(camera.ip,), 
            daemon=True
        )
        stream_thread.start()

        logger.info(f"Stream started for camera {camera_id}")

        return JsonResponse({
            "status": "success",
            "message": f"Stream started for camera {getattr(camera, 'name', camera_id)}",
            "camera_id": camera_id,
            "ip_address": camera.ip
        })

    except Exception as e:
        logger.error(f"Unexpected error in start_stream: {str(e)}", exc_info=True)
        return JsonResponse({"error": f"Internal server error: {str(e)}"}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def stop_stream(request):
    """Stops the capture thread cleanly."""
    global stream_running, cap, latest_frame, current_camera_id, stream_thread

    try:
        if not stream_running:
            return JsonResponse({"status": "Stream not running."})

        logger.info("Stopping stream...")
        
        # Signal thread to stop
        stream_running = False

        # Wait for the thread to finish
        if stream_thread and stream_thread.is_alive():
            logger.info("Waiting for stream thread to finish...")
            stream_thread.join(timeout=3)
            if stream_thread.is_alive():
                logger.warning("Thread did not stop gracefully")

        # Force release the capture if still open
        if cap and cap.isOpened():
            logger.info("Releasing video capture...")
            cap.release()
            cap = None

        latest_frame = None
        current_camera_id = None
        stream_thread = None

        logger.info("Stream stopped successfully")
        return JsonResponse({"status": "Stream stopped successfully."})
    
    except Exception as e:
        logger.error(f"Error stopping stream: {str(e)}")
        return JsonResponse({"error": str(e)}, status=500)


class IpAddressViewSet(viewsets.ModelViewSet):
    """
    A viewset that provides default CRUD operations for the ip_address model.
    """
    permission_classes = [AllowAny] 
    queryset = ip_address.objects.all()
    serializer_class = IpAddressSerializer

    def list(self, request, *args, **kwargs):
        """
        List all cameras
        GET /api/cameras/
        """
        try:
            cameras = self.get_queryset()
            serializer = self.get_serializer(cameras, many=True)
            return JsonResponse(serializer.data, safe=False)
        except Exception as e:
            logger.error(f"Error listing cameras: {str(e)}")
            return JsonResponse({"error": str(e)}, status=500)

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """
        Start stream for a specific camera.
        POST /api/cameras/{id}/start/
        """
        try:
            camera = self.get_object()
            global stream_running, stream_thread, current_camera_id, cap, latest_frame

            if stream_running:
                stream_running = False
                if stream_thread and stream_thread.is_alive():
                    stream_thread.join(timeout=2)
                if cap:
                    cap.release()
                    cap = None
                latest_frame = None

            stream_running = True
            current_camera_id = camera.id
            stream_thread = threading.Thread(
                target=capture_frames, 
                args=(camera.ip,), 
                daemon=True
            )
            stream_thread.start()

            return JsonResponse({
                "status": "success",
                "message": f"Stream started for {getattr(camera, 'name', f'camera {camera.id}')}",
                "camera_id": camera.id
            })
        except Exception as e:
            logger.error(f"Error starting camera stream: {str(e)}")
            return JsonResponse({"error": str(e)}, status=500)