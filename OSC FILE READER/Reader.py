import struct
import time
import matplotlib.pyplot as plt
import numpy as np

Headers = []
ChannelPoints1 = []
ChannelPoints2 = []
ChannelPoints3 = []
ChannelPoints4 = []

currentPosition = 0

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
        firstLoop = True

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
                    return CurrentPosition
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




def plot_channel_data(channel_data):
    # Calculate the 10th and 90th percentiles as the cutoffs to exclude very low and high values
    low_cutoff = np.percentile(channel_data, 10)
    high_cutoff = np.percentile(channel_data, 90)
    # Filter out values below the low cutoff and above the high cutoff
    filtered_data = [value for value in channel_data if low_cutoff <= value <= high_cutoff]
    
    # Check the number of points to plot and downsample if necessary
    if len(filtered_data) > 10000:
        downsample_rate = 500
        sampled_data = filtered_data[::downsample_rate]
        x_values = range(0, len(filtered_data), downsample_rate)
    else:
        sampled_data = filtered_data
        x_values = range(len(filtered_data))

    # Finding the smallest and biggest values in the filtered channel_data
    smallest_value = min(filtered_data) if filtered_data else None
    biggest_value = max(filtered_data) if filtered_data else None
    print("The smallest value in the filtered channel data is:", smallest_value)
    print("The biggest value in the filtered channel data is:", biggest_value)

    plt.figure(figsize=(18, 5))  # Set the figure size for better visibility
    plt.plot(x_values, sampled_data, label='Channel 3 Data', linewidth=0.8, color='purple')
    plt.title('Channel 3 Sample Points (Filtered)')
    plt.xlabel('Sample Index')
    plt.ylabel('Sample Value')
    plt.legend()
    plt.grid(True)
    plt.show()





def MAIN():
    global currentPosition
    #filename = '../data/Card1212_0139.osc'
    filename = '../data/testfile3.osc'

    while True:
        try:
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

            Headers.append(headerData)

            #Then we get the data of said section
            data = read_data(filename, currentPosition)
            currentPosition = data

            #print("Channel1 data: ", ChannelPoints1)
            # print("Header: ", Headers)
            print("Current position : ", currentPosition)

            #break
        except EOFError as e:
            print(str(e))
            print("The data should be ready to be displayed.")
            print(f"Length of channel one array : {len(ChannelPoints1)}")
            print(f"Length of channel two array : {len(ChannelPoints2)}")
            print(f"Length of channel three array : {len(ChannelPoints3)}")
            print(f"Length of channel four array : {len(ChannelPoints4)}")
            break
        

if __name__ == "__main__":
    MAIN()
    plot_channel_data(ChannelPoints3)


