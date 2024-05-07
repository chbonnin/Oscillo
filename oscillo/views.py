#Backend-related imports
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.http import HttpResponse, JsonResponse
from django.views.generic import TemplateView
from django.core.files.storage import FileSystemStorage
from django.conf import settings
from tempfile import NamedTemporaryFile

#Python general imports
import random
import json
import socket
import pickle
import sys
import base64
import os
import struct, time

#User-related imports
from django.contrib.auth.models import User
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth import login, logout, authenticate
from .forms import CustomUserCreationForm, CustomAuthenticationForm, OscilloSettingsForm
from .models import FavoriteColors


def clear_console():
    if os.name == 'nt':
        os.system('cls')  #Windows (we never know..)
    else:
        os.system('clear') #Unix/Linux/MacOS

class Main(TemplateView):
    #This 'context' variable is what tells us what to expect before rendering the actual oscilloscope screen.
    #During testing these values need to be changed by hand here but later on will sent via the server depending on what the user selected
    context = {"mode": "NA", "channels": 3, "freq": 1e8, "nb": 1024, "voltage": 2.2, "bits": 16, "file_path": "NA", "file_position": 0}

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

        if self.context['mode'] == 'FILE':
            file_size = request.session.get('file_size', 0)
            print(f"Getting ready to render the page with a file that has a size of {file_size:.2f} MB")

        return render(request, 'oscillo/graph.html', {"channels":data})
    
    

    def oscilloSelect(self, request):
        if request.method == 'POST':
            form = OscilloSettingsForm(request.POST, request.FILES)
            if form.is_valid():
                if form.cleaned_data['mode'] == 'FILE':
                    self.context['channels'] = 4
                    self.context['freq'] = 1e8
                    self.context['nb'] = 1024
                    self.context['voltage'] = 2.2 #normal values are -1.1V+1.1V so 2.2V total range.
                    self.context['bits'] = 16
                    self.context['mode'] = 'FILE'

                    #Handle the file upload.
                    print("Getting file size")
                    file = form.cleaned_data['file']
                    file_size_in_bytes = file.size
                    file_size_in_mb = file_size_in_bytes / (1024 * 1024)
                    print(f"Uploaded file size: {file_size_in_mb:.2f} MB")

                    temp_file = NamedTemporaryFile(delete=False, suffix=".osc", dir=os.path.join(settings.BASE_DIR, 'temp_files'))
                    for chunk in file.chunks():
                        temp_file.write(chunk)
                    temp_file.close()

                    print(f"File saved to temporary location: {temp_file.name}")

                    request.session['file_path'] = temp_file.name
                    request.session['file_size'] = file_size_in_mb
                    self.context['file_path'] = temp_file.name
                    print("FIle infos saved to session")

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
            self.sock.settimeout(1)
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


    def getRawData(self, request):
        if not self.sock:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.sock.bind(("127.0.0.1", 7777))
            self.sock.settimeout(1)
            print("bound")

        data, adr = self.sock.recvfrom(8192)
        print("received", len(data))
        return HttpResponse(data)


    def getFileData2(self, request, filePosition, fileName):
        print(f"GET DATA AT POSITION {filePosition} FOR FILE {fileName}")

        completeFilePath = os.path.join(settings.BASE_DIR, 'temp_files') + "/" + fileName
        Data = read_file(completeFilePath, filePosition)
        if Data == "EOF":#End Of File
            Data = read_file(completeFilePath, 0)

        clear_console()
        print("====================================================")
        print("           Data returned from the file")
        print("             --------------------")
        print("Number of samples: ", Data[0][0])
        print("New position in the file: ", Data[1])
        print("Length of CH1 : ", len(Data[0][2]))
        print("Length of CH2 : ", len(Data[0][3]))
        print("Length of CH3 : ", len(Data[0][4]))
        print("Length of CH4 : ", len(Data[0][5]))
        print("Header Data : ", Data[0][1])
        print("====================================================")
        return JsonResponse(Data, safe=False)


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


