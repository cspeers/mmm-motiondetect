/** Module constants */
const moduleDetails = {
  name: "mmm-motiondetect",
  version: "1.0.0",
  scripts: ["diff-cam-engine.js"],
  styles: ["magicmirror-motiondetect.css"]
};

/** wrapper for the Magic Mirror logger */
const MotionDetectLogger = {
  info: (m: string): void => Log.info(`[${moduleDetails.name}] ${m}`),
  warn: (m: string): void => Log.warn(`[${moduleDetails.name}] ${m}`),
  error: (m: string): void => Log.error(`[${moduleDetails.name}] ${m}`)
};

//#region Declarations

/** the expected socket notifications */
type SocketMessage =
  | "ACTIVATE_MONITOR"
  | "DEACTIVATE_MONITOR"
  | "MONITOR_ON"
  | "MONITOR_OFF"
  | "MOTION_DETECTED"
  | "MOTION_TIMEOUT"
  | NotificationType;
type ModuleMessage =
  | "MOTION_DETECTED"
  | "MOTION_TIMEOUT"
  | ModuleNotificationType;

/** simple socket message to convey the monitor power operation */
interface IMonitorStateMessage {
  monitorState: "ON" | "OFF";
  duration: number;
}

/** configuration for the module */
interface IModuleConfiguration extends ModuleConfiguration {
  /** the interval for the video capture loop */
  captureIntervalTime: number;
  /** the motion detection score */
  scoreThreshold: number;
  /** full captured image width */
  captureWidth: number;
  /** full captured image height */
  captureHeight: number;
  /** the height of the differencing image */
  differenceHeight: number;
  /** the width of the differencing image */
  differenceWidth: number;
  /** the time after which the display will power off in seconds */
  displayTimeout: number;
  /** whether to check the monitor state before changing */
  checkState: boolean;
  /** whether to show the captured video */
  displayPreview: boolean;
  /** whether to blank using power */
  usePower: boolean;
  /** the time the module fade will be */
  fadeoutTime: number;
}

/** module properties */
interface IMotionModuleProperties extends IModuleProperties {
  /** the module version */
  version: string;
  /** the module configuration defaults */
  defaults: IModuleConfiguration;
  /** video element for media capture */
  video?: HTMLVideoElement;
  /** canvas element for capturing frames */
  canvas?: HTMLCanvasElement;
  /** whether the monitor is currently off */
  monitorOff: boolean;
  /** the last time motion was detected */
  lastMotionDetected?: Date;
  /** whether a power operation is in progress */
  operationPending: boolean;
  /** subclass of the notification received event */
  notificationReceived: ModuleNotificationEvent;
  /** subclass of the socket notification received event */
  socketNotificationReceived: ISocketNotificationEvent<
    SocketMessage,
    IMonitorStateMessage
  >;
}

//#endregion

function getModuleDom(me: IMotionModuleProperties) {
  MotionDetectLogger.info(`Updating DOM...`);

  const wrapper = document.createElement("div");
  const mainContainer = document.createElement("div");
  mainContainer.setAttribute("id", `${moduleDetails.name}-container`);

  const videoFigure = document.createElement("figure");
  videoFigure.setAttribute("id", `${moduleDetails.name}-videofigure`);
  videoFigure.classList.add("hidden");

  const video = document.createElement("video");
  video.setAttribute("id", `${moduleDetails.name}-videocapture`);
  videoFigure.append(video);
  me.video = video;
  mainContainer.appendChild(videoFigure);

  const canvasFigure = document.createElement("figure");
  canvasFigure.setAttribute("id", `${moduleDetails.name}-motionfigure`);
  canvasFigure.classList.add("hidden");

  const canvas = document.createElement("canvas");
  canvas.width = me.config.differenceWidth;
  canvas.height = me.config.differenceHeight;
  canvas.setAttribute("id", `${moduleDetails.name}-motioncapture`);
  canvas.classList.add("motion-canvas");
  canvasFigure.append(canvas);
  me.canvas = canvas;

  const caption = document.createElement("figcaption");
  caption.innerHTML = `Score: <span id="score">?</span>`;
  canvasFigure.appendChild(caption);
  mainContainer.appendChild(canvasFigure);

  if (me.config.displayPreview) {
    canvasFigure.classList.remove("hidden");
    videoFigure.classList.remove("hidden");
  }

  wrapper.appendChild(mainContainer);
  return wrapper;
}

