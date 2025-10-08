import cv2
import threading
import asyncio
from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework import viewsets
from .models import ip_address
from .serializers import IpAddressSerializer
from rest_framework.permissions import AllowAny 


# Global variables
cap = None
latest_frame = None
stream_thread = None
stream_running = False
frame_lock = threading.Lock()


def capture_frames(ip):
    """Continuously capture frames in the background."""
    global cap, latest_frame, stream_running

    cap = cv2.VideoCapture(f"http://{ip}/video")

    if not cap.isOpened():
        print("Error: Cannot open video stream.")
        stream_running = False
        return

    while stream_running:
        ret, frame = cap.read()
        if not ret:
            continue
        with frame_lock:
            latest_frame = frame

    # Cleanup when stopped
    cap.release()
    print("Stream stopped cleanly.")


async def gen_frames_async():
    """Yields frames for HTTP streaming."""
    global latest_frame, stream_running

    while stream_running:
        await asyncio.sleep(0.03)
        with frame_lock:
            if latest_frame is None:
                continue
            _, buffer = cv2.imencode('.jpg', latest_frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            frame = buffer.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')


async def video_feed(request):
    """View to stream video to browser."""
    
    if not stream_running:
        return JsonResponse({"error": "Stream not started yet."})
    return StreamingHttpResponse(
        gen_frames_async(),
        content_type='multipart/x-mixed-replace; boundary=frame'
    )


@csrf_exempt
def start_stream(request):
    """Starts the capture thread."""
    global stream_thread, stream_running

    if stream_running:
        return JsonResponse({"status": "Stream already running."})

    stream_running = True
    stream_thread = threading.Thread(target=capture_frames, daemon=True)
    stream_thread.start()

    return JsonResponse({"status": "Stream started. Visit /video_feed to view."})


@csrf_exempt
def stop_stream(request):
    """Stops the capture thread cleanly."""
    global stream_running, cap, latest_frame

    if not stream_running:
        return JsonResponse({"status": "Stream not running."})

    # Signal thread to stop
    stream_running = False

    # Wait for capture thread to finish if needed
    if cap and cap.isOpened():
        cap.release()
        cap = None

    latest_frame = None

    return JsonResponse({"status": "Stream stopped successfully."})


class IpAddressViewSet(viewsets.ModelViewSet):
    """
    A viewset that provides default CRUD operations for the ip_address model.
    """
    permission_classes = [AllowAny] 
    queryset = ip_address.objects.all()
    serializer_class = IpAddressSerializer
