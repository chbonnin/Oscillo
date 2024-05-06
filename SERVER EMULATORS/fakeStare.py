#!/usr/bin/python3
# coding: utf-8
import socket
import optparse
import time
import math

parser = optparse.OptionParser(usage="%prog [options] \n\nSend data via UDP protocol")
parser.add_option("-s", "--size", action="store", dest="size", help="Taille des paquets de données en octets", default=8192)
parser.add_option("-n", "--nb", action="store", dest="nb", help="Nombre d'échantillons par frame", default=1024)
parser.add_option("-c", "--channels", action="store", dest="channels", help="Nombre de voies", default=1)
parser.add_option("-d", "--delay", action="store", dest="delay", help="Durée entre deux envois (en ms)", default=100)
parser.add_option("-f", "--file", action="store", dest="file", help="chemin du fichier où lire les données")
parser.add_option("-i", "--ip", action="store", dest="ip", help="adresse ipv4 où envoyer les données", default="127.0.0.1")
parser.add_option("-p", "--port", action="store", dest="port", help="Numéro de port", default=7888)
parser.add_option("-r", "--repeat", action="store", dest="repeat", help="Nombre d'envois de paquets", default=0)
parser.add_option("-g", "--group", action="store", dest="group", help="Nombre de paquets regroupés dans un envoi (supplémentaire, 1 par défaut)", default=1)

(options, args) = parser.parse_args()

# Create a datagram socket
UDPServerSocket = socket.socket(family=socket.AF_INET, type=socket.SOCK_DGRAM)

# Convert all relevant option variables to integers
options.nb = int(options.nb)
options.size = int(options.size)
options.channels = int(options.channels)
options.delay = int(options.delay)
options.repeat = int(options.repeat)

expected_buffer_size = options.nb * options.channels * 2

if expected_buffer_size > options.size:#This is required to not have a buffer overflow and not have to constantly specify by hand the size of the buffer
    options.size = expected_buffer_size
    print("Updating buffer size")

iHeight = 1 << 15
phases = [0, math.pi / 3, math.pi / 2, math.pi, math.pi / 4, math.pi / 14]  # Different phase shifts for variety
frequencies = [1, 2, 3, 4, 5, 6, 7, 8, 9]  # Different frequencies for each channel
arrBytes = bytearray(options.size)

print("Expected Buffer Size:", expected_buffer_size)
print(f"This corresponds to 1024 samples per frame * {options.channels} channels * 2 bytes per sample !")
print("Actual Buffer Size:", len(arrBytes))

for iRepeat in range(max(1, options.repeat)):
    for iCh in range(options.channels):
        phase = phases[iCh % len(phases)]
        frequency = frequencies[iCh % len(frequencies)]
        for iSmp in range(options.nb):
            angle = (iSmp * frequency * 2 * math.pi / options.nb) + phase
            iVal = int((math.sin(angle) + 1) / 2 * iHeight)
            byte_index = (iSmp * options.channels + iCh) * 2
            arrBytes[byte_index] = iVal & 0xFF
            arrBytes[byte_index + 1] = iVal >> 8


while True:
    UDPServerSocket.sendto(arrBytes, (options.ip, options.port))
    time.sleep(int(options.delay) / 1000)

