"use strict";

import * as NodeHelper from "node_helper";

import { exec, ExecException } from 'child_process'
import * as os from "os";
import moment, { Moment } from 'moment'

/** Module details */
const ModuleDetails = {
    name: "mmm-motiondetect",
    version: '1.0.0',
};

/** Log wrapper */
const Logger = {
    /** log info */
    info(message: string) {console.info(`[${ModuleDetails.name}]${message}`)},
    /** log warning */
    warn(message: string) {console.warn(`[${ModuleDetails.name}]${message}`)},
    /** log error */
    error(message: string) {console.error(`[${ModuleDetails.name}]${message}`)}
};

const operationHelper = {
    itTook(start:Date,end:Date):moment.Duration{
        let mStart=moment(start)
        let mEnd=moment(end)
        return moment.duration(mEnd.diff(mStart))
    },
    itTookInMs(start:Date,end:Date):number{
        return this.itTook(start,end).asMilliseconds()
    }
}

//#region Command Lines
const PI_SCREEN_TEST_CMD = 'vcgencmd display_power';
const PI_SCREEN_ON_CMD = 'vcgencmd display_power 1';
const PI_SCREEN_OFF_CMD = 'vcgencmd display_power 0';

const DPMS_SCREEN_TEST_CMD = "export DISPLAY=:0;xset q|sed -ne 's/^[ ]*Monitor is //p'"
const DPMS_SCREEN_OFF_CMD = 'export DISPLAY=:0 && xset dpms force off';
const DPMS_SCREEN_ON_CMD = 'export DISPLAY=:0 && xset dpms force on';
//#endregion

//#region Declarations

/** expected socket notification message types */
type SocketNotification = NodeHelper.NotificationType|
    'DEACTIVATE_MONITOR'|'ACTIVATE_MONITOR'|'MONITOR_ON'|'MONITOR_OFF';

interface IMonitorStateMessage {
    monitorState:'ON'|'OFF',
    duration:number
}

/** stub for module node-helper configuration */
interface IModuleConfiguration {
    /** whether to check the current power state */
    checkState:boolean
}

interface IAsyncOperation<T> {
    /** whether the operation was a success */
    success:boolean
    /** the time the operation began */
    currentOperationStart:Date
    /** the time the operation completed */
    currentOperationEnd:Date
    /** the actual result */
    result:T
}

type BooleanAsyncResult=IAsyncOperation<boolean>
type BooleanAsyncOperation=NodeHelper.ResultCallback<BooleanAsyncResult>

/** module node helper configuration */
interface IHelperConfig extends NodeHelper.IHelperConfig {
    /** whether to use DPMS rather than rPI convention */
    useDPMS:boolean
    /** the relevant module configuration */
    config:IModuleConfiguration
    /** whether the monitor is currently on */
    monitorOn:boolean
    /** whether a power operation is in progress */
    operationRunning:boolean
    /** checks whether the monitor is already on */
    isMonitorOn(result:BooleanAsyncOperation):void
    /** turns the monitor on */
    activateMonitor(result:BooleanAsyncOperation):void
    /** turns the monitor off */
    deActivateMonitor(result:BooleanAsyncOperation):void
}

//#endregion

