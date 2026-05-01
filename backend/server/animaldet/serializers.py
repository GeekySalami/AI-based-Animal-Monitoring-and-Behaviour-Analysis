from rest_framework import serializers
from .models import ip_address

class IpAddressSerializer(serializers.ModelSerializer):
    """
    Serializer for the ip_address model.
    """
    class Meta:
        model = ip_address
        fields = '__all__'