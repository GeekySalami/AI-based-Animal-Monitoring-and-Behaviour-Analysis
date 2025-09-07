from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AnimalViewSet, CameraViewSet

# Create a router and register our viewset with it.
router = DefaultRouter()
router.register(r'animals', AnimalViewSet, basename='animal')
router.register(r'cameras', CameraViewSet, basename='camera')

# The API URLs are now determined automatically by the router.
urlpatterns = [
    path('', include(router.urls)),
]