def read_file(file_path, position_within_the_file):
    ChannelPoints1 = []
    ChannelPoints2 = []
    ChannelPoints3 = []
    ChannelPoints4 = []

    def read_header(filename, position):
        with open(filename, 'rb') as file:
            file.seek(position)
            header = file.read(22)  # Read the first 22 bytes of the file
            if len(header) < 22:
                raise EOFError("Unable to read full header; end of file reached.")
            return header

    def rearrange_bytes_and_convert(header):
        # Unpacking and rearranging the first 16 bytes for trigger counts
        triggers = []
        for i in range(0, 16, 4):
            # Extract 4 bytes, reorder them from 3-4-1-2 to standard big-endian
            reordered = header[i+2:i+4] + header[i:i+2]
            # Convert reordered bytes to a number
            trigger_count = struct.unpack('>I', reordered)[0]
            triggers.append(trigger_count)
        
        # Unpacking and rearranging the last 6 bytes for ADC clock ticks
        # Original order: 5-6-3-4-1-2, we need to reorder to 1-2-3-4-5-6
        reordered_ticks = header[20:22] + header[18:20] + header[16:18]
        # Convert reordered bytes to a number, pad to 8 bytes for unpacking as 64-bit int
        ticks = struct.unpack('>Q', b'\x00\x00' + reordered_ticks)[0]

        return triggers, ticks

    def read_data(filename, position):
        with open(filename, 'rb') as file:
            file.seek(22 + position) #skip the header (22bytes long), indexing starts at 0
            total_samples = 0
            currentChannel = None

            #Here we make sure the arrays are empty and not full from a previous loop
            ChannelPoints1.clear()
            ChannelPoints2.clear()
            ChannelPoints3.clear()
            ChannelPoints4.clear()

            while True:
                bytes_read = file.read(2)
                value = struct.unpack('>h', bytes_read)[0]
                if value == -1:
                    if currentChannel is None:
                        currentChannel = 1
                    elif currentChannel == 1:
                        currentChannel = None
                elif value == -2:
                    if currentChannel == None:
                        currentChannel = 2
                    elif currentChannel == 2:
                        currentChannel = None
                    continue
                elif value == -3:
                    if currentChannel == None:
                        currentChannel = 3
                    elif currentChannel == 3:
                        currentChannel = None
                    continue
                elif value == -4:
                    if currentChannel == None:
                        currentChannel = 4
                    elif currentChannel == 4:
                        currentChannel = None
                        CurrentPosition = file.tell()
                        return CurrentPosition, total_samples
                elif value == 24575 or value == 24576:#positive / negative overflow
                    continue
                elif value >= 0 and value <= 16383:
                    if currentChannel == 1:
                        ChannelPoints1.append(value)
                    elif currentChannel == 2:
                        ChannelPoints2.append(value)
                    elif currentChannel == 3:
                        ChannelPoints3.append(value)
                    elif currentChannel == 4:
                        ChannelPoints4.append(value)
                    total_samples += 1
                elif value < -4:
                    total_samples += 1

    def MAIN(position_within_the_file):
        filename = file_path

        try:
            #Here we get the header of that section of the file
            header = read_header(filename, position_within_the_file)
            triggers, ticks = rearrange_bytes_and_convert(header)

            headerData = {
                "ADCClockTicks": ticks,
                "TriggerCountCH1": triggers[0],
                "TriggerCountCH2": triggers[1],
                "TriggerCountCH3": triggers[2],
                "TriggerCountCH4": triggers[3]
            }
            
            #Then we get the data of said section
            position_within_the_file, NbSamples = read_data(filename, position_within_the_file)

            DataPacked = [NbSamples, headerData, ChannelPoints1, ChannelPoints2, ChannelPoints3, ChannelPoints4]

            return DataPacked, position_within_the_file

        except EOFError as e:
            #End of file reached, we start over.
            print(str(e))
            return "EOF"

    return MAIN(position_within_the_file)