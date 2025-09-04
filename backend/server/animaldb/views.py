from rest_framework import viewsets
from django_filters.rest_framework import DjangoFilterBackend 
from .models import Animal
from .serializers import AnimalSerializer
from .filters import AnimalFilter 
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

