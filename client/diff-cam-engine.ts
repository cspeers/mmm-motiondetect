"use strict"

//#region Declarations

declare type AudioCapabilities = object;

declare interface IMediaBounds {
    min?: number;
    max?: number;
    ideal?: number;
}

interface IVideoSize<T> {
    /** video width bounds */
    width: T
    /** video height bounds */
    height: T
}

interface IMediaConstraints<T> {
    /** audio constraints */
    audio: T;
    /** video constraints */
    video: T;
}

/** GetUserMedia Video Capture Capabilities */
declare type IVideoCapabilities = IVideoSize<object | number | IMediaBounds>

/** GetUserMedia constraints */
declare type IUserMediaConstraints = IMediaConstraints<boolean | AudioCapabilities>

declare interface MediaStreamAccquired {
    (stream: MediaStream): void
}

declare interface MediaStreamAcquireError {
    (error: MediaStreamError): void
}

/** generic callback */
interface ICaptureEngineCallback<T> {
    (o?: T): void
}

declare interface IBounds<T> {
    min: T; max: T;
}

declare interface ICoordinate<T> {
    x: T; y: T;
}

declare class MotionBox implements ICoordinate<IBounds<number>>{
    x: IBounds<number>; y: IBounds<number>;
}

declare class Coordinate implements ICoordinate<number> {
    x: number; y: number;
}

declare type MotionPixels = (any | boolean)[][];

declare interface IDifference {
    score: number
    motionBox?: MotionBox
    motionPixels?: MotionPixels
}

declare interface IDifferenceResult extends IDifference {
    hasMotion: boolean
    imageData: ImageData
    getURL(): string
    checkMotionPixel(x: number, y: number): boolean
}

/** Options for usermedia capture */
declare interface ICameraDifferenceOptions {
    /** class logger */
    log?: ILogger
    /** constraints for the media capture */
    constraints?: IUserMediaConstraints;
    /** video element host for the media stream */
    video?: HTMLVideoElement;
    /** canvas element holding the detected motion */
    motionCanvas?: HTMLCanvasElement;
    /** the interval at which media will be captured */
    captureInterval?: number
    /** the size of the video frame to be captured */
    captureSize?: IVideoSize<number>
    /** the size of the video frame to be used for motion detection */
    differenceSize?: IVideoSize<number>
    pixelThreshold?: number
    scoreThreshold?: number
    includeMotionBox?: boolean
    includeMotionPixels?: boolean
    /** callback on stream ready */
    onStreamReadyCallback?: ICaptureEngineCallback<any>
    /** callback on stream stop */
    onStreamStopCallback?: ICaptureEngineCallback<any>
    /** callback on media capture */
    onImageCaptureCallback?: ICaptureEngineCallback<any>
    /** call back on image difference completion */
    onDifferenceCallback?: ICaptureEngineCallback<IDifferenceResult>
}

/** simple logging interface */
declare interface ILogger {
    /** log info */
    info(message?: any, ...optionalParams: any[]): void
    /** log warning */
    warn(message?: any, ...optionalParams: any[]): void
    /** log error */
    error(message?: any, ...optionalParams: any[]): void
}

/** Interface for capturing usermedia on a set interval */
interface ICameraDifferenceEngine extends ICameraDifferenceOptions {
    timeout: any
    /** whether there is an existing image to difference */
    readyToDifference: boolean
    /** whether the usermedia stream is ready */
    streamReady: boolean
    /** the attached usermedia stream */
    stream: MediaStream
    /** Initialize and request the stream
     * @param {ICameraDifferenceOptions} options the intialization options
     */
    initialize(options: ICameraDifferenceOptions): void | Promise<ICameraDifferenceEngine>
    /** Start Capturing the usermedia stream */
    start(): void | Promise<ICameraDifferenceEngine>
    /** Stop Capturing from the usermedia stream */
    stop(): void | Promise<ICameraDifferenceEngine>

    /** called on stop */
    onStreamStopCallback: ICaptureEngineCallback<ICameraDifferenceEngine>;
    /** called on the capture interval */
    onImageCaptureCallback: ICaptureEngineCallback<ICameraDifferenceEngine>;
    /** called on when the usermedia stream is ready */
    onStreamReadyCallback: ICaptureEngineCallback<ICameraDifferenceEngine>;
    /** called when the current frame is analyzed for motion */
    onDifferenceCallback: ICaptureEngineCallback<IDifferenceResult>
}

//#endregion

