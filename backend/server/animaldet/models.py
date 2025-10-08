from django.db import models


# Create your models here.

class ip_address(models.Model):
    ip = models.CharField(max_length=100)
    longitude = models.FloatField()
    latitude = models.FloatField()
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.ip