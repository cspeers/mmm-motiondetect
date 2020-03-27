# mmm-motiondetect

## A simple port of the existing motion detection module but done in Typescript because
- Uses DPMS or vgencmd depending on platform
- Alternatively it will just force hide all modules to leave a black screen
---
## Configuration Options

- **captureIntervalTime**   number
    - _the interval for the video capture loop_
- **scoreThreshold**    number
    - _the motion detection score_
- **captureWidth**  number
    - _full captured image width_
- **captureHeight**  number,
    - _full captured image height_
- **differenceHeight**  number    
    - _the height of the differencing image_
- **differenceWidth**  number    
    - _the width of the differencing image_
- **displayTimeout**  number
    - _the time after which the display will power off in seconds_
- **checkState**    boolean
    - _whether to check the monitor state before changing_
- **displayPreview**  boolean
    - _whether to show the captured video_
- **usePower**  boolean
    - _whether to blank using power_
- **fadeoutTime**   number    
    - _the time the module fade will be_
    
