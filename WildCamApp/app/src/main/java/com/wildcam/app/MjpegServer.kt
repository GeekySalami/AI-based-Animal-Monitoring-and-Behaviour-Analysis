package com.wildcam.app

import android.util.Log
import fi.iki.elonen.NanoHTTPD
import java.io.ByteArrayInputStream
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Embedded HTTP server that serves:
 *   GET /video    → MJPEG video stream from the phone camera
 *   GET /location → JSON with current GPS coordinates
 *
 * This server binds to 0.0.0.0:<port> so it's accessible from any device
 * on the same WiFi network or hotspot.
 */
class MjpegServer(port: Int) : NanoHTTPD(port) {

    companion object {
        private const val TAG = "MjpegServer"
        private const val BOUNDARY = "--wildcamframe"
        private const val FRAME_INTERVAL_MS = 66L  // ~15 FPS
    }

    // Latest JPEG frame from the camera — written by ImageAnalysis, read by stream clients
    @Volatile
    var latestFrame: ByteArray? = null
        private set

    // Latest GPS coordinates
    @Volatile
    var latitude: Double = 0.0
        private set

    @Volatile
    var longitude: Double = 0.0
        private set

    @Volatile
    var hasLocation: Boolean = false
        private set

    // Track active streaming threads so we can shut them down cleanly
    private val activeStreams = CopyOnWriteArrayList<Thread>()

    /**
     * Called by the camera's ImageAnalysis.Analyzer to push a new JPEG frame.
     */
    fun updateFrame(jpegBytes: ByteArray) {
        latestFrame = jpegBytes
    }

    /**
     * Called by the FusedLocationProviderClient callback to update GPS.
     */
    fun updateLocation(lat: Double, lon: Double) {
        latitude = lat
        longitude = lon
        hasLocation = true
    }

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri.trimEnd('/')
        Log.d(TAG, "Request: ${session.method} $uri")

        return when {
            uri == "/video" || uri == "/video/" -> serveVideoStream()
            uri == "/location" || uri == "/location/" -> serveLocation()
            uri == "/" || uri.isEmpty() -> serveIndex()
            else -> newFixedLengthResponse(
                Response.Status.NOT_FOUND,
                MIME_PLAINTEXT,
                "Not Found. Available endpoints: /video, /location"
            )
        }
    }

    /**
     * Serves a simple HTML index page with links to the endpoints.
     */
    private fun serveIndex(): Response {
        val html = """
            <!DOCTYPE html>
            <html>
            <head>
                <title>WildCam IP Camera</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { 
                        background: #121212; color: #fff; font-family: system-ui; 
                        display: flex; flex-direction: column; align-items: center;
                        justify-content: center; min-height: 100vh; margin: 0;
                    }
                    h1 { color: #4CAF50; }
                    a { color: #81C784; font-size: 1.2em; margin: 10px; }
                    .preview { margin-top: 20px; max-width: 100%; border: 2px solid #4CAF50; border-radius: 8px; }
                </style>
            </head>
            <body>
                <h1>🐾 WildCam IP Camera</h1>
                <p>Endpoints:</p>
                <a href="/video">/video — MJPEG Stream</a><br>
                <a href="/location">/location — GPS Coordinates</a>
                <img class="preview" src="/video" alt="Live Stream">
            </body>
            </html>
        """.trimIndent()

        return newFixedLengthResponse(Response.Status.OK, "text/html", html)
    }

    /**
     * Serves the current GPS location as JSON.
     */
    private fun serveLocation(): Response {
        val json = if (hasLocation) {
            """{"latitude": $latitude, "longitude": $longitude}"""
        } else {
            """{"latitude": null, "longitude": null, "error": "GPS not yet acquired"}"""
        }

        val response = newFixedLengthResponse(Response.Status.OK, "application/json", json)
        response.addHeader("Access-Control-Allow-Origin", "*")
        response.addHeader("Cache-Control", "no-cache")
        return response
    }

    /**
     * Serves an MJPEG video stream.
     *
     * Uses a PipedInputStream/PipedOutputStream pair to create a continuous stream
     * that NanoHTTPD can serve. A background thread writes JPEG frames into the pipe.
     */
    private fun serveVideoStream(): Response {
        val pipedIn = PipedInputStream(1024 * 1024)  // 1MB buffer
        val pipedOut = PipedOutputStream(pipedIn)

        val streamThread = Thread({
            try {
                while (!Thread.currentThread().isInterrupted) {
                    val frame = latestFrame
                    if (frame != null) {
                        val header = (
                            "$BOUNDARY\r\n" +
                            "Content-Type: image/jpeg\r\n" +
                            "Content-Length: ${frame.size}\r\n" +
                            "\r\n"
                        ).toByteArray()

                        pipedOut.write(header)
                        pipedOut.write(frame)
                        pipedOut.write("\r\n".toByteArray())
                        pipedOut.flush()
                    }

                    Thread.sleep(FRAME_INTERVAL_MS)
                }
            } catch (e: InterruptedException) {
                Log.d(TAG, "Stream thread interrupted (client disconnected)")
            } catch (e: Exception) {
                Log.d(TAG, "Stream ended: ${e.message}")
            } finally {
                try { pipedOut.close() } catch (_: Exception) {}
                activeStreams.remove(Thread.currentThread())
                Log.d(TAG, "Stream client disconnected. Active streams: ${activeStreams.size}")
            }
        }, "mjpeg-stream-${System.currentTimeMillis()}")

        streamThread.isDaemon = true
        activeStreams.add(streamThread)
        streamThread.start()

        Log.d(TAG, "New stream client connected. Active streams: ${activeStreams.size}")

        val response = newChunkedResponse(
            Response.Status.OK,
            "multipart/x-mixed-replace; boundary=$BOUNDARY",
            pipedIn
        )
        response.addHeader("Access-Control-Allow-Origin", "*")
        response.addHeader("Cache-Control", "no-cache, no-store, must-revalidate")
        response.addHeader("Pragma", "no-cache")
        response.addHeader("Connection", "close")

        return response
    }

    /**
     * Stops the server and all active streaming threads.
     */
    override fun stop() {
        Log.d(TAG, "Stopping server. Closing ${activeStreams.size} active streams...")
        for (thread in activeStreams) {
            thread.interrupt()
        }
        activeStreams.clear()
        super.stop()
        Log.d(TAG, "Server stopped.")
    }
}
