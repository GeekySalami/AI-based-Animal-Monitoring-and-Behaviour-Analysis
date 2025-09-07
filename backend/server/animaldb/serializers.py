from rest_framework import serializers
from .models import Animal, Camera

class AnimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Animal
        fields = '__all__'
        
    def validate_camera_id(self, value):
        """
        This custom validation method checks if a Camera with the given ID
        exists in the database at the time of creation.
        """
        if not Camera.objects.filter(camera_id=value).exists():
            raise serializers.ValidationError(f"Cannot create log: Camera with ID '{value}' does not exist.")
        return value
class CameraSerializer(serializers.ModelSerializer):
    class Meta:
        model = Camera
        fields = '__all__'
    
    
