import struct, os, time, socket, pickle
import matplotlib.pyplot as plt
import numpy as np

ChannelPoints1 = []
ChannelPoints2 = []
ChannelPoints3 = []
ChannelPoints4 = []

currentPosition = 0

def clear_console():
    if os.name == 'nt':
        os.system('cls')  #Windows (we never know..)
    else:
        os.system('clear') #Unix/Linux/MacOS




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


#Now we try and get the data of each channel

def read_data(filename, position):
    global currentPosition
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
                print(f"Trigger point detected. -> {value}")
                # if currentChannel == 1:
                #     ChannelPoints1.append(value)
                # elif currentChannel == 2:
                #     ChannelPoints2.append(value)
                # elif currentChannel == 3:
                #     ChannelPoints3.append(value)
                # elif currentChannel == 4:
                #     ChannelPoints4.append(value)
                total_samples += 1



def MAIN():
    global currentPosition
    #filename = '../data/Card1212_0139.osc'
    filename = '../data/Card1213_0008.osc'

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("127.0.0.1", 7999))
    server_address = ('127.0.0.1', 7888)
    sock.settimeout(10)

    while True:
        try:
            clear_console()

            #Here we get the header of that section of the file
            header = read_header(filename, currentPosition)
            triggers, ticks = rearrange_bytes_and_convert(header)

            headerData = {
                "ADCClockTicks": ticks,
                "TriggerCountCH1": triggers[0],
                "TriggerCountCH2": triggers[1],
                "TriggerCountCH3": triggers[2],
                "TriggerCountCH4": triggers[3]
            }
            
            #Then we get the data of said section
            currentPosition, NbSamples = read_data(filename, currentPosition)

            #print("Channel1 data: ", ChannelPoints1)
            print("Current position : ", currentPosition)
            print("Number of samples: ", NbSamples)

            print(f"Length of channel one array : {len(ChannelPoints1)}")
            print(f"Length of channel two array : {len(ChannelPoints2)}")
            print(f"Length of channel three array : {len(ChannelPoints3)}")
            print(f"Length of channel four array : {len(ChannelPoints4)}")

            print("The data should be ready to be sent !")

            DataPacked = [NbSamples, headerData, ChannelPoints1, ChannelPoints2, ChannelPoints3, ChannelPoints4]

            serializedData = pickle.dumps(DataPacked)
            sizeInBytes = len(serializedData)

            #Here we handle the data transfer to the web app part
            #We start by waiting for a data request
            #Then we send the total size of the current packet
            #We wait for the ACK
            #We send the complete data, etc, etc..

            while True:
                try:
                    print("Waiting for data request..")
                    request, _ = sock.recvfrom(4096)

                    print(f"Message received -> {request.decode()}")

                    if request.decode() == "ND":
                        sock.sendto(str(sizeInBytes).encode(), server_address)

                        print("Waiting for acknowledgment...")
                        ack, _ = sock.recvfrom(4096)

                        print(f"Message received -> {ack.decode()}")

                        if ack.decode() == "ACK":
                            print("Acknowledgment received. Sending data...")
                            # Send the actual serialized data
                            sock.sendto(serializedData, server_address)
                            print(f"{sizeInBytes} Bytes of data sent !")
                            time.sleep(500)
                            break
                except socket.timeout:
                    print("Nobody asked for data, carrying on.")
        except EOFError as e:
            #End of file reached, we start over.
            print(str(e))
            currentPosition = 0


if __name__ == "__main__":
    MAIN()  


    


