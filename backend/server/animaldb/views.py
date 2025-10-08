from rest_framework import viewsets, status
from django.db.models import Count, Max
from datetime import timedelta 
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

    def _calculate_event_count(self, queryset):
        """
        Helper method to calculate animal counts by grouping records into
        sighting events to prevent overcounting. (Method 1)
        """
        records = queryset.order_by('timestamp')
        if not records.exists():
            return 0

        TIME_WINDOW = timedelta(minutes=2)
        sighting_events = []
        processed_record_ids = set()

        for record in records:
            if record.id in processed_record_ids:
                continue

            current_event_records = [record]
            processed_record_ids.add(record.id)
            
            # Find subsequent records from the same camera within the time window
            for other_record in records:
                if (other_record.id not in processed_record_ids and
                    other_record.camera_id == record.camera_id and
                    record.timestamp <= other_record.timestamp < record.timestamp + TIME_WINDOW):
                    
                    current_event_records.append(other_record)
                    processed_record_ids.add(other_record.id)
            
            sighting_events.append(current_event_records)

        # Sum the maximum 'count' from each identified event
        total_count = sum(max(r.count for r in event) for event in sighting_events)
        
        return total_count

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
        
        # calculate average number of individuals in a year:

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

    @action(detail=False, methods=['get'], url_path='monthly-summary')
    def monthly_summary(self, request):
        """
        Calculates the total number of individuals of a given species seen per
        month for a specific year. This uses event-based counting to avoid duplicates.
        
        Example: /api/animals/monthly-summary/?year=2025&species=Tiger
        """
        # 1. Get and validate 'year' and 'species' query parameters
        year = request.query_params.get('year')
        species = request.query_params.get('species')

        if not year or not species:
            return Response(
                {'error': 'Both "year" and "species" query parameters are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            year = int(year)
        except ValueError:
            return Response(
                {'error': 'The "year" parameter must be a valid integer.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 2. Get the base queryset for the entire year and species
        base_queryset = Animal.objects.filter(
            timestamp__year=year,
            species__iexact=species
        )

        # 3. Iterate through each month and calculate the count
        monthly_counts = {}
        for month_num in range(1, 13):
            # Filter the base queryset for the current month
            month_queryset = base_queryset.filter(timestamp__month=month_num)
            
            # Use the helper method to get the accurate count
            count = self._calculate_event_count(month_queryset)
            monthly_counts[month_num] = count

        # 4. Format the response to use month names as keys
        month_map = {
            1: 'jan', 2: 'feb', 3: 'mar', 4: 'apr', 5: 'may', 6: 'jun',
            7: 'jul', 8: 'aug', 9: 'sep', 10: 'oct', 11: 'nov', 12: 'dec'
        }
        
        response_data = {month_map[month]: count for month, count in monthly_counts.items()}
        
        return Response(response_data)

    #heaatmap data
    
    @action(detail=False, methods=['get'], url_path='heatmap-data')
    def heatmap_data(self, request):
        """
        Provides data formatted for a heatmap, showing the total number of 
        individuals counted at each unique coordinate pair for a given year.
        
        Example: /api/animals/heatmap-data/?year=2025&species=Tiger
        """
        # 1. Get and validate query parameters
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
            
        species = request.query_params.get('species')

        # 2. Create the base queryset filtered by year and optionally species
        base_queryset = Animal.objects.filter(timestamp__year=year)
        if species:
            base_queryset = base_queryset.filter(species__iexact=species)
            
        # 3. Get all unique latitude/longitude pairs from the filtered data
        unique_locations = base_queryset.values('latitude', 'longitude').distinct()
        
        heatmap_data = []
        # 4. For each unique location, calculate the accurate event-based count
        for location in unique_locations:
            lat = location['latitude']
            lon = location['longitude']
            
            # Create a queryset for just this specific location
            location_queryset = base_queryset.filter(latitude=lat, longitude=lon)
            
            # Reuse your accurate counting logic for this location's records
            count_at_location = self._calculate_event_count(location_queryset)
            
            # Add the result to our list if any animals were counted
            if count_at_location > 0:
                # Convert Decimal to float for JSON compatibility
                heatmap_data.append([float(lat), float(lon), count_at_location])
                
        return Response(heatmap_data)


class CameraViewSet(viewsets.ModelViewSet):
    """
    A simple ViewSet for viewing and editing cameras.
    """
    queryset = Camera.objects.all()
    serializer_class = CameraSerializer
    permission_classes = [AllowAny]  #######
    filter_backends = [DjangoFilterBackend]
    filterset_class = CameraFilter