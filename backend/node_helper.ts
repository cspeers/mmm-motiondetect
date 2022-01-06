import {
  create,
  IHelperConfig,
  NotificationType,
  ResultCallback
} from "node_helper";

import { exec, ExecException } from "child_process";
import * as os from "os";
import moment, { Moment } from "moment";

/** Module details */
let MotionModuleDetails = {
  name: "mmm-motiondetect",
  version: "1.0.0"
};

/** Log wrapper */
let MotionHelperLogger = {
  /** log info */
  info(message: string) {
    console.info(`[${MotionModuleDetails.name}]${message}`);
  },
  /** log warning */
  warn(message: string) {
    console.warn(`[${MotionModuleDetails.name}]${message}`);
  },
  /** log error */
  error(message: string) {
    console.error(`[${MotionModuleDetails.name}]${message}`);
  }
};

const operationHelper = {
  itTook(start: Date, end: Date): moment.Duration {
    let mStart = moment(start);
    let mEnd = moment(end);
    return moment.duration(mEnd.diff(mStart));
  },
  itTookInMs(start: Date, end: Date): number {
    return this.itTook(start, end).asMilliseconds();
  }
};

//#region Command Lines
const PI_SCREEN_TEST_CMD = "vcgencmd display_power";
const PI_SCREEN_ON_CMD = "vcgencmd display_power 1";
const PI_SCREEN_OFF_CMD = "vcgencmd display_power 0";

const DPMS_SCREEN_TEST_CMD =
  "export DISPLAY=$(w -oush | grep -Eo ' :[0-9]+' | uniq | cut -d \\  -f 2) && xset q|sed -ne 's/^[ ]*Monitor is //p'";
const DPMS_SCREEN_OFF_CMD =
  "export DISPLAY=$(w -oush | grep -Eo ' :[0-9]+' | uniq | cut -d \\  -f 2) && xset dpms force off";
const DPMS_SCREEN_STANDBY_CMD =
  "export DISPLAY=$(w -oush | grep -Eo ' :[0-9]+' | uniq | cut -d \\  -f 2) && xset dpms force standby";
const DPMS_SCREEN_ON_CMD =
  "export DISPLAY=$(w -oush | grep -Eo ' :[0-9]+' | uniq | cut -d \\  -f 2) && xset dpms force on";
//#endregion

//#region Declarations

/** expected socket notification message types */
type SocketNotification =
  | NotificationType
  | "DEACTIVATE_MONITOR"
  | "ACTIVATE_MONITOR"
  | "MONITOR_ON"
  | "MONITOR_OFF"
  | "MOTION_DETECTED"
  | "MOTION_TIMEOUT";

/** simple socket message to convey the monitor power operation */
interface IMonitorStateMessage {
  monitorState: "ON" | "OFF";
  duration: number;
}

/** stub for module node-helper configuration */
interface IModuleConfiguration {
  /** whether to check the current power state */
  checkState: boolean;
}

interface IAsyncOperation<T> {
  /** whether the operation was a success */
  success: boolean;
  /** the time the operation began */
  currentOperationStart: Date;
  /** the time the operation completed */
  currentOperationEnd?: Date;
  /** the actual result */
  result?: T;
}

type BooleanAsyncResult = IAsyncOperation<boolean>;
type BooleanAsyncOperation = ResultCallback<BooleanAsyncResult>;

/** module node helper configuration */
interface ModuleHelperConfig extends IHelperConfig {
  /** whether to use DPMS rather than rPI convention */
  useDPMS: boolean;
  /** the relevant module configuration */
  config?: IModuleConfiguration;
  /** whether the monitor is currently on */
  monitorOn: boolean;
  /** whether a power operation is in progress */
  operationRunning: boolean;
  /** checks whether the monitor is already on */
  isMonitorOn(result: BooleanAsyncOperation): void;
  /** turns the monitor on */
  activateMonitor(result: BooleanAsyncOperation): void;
  /** turns the monitor off */
  deActivateMonitor(result: BooleanAsyncOperation): void;
}

