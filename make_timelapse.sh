#!/bin/bash
# -q:v can get a value between 2-31. 2 is best quality and bigger size, 31 is worst quality and least size)
ffmpeg -r 25 -pattern_type glob -i '*.jpg' -c:v mjpeg -q:v 2 output.avi
