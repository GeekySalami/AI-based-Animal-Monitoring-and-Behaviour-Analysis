# Add project specific ProGuard rules here.
# Keep NanoHTTPD classes
-keep class fi.iki.elonen.** { *; }

# Keep Google Play Services Location
-keep class com.google.android.gms.location.** { *; }