let helperConfig:IHelperConfig={
    monitorOn:false,
    config:undefined,
    operationRunning:false,
    useDPMS:false,
    
    isMonitorOn(resultCallback: BooleanAsyncOperation): void {
        let cmdLine = this.useDPMS ? DPMS_SCREEN_TEST_CMD : PI_SCREEN_TEST_CMD;
        let resultCheck = this.useDPMS ?
            (s: string): boolean => { return s.trim() === 'On' } :
            (s: string): boolean => { return s.includes('=1') };
        Logger.info(`Querying Monitor Status..`);
        let aResult:IAsyncOperation<boolean> = {
            currentOperationStart: moment().toDate(),
            currentOperationEnd: undefined,
            success:true,
            result:undefined
        }
        exec(cmdLine, (err: ExecException, stdout: string, stderr: string) => {
            aResult.currentOperationEnd=moment().toDate()
            if (err) {
                aResult.success=false
                Logger.error(`Error calling monitor status: ${stderr}`);
            }
            Logger.info(`Monitor is currently:${stdout}`);
            aResult.result=resultCheck(stdout)
            resultCallback(aResult);
        });
    },
    activateMonitor(resultCallback:BooleanAsyncOperation):void {
        let cmdLine = this.useDPMS ? DPMS_SCREEN_ON_CMD : PI_SCREEN_ON_CMD;
        let aResult:IAsyncOperation<boolean> = {
            currentOperationStart: moment().toDate(),
            currentOperationEnd: undefined,
            success:true,
            result:undefined
        }
        let turnOnMonitor = () => {
            exec(cmdLine, (err: ExecException, out: string, code: string) => {
                aResult.currentOperationEnd=moment().toDate()
                if (err) {
                    aResult.success=false;
                    aResult.result=false;
                    Logger.error(`Error activating monitor: ${code}`);
                } else {
                    aResult.result=true;
                    Logger.info(`Monitor has been activated`);
                    this.monitorOn=true
                }
                resultCallback(aResult)
            });
        };
        if (this.config.checkState) {
            this.isMonitorOn((r:IAsyncOperation<boolean>)=>{
                if (r.result) {
                    aResult.currentOperationEnd=moment().toDate()
                    aResult.result=true;
                    Logger.info('The monitor is already on.');
                    resultCallback(aResult);
                }
                else{
                    turnOnMonitor();
                }
            });
        }
        else {
            Logger.info("Not checking monitor state")
            turnOnMonitor();
        }
    },
    deActivateMonitor(resultCallback:BooleanAsyncOperation) {
        let cmdLine = this.useDPMS ? DPMS_SCREEN_OFF_CMD : PI_SCREEN_OFF_CMD;
        let aResult:IAsyncOperation<boolean> = {
            currentOperationStart: moment().toDate(),
            currentOperationEnd: undefined,
            success:true,
            result:undefined
        }
        let turnOffMonitor = () => {
            exec(cmdLine, (err: ExecException, out: string, code: string) => {
                aResult.currentOperationEnd=moment().toDate()
                if (err) {
                    aResult.success=false;
                    aResult.result=true;
                    Logger.error(`Error deactivating monitor: ${code}`);
                } else {
                    aResult.result=false;
                    this.monitorOn=false;
                    Logger.info(`Monitor has been deactivated`);
                }
                resultCallback(aResult)
            });
        };
        if (this.config.checkState) {
            this.isMonitorOn((r:IAsyncOperation<boolean>)=>{
                if (r.result) {
                    turnOffMonitor();
                }
                else{
                    aResult.currentOperationEnd=moment().toDate()
                    aResult.result=true;
                    Logger.info('The monitor is already off.');
                    resultCallback(aResult);
                }
            });
        }
        else {
            Logger.info("Not checking monitor state")
            turnOffMonitor();
        }
    },

    socketNotificationReceived(notification: SocketNotification, payload: IModuleConfiguration) {
        Logger.info(`Received Notification ${notification}`);
        if (payload) {
            this.config=payload
        }
        if(!this.operationRunning) {
            switch (notification) {
                case 'ACTIVATE_MONITOR':
                    Logger.info(`Activating Monitor - Use DPMS:${this.useDPMS} Check State:${payload.checkState}`)
                    this.operationRunning=true
                    this.activateMonitor((r:BooleanAsyncResult) => {
                        if(r.success){
                            let mess:IMonitorStateMessage={
                                monitorState:'ON',
                                duration:operationHelper.itTookInMs(r.currentOperationStart,r.currentOperationEnd)
                            };
                            this.sendSocketNotification('MONITOR_ON',mess)
                            Logger.info(`${notification} transition to Monitor State:${mess.monitorState} took ${mess.duration} ms.`)
                        }
                        else {
                            Logger.error('Turning on the monitor failed')
                        }
                        this.operationRunning=false
                    })
                    break;
                case 'DEACTIVATE_MONITOR':
                    Logger.info(`Deactivating Monitor - Use DPMS:${this.useDPMS} Check State:${payload.checkState}`)
                    this.operationRunning=true
                    this.deActivateMonitor((r:BooleanAsyncResult) => {
                        if(r.success){
                            let mess:IMonitorStateMessage={
                                monitorState:'OFF',
                                duration:operationHelper.itTookInMs(r.currentOperationStart,r.currentOperationEnd)
                            };
                            this.sendSocketNotification('MONITOR_OFF',mess)
                            Logger.info(`${notification} transition to Monitor State:${mess.monitorState} took ${mess.duration} ms.`)
                        }
                        else {
                            Logger.error('Turning off the monitor failed')
                        }
                        this.operationRunning=false
                    })
                    break;
                default:
                    break;
            }                    
        }
        else {
            Logger.warn('An operation is already in progress')
        }
    },
    start(){
        Logger.info(`Starting Module Helper version : ${ModuleDetails.version} - ${os.platform()}:${os.arch()}`);
        //we'll force a 'safe config until we get on via socket
        this.useDPMS=!(os.arch()==='arm')
        this.config={ checkState:true}
        Logger.info("Module Started!");
    },
    stop(){
        Logger.info(`Stopping Module Helper...`);
        //we'll try and turn the monitor on the way out.
        this.activateMonitor((r:IAsyncOperation<boolean>)=>{
            if(!r.success || !r.result){
                Logger.error(`Error re-activating monitor`)
            }
            Logger.info(`Power Check took .${operationHelper.itTookInMs(r.currentOperationStart,r.currentOperationEnd)} ms..`)
        });
    }
};

module.exports = NodeHelper.create(helperConfig);