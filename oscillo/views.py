#Backend-related imports
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.http import HttpResponse, JsonResponse
from django.views.generic import TemplateView

#Python general imports
import random
import json
import socket
import pickle

#User-related imports
from django.contrib.auth.models import User
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth import login, logout, authenticate
from .forms import CustomUserCreationForm, CustomAuthenticationForm
from .models import FavoriteColors
from .forms import OscilloSettingsForm

class Main(TemplateView):
    #This 'context' variable is what tells us what to expect before rendering the actual oscilloscope screen.
    #During testing these values need to be changed by hand here but later on will sent via the server depending on what the user selected
    context = {"mode": "NA", "channels": 3, "freq": 1e8, "nb": 1024, "voltage": 10, "bits": 14}
    
    
    sock: socket = None

    def index(self, request):
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

        return render(request, 'oscillo/graph.html', {"channels":data})
    
    

    def oscilloSelect(self, request):
        if request.method == 'POST':
            form = OscilloSettingsForm(request.POST)
            if form.is_valid():
                if form.cleaned_data['mode'] == 'FILE':
                    self.context['channels'] = 4
                    self.context['freq'] = form.cleaned_data['freq']
                    self.context['nb'] = 'NA'
                    self.context['voltage'] = 2.2 #normal values are -1.1V+1.1V so 2.2V total range.
                    self.context['bits'] = 16
                    self.context['mode'] = 'FILE'
                else:
                    self.context['channels'] = form.cleaned_data['channels']
                    self.context['freq'] = form.cleaned_data['freq']
                    self.context['nb'] = form.cleaned_data['nb']
                    self.context['voltage'] = form.cleaned_data['voltage']
                    self.context['bits'] = form.cleaned_data['bits']
                    self.context['mode'] = form.cleaned_data['mode']
                return redirect('/oscillo/start/')
        else:
            form = OscilloSettingsForm()
            return render(request, 'oscillo/select.html', {'form': form})


    def settings(self, request):#In the future (in prod) this function will retrieve the settings from the server (starecontrol)
        return HttpResponse(json.dumps(self.context))


    def getData(self, request):
        if not self.sock:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.sock.bind(("127.0.0.1", 7888))
            self.sock.settimeout(3000)
            print("bound")

        try:
            #Here we update the amount of bytes we expect to receive based off of the settings we received.
            #Nb of channels * 1024 samples per frame * 2 bytes per sample
            expected_data_to_send = self.context['channels'] * 1024 * 2

            data, _ = self.sock.recvfrom(expected_data_to_send)
            print(f"Data received is {len(data)} bytes long")
            return HttpResponse(data, content_type="application/octet-stream")
        except socket.timeout:
            return HttpResponse("No data received so far..", status=408)
        
    
    def getFileData(self, request):
        if not self.sock:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.sock.bind(("127.0.0.1", 7888))
            self.sock.settimeout(1)
            print("Socket bound")
        
        try:
            #First we let the reader_sender server know we need data:
            
            print("Sending ND message")
            message = "ND"
            self.sock.sendto(message.encode(), ("127.0.0.1", 7999))

            # Receive the length of the data
            data_length, address = self.sock.recvfrom(4096)
            print("Received message [data length] -> ", data_length.decode())

            print("Sending ACK message.")
            # Send acknowledgment
            self.sock.sendto(b'ACK', address)

            # Convert data length to integer
            expected_data_to_receive = int(data_length.decode())

            print("Receiving final data")
            # Receive the actual data
            data, _ = self.sock.recvfrom(expected_data_to_receive)
            print(f"Received message [data] -> {len(data)} bytes long")

            decoded_data = pickle.loads(data)

            print("Length of decoded data:", len(decoded_data))
            print(f"Number of samples for this set of data : {decoded_data[0]}")
            print(f"Header data for this set of data : {decoded_data[1]}")
            return JsonResponse(decoded_data, safe=False)
        except socket.timeout:
            return HttpResponse("No data received from the file reader..", status=408)
        except Exception as E:
            print("ERROR OCCURED !")
            print(E)
            return HttpResponse(f"An error occured : {str(E)}", status=500)
            

    def getContinousData(self, request):
        #tbd
        pass


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

