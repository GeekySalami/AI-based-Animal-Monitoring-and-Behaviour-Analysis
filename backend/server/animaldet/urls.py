
from . import views
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import IpAddressViewSet

# Create a router and register our viewset with it.
router = DefaultRouter()
router.register(r'ip-addresses', IpAddressViewSet, basename='ipaddress')


urlpatterns = [
    path('cameras/', views.IpAddressViewSet.as_view({'get': 'list'}), name='camera-list'),
    path('start_stream/', views.start_stream, name='start-stream'),
    path('stop_stream/', views.stop_stream, name='stop-stream'),
    path('video_feed/', views.video_feed, name='video-feed'),
    path('cam/', include(router.urls)),
]