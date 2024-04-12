#Backend-related imports
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages

#Python general imports
import random

#User-related imports
from django.contrib.auth.models import User
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth import login, logout, authenticate
from .forms import CustomUserCreationForm, CustomAuthenticationForm
from .models import FavoriteColors

# Create your views here.

def get_user_favorite_colors(request):
    # Default color sets
    colorSetsLight = ["green", "red", "gray", "olive", "cyan", "orange", "maroon", "blue", "purple", "black"]
    colorSetsDark = ["lime", "red", "cyan", "yellow", "green", "orange", "pink", "blue", "fuchsia", "white"]

    # Check if the user is authenticated
    if request.user.is_authenticated:
        # Try to get the FavoriteColors instance for the user
        try:
            favorite_colors = FavoriteColors.objects.get(user=request.user)
        except FavoriteColors.DoesNotExist:
            # If it does not exist, create it
            favorite_colors = FavoriteColors.objects.create(user=request.user)
        
        # Now, we have a FavoriteColors instance (either fetched or newly created)
        # Update the color sets to use the user's favorite colors
        colorSetsLight = [
            favorite_colors.CH1_L, favorite_colors.CH2_L, favorite_colors.CH3_L,
            favorite_colors.CH4_L, favorite_colors.CH5_L, favorite_colors.CH6_L,
            favorite_colors.CH7_L, favorite_colors.CH8_L, favorite_colors.CH9_L,
            favorite_colors.CH10_L
        ]
        colorSetsDark = [
            favorite_colors.CH1_D, favorite_colors.CH2_D, favorite_colors.CH3_D,
            favorite_colors.CH4_D, favorite_colors.CH5_D, favorite_colors.CH6_D,
            favorite_colors.CH7_D, favorite_colors.CH8_D, favorite_colors.CH9_D,
            favorite_colors.CH10_D
        ]

    return colorSetsLight, colorSetsDark


def oscillo(request):
    data = {}
    for i in range(1, 11):#set to 1, 11 to generate 10 random channels
        channel = f"CH{i}"
        voltage = random.uniform(0, 8)
        data[channel] = {"voltage": voltage}
    
    colorSetsLight, colorSetsDark = get_user_favorite_colors(request)

    #assign colors to each channel
    c = 0
    for channel in data:
        data[channel]['colorLight'] = colorSetsLight[c]
        data[channel]['colorDark'] = colorSetsDark[c]

        c += 1

    #Specify the signal type
    for channel in data:
        data[channel]['signalType'] = "sin"

    return render(request, 'oscillo/oscillo.html', {"channels":data})


def register_view(request):
    if request.method == 'POST':
        form = CustomUserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            messages.success(request, "Registration successful.")
            return redirect('/')  # Redirect to the home page
        else:
            messages.error(request, "Unsuccessful registration. Invalid information.")
    else:
        form = CustomUserCreationForm()
    return render(request, 'users/register.html', {'form': form})


def login_view(request):
    if request.method == 'POST':
        form = CustomAuthenticationForm(request, data=request.POST)#Here we use a custom form to allow the user to enter either their username or their email
        if form.is_valid():
            username = form.cleaned_data.get('username')
            password = form.cleaned_data.get('password')
            user = authenticate(username=username, password=password)
            if user is not None:
                login(request, user)
                return redirect('/') # Redirect to the home page
            else:
                messages.error(request, "Invalid username/mail or password.")
        else:
            messages.error(request, "Invalid username/mail or password.")
    else:
        form = CustomAuthenticationForm()
    
    return render(request, 'users/login.html', {'form': form})

    
def disconnect(request):
    logout(request)
    return redirect("/")