//#endregion

const helperConfig: ModuleHelperConfig = {
  monitorOn: false,
  config: undefined,
  operationRunning: false,
  useDPMS: false,

  isMonitorOn(resultCallback: BooleanAsyncOperation): void {
    let cmdLine = this.useDPMS ? DPMS_SCREEN_TEST_CMD : PI_SCREEN_TEST_CMD;
    let resultCheck = this.useDPMS
      ? (s: string): boolean => {
          return s.trim() === "On";
        }
      : (s: string): boolean => {
          return s.includes("=1");
        };
    MotionHelperLogger.info(`Querying Monitor Status..`);
    let aResult: IAsyncOperation<boolean> = {
      currentOperationStart: moment().toDate(),
      currentOperationEnd: undefined,
      success: true,
      result: undefined
    };
    exec(
      cmdLine,
      (err: ExecException | null, stdout: string, stderr: string) => {
        aResult.currentOperationEnd = moment().toDate();
        if (err) {
          aResult.success = false;
          MotionHelperLogger.error(`Error calling monitor status: ${stderr}`);
        }
        MotionHelperLogger.info(`Monitor is currently:${stdout}`);
        aResult.result = resultCheck(stdout);
        resultCallback(aResult);
      }
    );
  },
  activateMonitor(resultCallback: BooleanAsyncOperation): void {
    let cmdLine = this.useDPMS ? DPMS_SCREEN_ON_CMD : PI_SCREEN_ON_CMD;
    let aResult: IAsyncOperation<boolean> = {
      currentOperationStart: moment().toDate(),
      currentOperationEnd: undefined,
      success: true,
      result: undefined
    };
    let turnOnMonitor = () => {
      exec(cmdLine, (err: ExecException | null, out: string, code: string) => {
        aResult.currentOperationEnd = moment().toDate();
        if (err) {
          aResult.success = false;
          aResult.result = false;
          MotionHelperLogger.error(`Error activating monitor: ${code}`);
        } else {
          aResult.result = true;
          MotionHelperLogger.info(`Monitor has been activated`);
          this.monitorOn = true;
        }
        resultCallback(aResult);
      });
    };
    if (this.config?.checkState) {
      this.isMonitorOn((r: IAsyncOperation<boolean>) => {
        MotionHelperLogger.info(
          `Monitor power check took ${operationHelper.itTookInMs(
            r.currentOperationStart,
            r.currentOperationEnd ?? new Date()
          )} ms.`
        );
        if (r.result) {
          aResult.currentOperationEnd = moment().toDate();
          aResult.result = true;
          MotionHelperLogger.info("The monitor is already on.");
          resultCallback(aResult);
        } else {
          turnOnMonitor();
        }
      });
    } else {
      MotionHelperLogger.info("Not checking monitor state");
      turnOnMonitor();
    }
  },
  deActivateMonitor(resultCallback: BooleanAsyncOperation) {
    let cmdLine = this.useDPMS ? DPMS_SCREEN_OFF_CMD : PI_SCREEN_OFF_CMD;
    //let cmdLine = this.useDPMS ? DPMS_SCREEN_STANDBY_CMD : PI_SCREEN_OFF_CMD;
    let aResult: IAsyncOperation<boolean> = {
      currentOperationStart: moment().toDate(),
      currentOperationEnd: undefined,
      success: true,
      result: undefined
    };
    let turnOffMonitor = () => {
      exec(cmdLine, (err: ExecException | null, out: string, code: string) => {
        aResult.currentOperationEnd = moment().toDate();
        if (err) {
          aResult.success = false;
          aResult.result = true;
          MotionHelperLogger.error(`Error deactivating monitor: ${code}`);
        } else {
          aResult.result = false;
          this.monitorOn = false;
          MotionHelperLogger.info(`Monitor has been deactivated`);
        }
        resultCallback(aResult);
      });
    };
    if (this.config?.checkState) {
      this.isMonitorOn((r: IAsyncOperation<boolean>) => {
        MotionHelperLogger.info(
          `Monitor power check took ${operationHelper.itTookInMs(
            r.currentOperationStart,
            r.currentOperationEnd ?? new Date()
          )} ms.`
        );
        if (r.result) {
          turnOffMonitor();
        } else {
          aResult.currentOperationEnd = moment().toDate();
          aResult.result = true;
          MotionHelperLogger.info("The monitor is already off.");
          resultCallback(aResult);
        }
      });
    } else {
      MotionHelperLogger.info("Not checking monitor state");
      turnOffMonitor();
    }
  },

  socketNotificationReceived(
    notification: SocketNotification,
    payload: IModuleConfiguration
  ) {
    MotionHelperLogger.info(`Received Notification ${notification}`);
    if (payload) {
      this.config = payload;
    }
    switch (notification) {
      case "ACTIVATE_MONITOR":
        if (!this.operationRunning) {
          MotionHelperLogger.info(
            `Activating Monitor - Use DPMS:${this.useDPMS} Check State:${payload.checkState}`
          );
          this.operationRunning = true;
          this.activateMonitor((r: BooleanAsyncResult) => {
            if (r.success) {
              let mess: IMonitorStateMessage = {
                monitorState: "ON",
                duration: operationHelper.itTookInMs(
                  r.currentOperationStart,
                  r.currentOperationEnd ?? new Date()
                )
              };
              if (this.sendSocketNotification) {
                this.sendSocketNotification("MONITOR_ON", mess);
                MotionHelperLogger.info(
                  `${notification} transition to Monitor State:${mess.monitorState} took ${mess.duration} ms.`
                );
              }
            } else {
              MotionHelperLogger.error("Turning on the monitor failed");
            }
            this.operationRunning = false;
          });
        } else {
          MotionHelperLogger.warn("An operation is already in progress");
        }
        break;
      case "DEACTIVATE_MONITOR":
        if (!this.operationRunning) {
          MotionHelperLogger.info(
            `Deactivating Monitor - Use DPMS:${this.useDPMS} Check State:${payload.checkState}`
          );
          this.operationRunning = true;
          this.deActivateMonitor((r: BooleanAsyncResult) => {
            if (r.success) {
              let mess: IMonitorStateMessage = {
                monitorState: "OFF",
                duration: operationHelper.itTookInMs(
                  r.currentOperationStart,
                  r.currentOperationEnd ?? new Date()
                )
              };
              if (this.sendSocketNotification) {
                this.sendSocketNotification("MONITOR_OFF", mess);
                MotionHelperLogger.info(
                  `${notification} transition to Monitor State:${mess.monitorState} took ${mess.duration} ms.`
                );
              }
            } else {
              MotionHelperLogger.error("Turning off the monitor failed");
            }
            this.operationRunning = false;
          });
        } else {
          MotionHelperLogger.warn("An operation is already in progress");
        }
        break;
      case "MOTION_DETECTED":
      case "MOTION_TIMEOUT":
      default:
        //Do Something
        break;
    }
  },
  start() {
    MotionHelperLogger.info(
      `Starting Module Helper version : ${
        MotionModuleDetails.version
      } - ${os.platform()}:${os.arch()}`
    );
    //we'll force a 'safe config until we get on via socket
    this.useDPMS = !(os.arch() === "arm");
    this.config = { checkState: true };
    MotionHelperLogger.info("Module Started!");
  },
  stop() {
    MotionHelperLogger.info(`Stopping Module Helper...`);
    //we'll try and turn the monitor on the way out.
    this.activateMonitor((r: IAsyncOperation<boolean>) => {
      if (!r.success || !r.result) {
        MotionHelperLogger.error(`Error re-activating monitor`);
      }
      MotionHelperLogger.info(
        `Power Check took .${operationHelper.itTookInMs(
          r.currentOperationStart,
          r.currentOperationEnd ?? new Date()
        )} ms..`
      );
    });
  }
};

module.exports = create(helperConfig);
