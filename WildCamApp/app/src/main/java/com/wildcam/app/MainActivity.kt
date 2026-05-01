package com.wildcam.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import android.os.Bundle
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.wildcam.app.databinding.ActivityMainBinding
import java.io.ByteArrayOutputStream
import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.Collections
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * WildCam IP Camera — Main Activity
 *
 * Turns the Android phone into an IP camera by:
 * 1. Capturing video from the back camera via CameraX
 * 2. Converting frames to JPEG and feeding them to an embedded HTTP server
 * 3. Serving MJPEG at :8080/video and GPS at :8080/location
 * 4. Displaying the camera preview and server status on screen
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "WildCamApp"
        private const val SERVER_PORT = 8080
        private const val JPEG_QUALITY = 70
        private const val TARGET_WIDTH = 640
        private const val TARGET_HEIGHT = 480
        private const val LOCATION_INTERVAL_MS = 5000L
    }

    // View binding
    private lateinit var binding: ActivityMainBinding

    // Camera
    private lateinit var cameraExecutor: ExecutorService
    private var cameraProvider: ProcessCameraProvider? = null

    // HTTP Server
    private var mjpegServer: MjpegServer? = null
    private var isServerRunning = false

    // Location
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback

    // ──────────────────────────────────────────────────────────────────
    // Permission handling
    // ──────────────────────────────────────────────────────────────────

    private val requiredPermissions = arrayOf(
        Manifest.permission.CAMERA,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    )

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val allGranted = permissions.all { it.value }
        if (allGranted) {
            Log.d(TAG, "All permissions granted")
            startCamera()
            startLocationUpdates()
        } else {
            Toast.makeText(this, getString(R.string.permission_required), Toast.LENGTH_LONG).show()
        }
    }

    // ──────────────────────────────────────────────────────────────────
    // Lifecycle
    // ──────────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Keep screen on while app is active
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        cameraExecutor = Executors.newSingleThreadExecutor()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)

        setupLocationCallback()
        setupButtons()
        updateNetworkIp()

        // Request permissions
        if (allPermissionsGranted()) {
            startCamera()
            startLocationUpdates()
        } else {
            permissionLauncher.launch(requiredPermissions)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopServer()
        cameraExecutor.shutdown()
        stopLocationUpdates()
    }

    // ──────────────────────────────────────────────────────────────────
    // UI Setup
    // ──────────────────────────────────────────────────────────────────

    private fun setupButtons() {
        binding.btnStart.setOnClickListener {
            startServer()
        }
        binding.btnStop.setOnClickListener {
            stopServer()
        }
    }

    private fun updateUiServerRunning() {
        val ip = getNetworkIpAddress() ?: "unknown"

        binding.tvStatus.text = getString(R.string.server_status_running)
        binding.tvStatus.setTextColor(ContextCompat.getColor(this, R.color.status_live))
        binding.statusDot.setBackgroundResource(R.drawable.status_dot_live)
        binding.tvServerAddress.text = "$ip:$SERVER_PORT"
        binding.btnStart.isEnabled = false
        binding.btnStop.isEnabled = true
        binding.endpointsPanel.visibility = View.VISIBLE
        binding.tvEndpointVideo.text = "http://$ip:$SERVER_PORT/video"
        binding.tvEndpointLocation.text = "http://$ip:$SERVER_PORT/location"
        binding.tvHint.text = "Stream is LIVE • Open endpoints from any device on the network"
    }

    private fun updateUiServerStopped() {
        binding.tvStatus.text = getString(R.string.server_status_idle)
        binding.tvStatus.setTextColor(ContextCompat.getColor(this, R.color.status_idle))
        binding.statusDot.setBackgroundResource(R.drawable.status_dot_idle)
        binding.btnStart.isEnabled = true
        binding.btnStop.isEnabled = false
        binding.endpointsPanel.visibility = View.GONE
        binding.tvHint.text = "Start the server to stream camera over your network"
    }

    private fun updateNetworkIp() {
        val ip = getNetworkIpAddress()
        binding.tvServerAddress.text = if (ip != null) {
            "$ip:$SERVER_PORT"
        } else {
            getString(R.string.no_ip)
        }
    }

    // ──────────────────────────────────────────────────────────────────
    // HTTP Server
    // ──────────────────────────────────────────────────────────────────

    private fun startServer() {
        if (isServerRunning) return

        try {
            mjpegServer = MjpegServer(SERVER_PORT).also { server ->
                server.start()
                isServerRunning = true
                Log.d(TAG, "Server started on port $SERVER_PORT")
            }
            runOnUiThread { updateUiServerRunning() }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start server: ${e.message}", e)
            runOnUiThread {
                Toast.makeText(this, "Failed to start server: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun stopServer() {
        if (!isServerRunning) return

        try {
            mjpegServer?.stop()
            mjpegServer = null
            isServerRunning = false
            Log.d(TAG, "Server stopped")
            runOnUiThread { updateUiServerStopped() }
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping server: ${e.message}", e)
        }
    }

    // ──────────────────────────────────────────────────────────────────
    // CameraX
    // ──────────────────────────────────────────────────────────────────

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)

        cameraProviderFuture.addListener({
            cameraProvider = cameraProviderFuture.get()

            // Preview use case — shows on screen
            val preview = Preview.Builder()
                .build()
                .also {
                    it.setSurfaceProvider(binding.previewView.surfaceProvider)
                }

            // ImageAnalysis use case — captures frames for MJPEG streaming
            val imageAnalysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
                .build()

            imageAnalysis.setAnalyzer(cameraExecutor) { imageProxy ->
                processFrame(imageProxy)
            }

            // Use back camera only
            val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

            try {
                // Unbind any existing use cases before rebinding
                cameraProvider?.unbindAll()

                // Bind use cases to camera
                cameraProvider?.bindToLifecycle(
                    this, cameraSelector, preview, imageAnalysis
                )

                Log.d(TAG, "Camera started successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Camera bind failed: ${e.message}", e)
            }

        }, ContextCompat.getMainExecutor(this))
    }

    /**
     * Converts an ImageProxy (YUV_420_888) to a JPEG byte array and pushes it
     * to the MJPEG server for streaming.
     */
    private fun processFrame(imageProxy: ImageProxy) {
        try {
            if (!isServerRunning) {
                imageProxy.close()
                return
            }

            val jpegBytes = imageProxyToJpeg(imageProxy)
            if (jpegBytes != null) {
                mjpegServer?.updateFrame(jpegBytes)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Frame processing error: ${e.message}")
        } finally {
            imageProxy.close()
        }
    }

    /**
     * Converts an ImageProxy in YUV_420_888 format to a JPEG byte array.
     * Resizes the output to TARGET_WIDTH x TARGET_HEIGHT for performance.
     */
    private fun imageProxyToJpeg(imageProxy: ImageProxy): ByteArray? {
        try {
            val yBuffer = imageProxy.planes[0].buffer
            val uBuffer = imageProxy.planes[1].buffer
            val vBuffer = imageProxy.planes[2].buffer

            val ySize = yBuffer.remaining()
            val uSize = uBuffer.remaining()
            val vSize = vBuffer.remaining()

            val nv21 = ByteArray(ySize + uSize + vSize)

            // Copy Y plane
            yBuffer.get(nv21, 0, ySize)
            // Copy VU planes (NV21 needs VU order, not UV)
            vBuffer.get(nv21, ySize, vSize)
            uBuffer.get(nv21, ySize + vSize, uSize)

            val yuvImage = YuvImage(
                nv21,
                ImageFormat.NV21,
                imageProxy.width,
                imageProxy.height,
                null
            )

            val fullStream = ByteArrayOutputStream()
            yuvImage.compressToJpeg(
                Rect(0, 0, imageProxy.width, imageProxy.height),
                JPEG_QUALITY,
                fullStream
            )

            // Decode and resize for network efficiency
            val fullBytes = fullStream.toByteArray()
            val bitmap = BitmapFactory.decodeByteArray(fullBytes, 0, fullBytes.size)
                ?: return fullBytes

            val resized = Bitmap.createScaledBitmap(bitmap, TARGET_WIDTH, TARGET_HEIGHT, true)

            // Apply rotation based on the image rotation degrees
            val rotationDegrees = imageProxy.imageInfo.rotationDegrees
            val finalBitmap = if (rotationDegrees != 0) {
                val matrix = Matrix()
                matrix.postRotate(rotationDegrees.toFloat())
                Bitmap.createBitmap(resized, 0, 0, resized.width, resized.height, matrix, true)
            } else {
                resized
            }

            val resizedStream = ByteArrayOutputStream()
            finalBitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, resizedStream)

            // Clean up bitmaps to prevent memory leaks
            if (finalBitmap !== resized) finalBitmap.recycle()
            if (resized !== bitmap) resized.recycle()
            bitmap.recycle()

            return resizedStream.toByteArray()
        } catch (e: Exception) {
            Log.e(TAG, "YUV to JPEG conversion failed: ${e.message}")
            return null
        }
    }

    // ──────────────────────────────────────────────────────────────────
    // GPS Location
    // ──────────────────────────────────────────────────────────────────

    private fun setupLocationCallback() {
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                val location = locationResult.lastLocation ?: return
                val lat = location.latitude
                val lon = location.longitude

                // Update server with new coordinates
                mjpegServer?.updateLocation(lat, lon)

                // Update UI
                runOnUiThread {
                    binding.tvGps.text = String.format("%.6f, %.6f", lat, lon)
                }

                Log.d(TAG, "Location update: $lat, $lon")
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun startLocationUpdates() {
        if (!hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)) return

        val locationRequest = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            LOCATION_INTERVAL_MS
        ).apply {
            setMinUpdateIntervalMillis(LOCATION_INTERVAL_MS / 2)
            setWaitForAccurateLocation(false)
        }.build()

        fusedLocationClient.requestLocationUpdates(
            locationRequest,
            locationCallback,
            Looper.getMainLooper()
        )

        Log.d(TAG, "Location updates started (interval: ${LOCATION_INTERVAL_MS}ms)")
    }

    private fun stopLocationUpdates() {
        try {
            fusedLocationClient.removeLocationUpdates(locationCallback)
            Log.d(TAG, "Location updates stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping location updates: ${e.message}")
        }
    }

    // ──────────────────────────────────────────────────────────────────
    // Network Utilities
    // ──────────────────────────────────────────────────────────────────

    /**
     * Gets the device's network IP address.
     * Works for both WiFi and hotspot connections.
     * Scans all network interfaces for a non-loopback IPv4 address.
     */
    private fun getNetworkIpAddress(): String? {
        try {
            val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
            for (intf in interfaces) {
                // Skip down interfaces and loopback
                if (!intf.isUp || intf.isLoopback) continue

                val addresses = Collections.list(intf.inetAddresses)
                for (addr in addresses) {
                    if (!addr.isLoopbackAddress && addr is Inet4Address) {
                        val hostAddr = addr.hostAddress
                        if (hostAddr != null && hostAddr != "127.0.0.1") {
                            Log.d(TAG, "Found IP: $hostAddr on interface: ${intf.name}")
                            return hostAddr
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get network IP: ${e.message}")
        }
        return null
    }

    // ──────────────────────────────────────────────────────────────────
    // Permission Utilities
    // ──────────────────────────────────────────────────────────────────

    private fun allPermissionsGranted() = requiredPermissions.all { hasPermission(it) }

    private fun hasPermission(permission: String) =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED
}
