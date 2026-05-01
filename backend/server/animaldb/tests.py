from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from .models import Animal
from datetime import datetime
import pytz
from django.contrib.auth.models import User # <-- Add this import for creating a test user

class AnimalAPITests(APITestCase):
    """
    Test suite for the Animal API endpoints.
    """

    def setUp(self):
        """
        Set up the test database with some initial animal data.
        This method is run before each test function.
        """
        # Create a test user for authenticated requests
        self.user = User.objects.create_user('testuser', 'password')

        # It's good practice to use a timezone-aware datetime object for tests
        utc = pytz.UTC

        # FIX: The Animal model's `timestamp` field likely has `auto_now_add=True`.
        # This causes the timestamp passed in `create()` to be ignored.
        # To fix this in the test, we create the object first, then manually
        # set and save the desired timestamp to override the `auto_now_add` behavior.
        self.animal1 = Animal.objects.create(
            species="Lion", count=2, behaviour="Resting in the shade",
            latitude=1.2827, longitude=36.8219, camera_id="CAM-01"
        )
        self.animal1.timestamp = utc.localize(datetime(2025, 9, 1, 10, 0, 0))
        self.animal1.save()

        self.animal2 = Animal.objects.create(
            species="Elephant", count=5, behaviour="Drinking at the waterhole",
            latitude=1.2921, longitude=36.8219, camera_id="CAM-02"
        )
        self.animal2.timestamp = utc.localize(datetime(2025, 9, 1, 12, 30, 0))
        self.animal2.save()

        self.animal3 = Animal.objects.create(
            species="Lion", count=1, behaviour="Stalking prey",
            latitude=1.2855, longitude=36.8250, camera_id="CAM-01"
        )
        self.animal3.timestamp = utc.localize(datetime(2025, 9, 2, 8, 0, 0))
        self.animal3.save()

    def test_list_animals(self):
        """
        Ensure we can retrieve the list of all animals.
        """
        url = reverse('animal-list')  # 'animal' is the basename we set in urls.py
        response = self.client.get(url, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3) # We created 3 animals in setUp

    def test_create_animal(self):
        """
        Ensure we can create a new animal object.
        """
        url = reverse('animal-list')
        data = {
            "species": "Giraffe",
            "count": 1,
            "behaviour": "Eating from a tall tree",
            "latitude": "1.2900",
            "longitude": "36.8300",
            "camera_id": "CAM-03",
        }

        # FIX: The create endpoint requires authentication, which was causing a 403 Forbidden error.
        # We force-authenticate the client with the user created in setUp().
        self.client.force_authenticate(user=self.user)

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Animal.objects.count(), 4)
        self.assertEqual(Animal.objects.get(id=response.data['id']).species, 'Giraffe')

    def test_filter_by_species(self):
        """
        Ensure we can filter animals by species (case-insensitive).
        """
        url = reverse('animal-list')
        response = self.client.get(url + '?species=lion', format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        # Check that both returned animals are indeed Lions
        self.assertEqual(response.data[0]['species'], 'Lion')
        self.assertEqual(response.data[1]['species'], 'Lion')


    def test_filter_by_timestamp_range(self):
        """
        Ensure we can filter animals by a start and end timestamp.
        """
        url = reverse('animal-list')
        # We want to find sightings on September 1st, 2025
        query_params = '?start_timestamp=2025-09-01T00:00:00Z&end_timestamp=2025-09-01T23:59:59Z'
        response = self.client.get(url + query_params, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        # Verify the species of the returned objects to be sure
        species_list = sorted([item['species'] for item in response.data])
        self.assertEqual(species_list, ['Elephant', 'Lion'])

