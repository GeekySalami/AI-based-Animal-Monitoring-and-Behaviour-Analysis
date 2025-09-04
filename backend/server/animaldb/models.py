from django.db import models

# Create your models here.

class Animal(models.Model):
    species = models.CharField(max_length=100)
    count = models.IntegerField()
    behaviour = models.TextField()

    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    camera_id = models.CharField(max_length=50)
    timestamp = models.DateTimeField()

    def __str__(self):
  
        return f"{self.species} (Camera: {self.camera_id})"