from django.shortcuts import render
import random

# Create your views here.

def home_oscillo(request):
    default_data = {}
    for i in range(1, 11):
        channel = f"CH{i}"
        voltage = random.uniform(0, 5)
        default_data[channel] = {"voltage": voltage}

    print("Default data: ", default_data)

    return render(request, 'oscillo/home.html')