function newModuleProperties(): IMotionModuleProperties {
  const { name, version } = moduleDetails;
  return {
    name,
    version,
    defaults: {
      captureIntervalTime: 100,
      scoreThreshold: 16,
      captureHeight: 480,
      captureWidth: 640,
      differenceHeight: 48,
      differenceWidth: 64,
      displayTimeout: 120,
      checkState: true,
      displayPreview: false,
      usePower: true,
      fadeoutTime: 500
    },
    hidden: false,
    monitorOff: false,
    operationPending: false,
    onImageCaptureCallback(helper: ICameraDifferenceEngine) {},
    onStreamReadyCallback(helper: ICameraDifferenceEngine) {
      MotionDetectLogger.info(`Stream ${helper.stream.id} is ready`);
    },
    onStreamStopCallback(helper: ICameraDifferenceEngine) {
      MotionDetectLogger.info("Stream is stopped!");
    },
    onImageScored(result: IDifferenceResult) {
      const now = new Date();
      const score = document.getElementById("score");
      score.innerText = `${result.score}`;
      const motionDetected = result.score > this.config.scoreThreshold;
      if (motionDetected) this.lastMotionDetected = now;
      if (this.operationPending) {
        MotionDetectLogger.warn(`A previous power operation is in progress...`);
      } else {
        if (this.monitorOff) {
          //should we turn off the monitor
          if (motionDetected) {
            this.operationPending = true;
            MotionDetectLogger.info(
              `Motion Detected with score ${result.score}`
            );
            if (this.config.usePower) {
              this.sendSocketNotification("ACTIVATE_MONITOR", this.config);
            } else {
              MM.getModules().enumerate((module) => {
                module.show(0);
              });
              this.monitorOff = false;
              this.operationPending = false;
              this.sendSocketNotification("MOTION_DETECTED");
            }
            this.sendNotification("MOTION_DETECTED", result);
          } else {
            if (!this.config.usePower) {
              MM.getModules().enumerate((module) => {
                if (!module.hidden) module.hide(0, { force: true });
              });
            }
          }
        } else {
          //should we turn off the monitor?
          const elapsed = now.getTime() - this.lastMotionDetected;
          if (elapsed > this.config.displayTimeout * 1000) {
            this.operationPending = true;
            MotionDetectLogger.info(
              `Timeout of ${this.config.displayTimeout} seconds elapsed.`
            );
            this.operationPending = true;
            MotionDetectLogger.info(
              `Motion Detected with score ${result.score}`
            );
            if (this.config.usePower) {
              this.sendSocketNotification("DEACTIVATE_MONITOR", this.config);
            } else {
              MM.getModules().enumerate((module) => {
                module.hide(this.config.fadeoutTime, { force: true });
              });
              this.monitorOff = true;
              this.operationPending = false;
              this.sendSocketNotification("MOTION_TIMEOUT");
            }
            this.sendNotification("MOTION_TIMEOUT", {});
          }
        }
      }
    },
    startImageCapture() {
      const captureOptions: ICameraDifferenceOptions = {
        captureInterval: this.config.captureIntervalTime,
        constraints: {
          audio: false,
          video: {
            width: this.config.captureWidth,
            height: this.config.captureHeight
          }
        },
        log: MotionDetectLogger,
        video: this.video,
        motionCanvas: this.canvas,
        scoreThreshold: this.config.scoreThreshold,
        includeMotionBox: this.config.displayPreview,
        includeMotionPixels: this.config.displayPreview,
        differenceSize: {
          height: this.config.captureHeight / 10,
          width: this.config.captureWidth / 10
        },
        onImageCaptureCallback: (e) => this.onImageCaptureCallback(e),
        onStreamReadyCallback: (e) => this.onStreamReadyCallback(e),
        onStreamStopCallback: (e) => this.onStreamStopCallback(e),
        onDifferenceCallback: (e) => this.onImageScored(e)
      };
      CameraDifferenceEngine.initialize(captureOptions).then(async (a) => {
        a.start();
        MotionDetectLogger.info(
          `Started watching camera stream on ${this.config.captureIntervalTime}.ms interval.`
        );
      });
    },

    getScripts: () => moduleDetails.scripts,
    getStyles: () => moduleDetails.styles,
    getDom() {
      return getModuleDom(this);
    },
    start() {
      MotionDetectLogger.info(`Starting up...`);
      this.lastMotionDetected = new Date();
      if (this.config.usePower) {
        /** make sure that the monitor is on when starting */
        this.sendSocketNotification("ACTIVATE_MONITOR", { checkState: true });
      }
    },
    stop() {
      CameraDifferenceEngine.stop()
        .then((a) => {
          MotionDetectLogger.error(`Usermedia capture stopped.`);
        })
        .catch((e) => {
          MotionDetectLogger.error(`Error stopping Usermedia capture. ${e}`);
        });
      Log.info(`[${this.name}] Module Stopped!`);
    },
    suspend() {
      MotionDetectLogger.info(`Module Suspended...`);
    },
    resume() {
      MotionDetectLogger.info(`Module Resumed...`);
    },

    notificationReceived(
      notification: ModuleMessage,
      payload: any,
      sender?: IModuleInstance
    ) {
      switch (notification) {
        case "MODULE_DOM_CREATED":
          MotionDetectLogger.info(`DOM Created!`);
          this.startImageCapture();
          break;
        default:
          // Logger.info(`Received notification ${notification} from ${sender?sender.name : 'system'}`)
          break;
      }
    },
    socketNotificationReceived(
      message: SocketMessage,
      payload: IMonitorStateMessage
    ) {
      MotionDetectLogger.info(`received socket notification ${message}`);
      switch (message) {
        case "MONITOR_ON":
          MotionDetectLogger.info(
            `${message} - MonitorState:${payload.monitorState} took ${payload.duration} ms.`
          );
          this.monitorOff = false;
          this.operationPending = false;
          break;
        case "MONITOR_OFF":
          MotionDetectLogger.info(
            `${message} - MonitorState:${payload.monitorState} took ${payload.duration} ms.`
          );
          this.monitorOff = true;
          this.operationPending = false;
          break;
        default:
          break;
      }
    }
  };
}

const moduleProperties = newModuleProperties();
Module.register(moduleDetails.name, moduleProperties);
