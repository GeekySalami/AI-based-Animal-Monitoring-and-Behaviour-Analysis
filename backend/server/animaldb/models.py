from django.db import models

# The Camera model should be defined first, as the Animal model refers to it.
class Camera(models.Model):
    # This remains the primary key for the Camera table.
    camera_id = models.CharField(max_length=50, primary_key=True)
    addtime = models.DateTimeField(auto_now_add=True) # Using auto_now_add is good for creation timestamps
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6,null=True, blank=True)

    def __str__(self):
        # Returning just the ID is cleaner for string representations.
        return self.camera_id

class Animal(models.Model):
    species = models.CharField(max_length=100)
    count = models.IntegerField()
    behaviour = models.TextField()

    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    camera_id = models.CharField(max_length=50)
    
    timestamp = models.DateTimeField()

    def __str__(self):
        # The string representation now uses the stored camera_id field directly.
        return f"{self.species} (Camera: {self.camera_id})"

