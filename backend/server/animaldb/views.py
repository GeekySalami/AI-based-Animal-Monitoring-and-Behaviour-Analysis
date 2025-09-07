from rest_framework import viewsets, status
from django.db.models import Count, Max
from django_filters.rest_framework import DjangoFilterBackend 
from .models import Animal, Camera
from .filters import CameraFilter
from .serializers import CameraSerializer
from .serializers import AnimalSerializer
from .filters import AnimalFilter 
from rest_framework.response import Response
from rest_framework.decorators import action
#######
from rest_framework.permissions import AllowAny 
#######

class AnimalViewSet(viewsets.ModelViewSet):
    """
    A simple ViewSet for viewing and editing animals.
    """
    queryset = Animal.objects.all()
    serializer_class = AnimalSerializer
    permission_classes = [AllowAny]  #######
    filter_backends = [DjangoFilterBackend]
    filterset_class = AnimalFilter

    @action(detail=False, methods=['get'])
    def species(self, request):
        """
        An endpoint to retrieve a list of unique animal species.
        """
        # Efficiently query the database for unique, non-null species values
        unique_species = Animal.objects.order_by('species').values_list('species', flat=True).distinct()
        
        # Filter out any null or empty string values that might be in the database
        filtered_species = [s for s in unique_species if s]

        return Response(filtered_species)
    
    @action(detail=False, methods=['get'])
    def years(self, request):
        """
        An endpoint to retrieve a list of unique years from the timestamp field.
        """
        # Efficiently query the database for unique years
        unique_years = Animal.objects.dates('timestamp', 'year', order='ASC').distinct()
        
        # Extract the year part from the date objects
        years_list = [date.year for date in unique_years]

        return Response(years_list)
    
    @action(detail=False, methods=['get'], url_path='yearly-summary')
    def yearly_summary(self, request):
        """
        An endpoint to get a summary of animal data for a specific year,
        with an optional filter for a specific species.
        
        Example (all animals): /animals/yearly-summary/?year=2025
        Example (specific animal): /animals/yearly-summary/?year=2025&species=Tiger
        """
        # 1. Get and validate the 'year' from the query parameters
        year = request.query_params.get('year')
        if not year:
            return Response(
                {'error': 'A "year" query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            year = int(year)
        except ValueError:
            return Response(
                {'error': 'The "year" parameter must be a valid integer.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 2. Get the optional 'species' parameter
        species = request.query_params.get('species')

        # 3. Start with the base queryset and apply filters
        filtered_queryset = Animal.objects.filter(timestamp__year=year)
        
        if species:
            # Apply species filter if it was provided. 
            # '__iexact' makes the filter case-insensitive (e.g., 'tiger' == 'Tiger')
            filtered_queryset = filtered_queryset.filter(species__iexact=species)
        
        if not filtered_queryset.exists():
            message = f'No data found for the year {year}'
            if species:
                message += f' and species "{species}"'
            message += '.'
            return Response({'message': message}, status=status.HTTP_404_NOT_FOUND)

        # 4. Calculate the required statistics using the filtered queryset
        
        # Max individuals spotted at a time
        max_count_result = filtered_queryset.aggregate(max_count=Max('count'))
        max_individuals = max_count_result.get('max_count', 0)

        # Favourite activity (most frequent behaviour)
        favourite_activity_result = filtered_queryset.values('behaviour') \
            .annotate(behaviour_count=Count('behaviour')) \
            .order_by('-behaviour_count') \
            .first()
        favourite_activity = favourite_activity_result['behaviour'] if favourite_activity_result else 'N/A'

        # Top 3 most visited locations
        top_locations_result = filtered_queryset.values('latitude', 'longitude') \
            .annotate(location_count=Count('id')) \
            .order_by('-location_count')[:3]

        # 5. Format the final response
        response_data = {
            'year': year,
            'max_individuals_spotted': max_individuals,
            'favourite_activity': favourite_activity,
            'top_3_most_visited': list(top_locations_result)
        }
        # Add species to the response if it was used for filtering
        if species:
            response_data['species_filter'] = species

        return Response(response_data)



class CameraViewSet(viewsets.ModelViewSet):
    """
    A simple ViewSet for viewing and editing cameras.
    """
    queryset = Camera.objects.all()
    serializer_class = CameraSerializer
    permission_classes = [AllowAny]  #######
    filter_backends = [DjangoFilterBackend]
    filterset_class = CameraFilter