class CameraDifferenceEngineClass implements ICameraDifferenceEngine {
    readyToDifference: boolean
    timeout: any
    constraints: IUserMediaConstraints;
    captureSize: IVideoSize<number>;
    captureInterval: number
    streamReady: boolean;
    stream: MediaStream;
    video: HTMLVideoElement;
    motionCanvas: HTMLCanvasElement;
    differenceSize: IVideoSize<number>
    pixelThreshold: number
    scoreThreshold: number
    includeMotionBox: boolean
    includeMotionPixels: boolean

    log: ILogger = {
        info(message: string) { console.info(`[INFO] ${message}`) },
        warn(message: string) { console.warn(`[WARN] ${message}`) },
        error(message: string) { console.error(`[ERROR] ${message}`) }
    }

    onStreamStopCallback: ICaptureEngineCallback<ICameraDifferenceEngine>;
    onImageCaptureCallback: ICaptureEngineCallback<ICameraDifferenceEngine>;
    onStreamReadyCallback: ICaptureEngineCallback<ICameraDifferenceEngine>;
    onDifferenceCallback: ICaptureEngineCallback<IDifferenceResult>;

    private captureCanvas: HTMLCanvasElement;
    private captureContext: CanvasRenderingContext2D
    private differenceCanvas: HTMLCanvasElement;
    private differenceContext: CanvasRenderingContext2D
    private motionContext: CanvasRenderingContext2D

    //#region Image Helpers

    private checkMotionPixel(motionPixels: MotionPixels, x: number, y: number): boolean {
        return motionPixels && motionPixels[x] && motionPixels[x][y];
    }

    private calculateMotionPixels(motionPixels: MotionPixels, x: number, y: number) {
        motionPixels[x] = motionPixels[x] || [];
        motionPixels[x][y] = true;
        return motionPixels;
    }

    private calculateMotionBox(currentMotionBox: MotionBox, coordinates: Coordinate, x: number, y: number) {
        var motionBox = currentMotionBox || {
            x: { min: coordinates.x, max: x },
            y: { min: coordinates.y, max: y }
        };
        motionBox.x.min = Math.min(motionBox.x.min, x);
        motionBox.x.max = Math.max(motionBox.x.max, x);
        motionBox.y.min = Math.min(motionBox.y.min, y);
        motionBox.y.max = Math.max(motionBox.y.max, y);
        return motionBox;
    }

    private calculateCoordinates(pixelIndex: number): Coordinate {
        return {
            x: pixelIndex % this.differenceSize.width,
            y: Math.floor(pixelIndex / this.differenceSize.width)
        }
    }

    private processDifference(image: ImageData): IDifference {
        let score = 0;
        let motionBox: MotionBox = undefined;
        let motionPixels: MotionPixels = this.includeMotionPixels ? [] : undefined
        let rgba = image.data;
        for (let i = 0; i < rgba.length; i += 4) {
            let pixelDiff = rgba[i] * 0.3 + rgba[i + 1] * 0.6 + rgba[i + 2] * 0.1;
            let normalized = Math.min(255, pixelDiff * (255 / this.pixelThreshold));
            rgba[i] = 0;
            rgba[i + 1] = normalized;
            rgba[i + 2] = 0;
            if (pixelDiff >= this.pixelThreshold) {
                score++
                //calculate the coordinates
                let coords = this.calculateCoordinates(i / 4)
                //calculate the motion box
                if (this.includeMotionBox) {
                    motionBox = this.calculateMotionBox(motionBox, coords, coords.x, coords.y)
                }
                if (this.includeMotionPixels) {
                    motionPixels = this.calculateMotionPixels(motionPixels, coords.x, coords.y)
                }
            }
        }
        return {
            score: score,
            motionBox: motionBox,
            motionPixels: motionPixels
        }
    }
    //#endregion

