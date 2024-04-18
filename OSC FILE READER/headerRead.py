import struct

def read_header(filename):
    with open(filename, 'rb') as file:
        header = file.read(22)  # Read the first 22 bytes of the file
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


filename = 'Card1213_0008.osc'
header = read_header(filename)
triggers, ticks = rearrange_bytes_and_convert(header)

print("Trigger Counts per Channel:", triggers)
print("ADC Clock Ticks:", ticks)

