from django_filters import rest_framework as filters
from .models import Animal, Camera

class AnimalFilter(filters.FilterSet):
    """
    Defines the filters that can be applied to the Animal list endpoint.
    """
    # Create a filter for species that is case-insensitive
    species = filters.CharFilter(field_name='species', lookup_expr='iexact')

    # Create date range filters for the timestamp field
    start_timestamp = filters.DateTimeFilter(field_name="timestamp", lookup_expr='gte')
    end_timestamp = filters.DateTimeFilter(field_name="timestamp", lookup_expr='lte')
    latitude = filters.RangeFilter(field_name='latitude')
    longitude = filters.RangeFilter(field_name='longitude')
    camera_id = filters.CharFilter(field_name='camera_id', lookup_expr='iexact')
    class Meta:
        model = Animal
        # Define the fields available for filtering.
        # This list makes them available for exact matching and for the custom filters defined above.
        fields = ['species', 'camera_id', 'start_timestamp', 'end_timestamp']

class CameraFilter(filters.FilterSet):
    """
    Defines the filters that can be applied to the Camera list endpoint.
    """
    camera_id = filters.CharFilter(field_name='camera_id', lookup_expr='iexact')
    addtime = filters.DateTimeFromToRangeFilter(field_name='addtime')

    class Meta:
        model = Camera
        fields = ['camera_id', 'addtime']