    private capture(): void {
        //save full-sized copy
        this.captureContext.drawImage(this.video, 0, 0);
        let captureImageData = this.captureContext.getImageData(0, 0, this.captureSize.width, this.captureSize.height);
        //difference over previous capture
        this.differenceContext.globalCompositeOperation = 'difference';
        this.differenceContext.drawImage(this.video, 0, 0, this.differenceSize.width, this.differenceSize.height);
        let diffImageData = this.differenceContext.getImageData(0, 0, this.differenceSize.width, this.differenceSize.height);
        if (this.readyToDifference) {
            let difference = this.processDifference(diffImageData);
            this.motionContext.putImageData(diffImageData, 0, 0);
            if (difference.motionBox) {
                this.motionContext.strokeStyle = '#fff';
                this.motionContext.strokeRect(
                    difference.motionBox.x.min + 0.5,
                    difference.motionBox.y.min + 0.5,
                    difference.motionBox.x.max - difference.motionBox.x.min,
                    difference.motionBox.y.max - difference.motionBox.y.min
                );
            }
            let result: IDifferenceResult = {
                score: difference.score,
                hasMotion: difference.score >= this.scoreThreshold,
                imageData: captureImageData,
                motionBox: difference.motionBox,
                motionPixels: difference.motionPixels,
                checkMotionPixel: (x, y) => {
                    return this.checkMotionPixel(difference.motionPixels, x, y);
                },
                getURL: () => {
                    return this.captureCanvas.toDataURL()
                }
            }
            this.onDifferenceCallback(result);
        }
        // draw current capture normally over diff, ready for next time
        this.differenceContext.globalCompositeOperation = 'source-over';
        this.differenceContext.drawImage(this.video, 0, 0, this.differenceSize.width, this.differenceSize.height);
        this.readyToDifference = true;
        this.onImageCaptureCallback(this)
        this.timeout = setTimeout(() => this.capture(), this.captureInterval);
    }

    async initialize(options: ICameraDifferenceOptions): Promise<ICameraDifferenceEngine> {
        try {
            if (options.log) this.log = options.log
            this.video = options.video || document.createElement('video');
            this.constraints = options.constraints || { audio: false, video: true }
            this.motionCanvas = options.motionCanvas || document.createElement('canvas');
            this.captureInterval = options.captureInterval || 100;
            this.captureSize = options.captureSize || { width: 640, height: 480 }
            this.differenceSize = options.differenceSize || { width: 64, height: 48 }
            this.pixelThreshold = options.pixelThreshold || 32;
            this.scoreThreshold = options.scoreThreshold || 16;
            this.includeMotionBox = options.includeMotionBox || false;
            this.includeMotionPixels = options.includeMotionPixels || false;

            // callbacks
            this.onStreamReadyCallback = options.onStreamReadyCallback || function (i) { }
            this.onImageCaptureCallback = options.onImageCaptureCallback || function (i) { }
            this.onStreamStopCallback = options.onStreamStopCallback || function (i) { }
            this.onDifferenceCallback = options.onDifferenceCallback || function (r) { }

            this.video.autoplay = true;

            // non-configurable
            this.captureCanvas = document.createElement('canvas');
            this.captureCanvas.width = this.captureSize.width;
            this.captureCanvas.height = this.captureSize.height;
            this.captureContext = this.captureCanvas.getContext('2d');

            this.differenceCanvas = document.createElement('canvas');
            this.differenceCanvas.width = this.differenceSize.width;
            this.differenceCanvas.height = this.differenceSize.height;
            this.differenceContext = this.differenceCanvas.getContext('2d');

            this.motionCanvas.width = this.differenceSize.width;
            this.motionCanvas.height = this.differenceSize.height;
            this.motionContext = this.motionCanvas.getContext('2d');

            this.log.info("Intializing User Media Stream...")
            this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);
            this.onStreamReadyCallback(this)
            return this;
        } catch (error) {
            throw `Error intializing usermedia ${error.message}`
        }
    }
    async start(): Promise<ICameraDifferenceEngine> {
        try {
            this.log.info('Starting UserMedia Capture to Stream...');
            if (!this.stream) {
                throw 'The media stream is not initialized!';
            }
            let onCanPlay = (evt: Event) => {
                this.log.info(`The usermedia stream ${this.stream.id} is ready!`)
                this.video.removeEventListener('canplay', onCanPlay);
                this.streamReady = true;
                this.timeout = setTimeout(() => this.capture(), this.captureInterval + 10)
            }
            this.video.addEventListener('canplay', onCanPlay)
            this.video.srcObject = this.stream
            return this;
        } catch (error) {
            throw `Error starting capture ${error.message}`
        }
    }
    async stop(): Promise<ICameraDifferenceEngine> {
        try {
            this.log.info('Stopping UserMedia Capture to Stream...');
            this.video.src = '';
            this.captureContext = null
            this.stream = null
            this.streamReady = false;
            this.readyToDifference = false;
            //kill the timeout
            clearTimeout(this.timeout)
        } catch (error) {

        }
        finally {
            return this;
        }
    }
}

const CameraDifferenceEngine = (() => new CameraDifferenceEngineClass())()