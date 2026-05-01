import sys
import os

# Update system path to make the current directory importable
sys.path.insert(0, os.path.abspath('.'))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'server.settings')

import django
django.setup()

from animaldb.urls import router
print("--- Router URLs ---")
for url in router.urls:
    print(url.pattern)
