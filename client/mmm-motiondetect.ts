'use strict'
import * as MagicMirror from "magicmirror"

declare const Log: MagicMirror.IMagicMirrorLog;
declare const Module: MagicMirror.IMagicMirrorModule;
declare const MM:MagicMirror.IMagicMirrorStatic;

/** Module constants */
const ModuleDetails = {
    name: "mmm-motiondetect",
    version: '1.0.0',
    scripts: ["diff-cam-engine.js"],
    styles: ["magicmirror-motiondetect.css"]
};

/** wrapper for the Magic Mirror logger */
const Logger={
    info:(m:string):void => Log.info(`[${ModuleDetails.name}] ${m}`),
    warn:(m:string):void => Log.warn(`[${ModuleDetails.name}] ${m}`),
    error:(m:string):void => Log.error(`[${ModuleDetails.name}] ${m}`)
};

//#region Declarations

/** the expected socket notifications */
type SocketMessage = MagicMirror.NotificationType|'ACTIVATE_MONITOR'|'DEACTIVATE_MONITOR'|'MONITOR_ON'|'MONITOR_OFF'
type ModuleMessage = MagicMirror.ModuleNotificationType|'MOTION_DETECTED'|'MOTION_TIMEOUT'

type MonitorState = 'ON'|'OFF'

interface IMonitorStateMessage {
    monitorState:MonitorState,
    duration:number
}

/** configuration for the module */
interface IModuleConfiguration extends MagicMirror.ModuleConfiguration {
    /** the interval for the video capture loop */
    captureIntervalTime: number
    /** the motion detection score */
    scoreThreshold: number    
    /** full captured image width */
    captureWidth: number
    /** full captured image height */
    captureHeight: number,
    /** the height of the differencing image */
    differenceHeight:number
    /** the width of the differencing image */
    differenceWidth:number
    /** the time after which the display will power off in seconds */
    displayTimeout:number
    /** whether to check the monitor state before changing */
    checkState:boolean
    /** whether to show the captured video */
    displayPreview:boolean
}

interface IModuleProperties extends MagicMirror.IModuleProperties {
    /** the module version */
    version:string
    /** the module configuration defaults */
    defaults:IModuleConfiguration
    /** video element for media capture */
    video:HTMLVideoElement
    /** canvas element for capturing frames */
    canvas:HTMLCanvasElement
    /** whether the monitor is currently off */
    monitorOff:boolean
    /** the last time motion was detected */
    lastMotionDetected:Date
    /** whether a power operation is in progress */
    operationPending:boolean
    /** subclass of the notification received event */
    notificationReceived:MagicMirror.ModuleNotificationEvent
    /** subclass of the socket notification received event */
    socketNotificationReceived:MagicMirror.ISocketNotificationEvent<SocketMessage,IMonitorStateMessage>    
}

//#endregion

const moduleProperties:IModuleProperties = {
    name:ModuleDetails.name,
    version:ModuleDetails.version,
    identifier:undefined,
    data:undefined,
    config:undefined,
    hidden:false,
    video:undefined,
    canvas:undefined,
    monitorOff:false,
    operationPending:false,
    lastMotionDetected:undefined,
    defaults:{
        captureIntervalTime: 100,
        scoreThreshold:16,
        captureHeight: 480,
        captureWidth: 640,
        differenceHeight: 48,
        differenceWidth:64,
        displayTimeout:120,
        checkState:true,
        displayPreview:false
    },
    
    onImageCaptureCallback(helper:ICameraDifferenceEngine){

    },
    onStreamReadyCallback(helper:ICameraDifferenceEngine){
        Logger.info(`Stream ${helper.stream.id} is ready`)
    },
    onStreamStopCallback(helper:ICameraDifferenceEngine){
        Logger.info('Stream is stopped!');
    },
    onImageScored(result:IDifferenceResult) {
        let now=new Date();
        let score = document.getElementById('score');
        score.innerText=`${result.score}`
        if(this.operationPending) {
            Logger.warn(`A previous power operation is in progress...`);
        }
        else {
            if ((this.monitorOff)) {
                //should we turn off the monitor
                if(result.score > this.config.scoreThreshold){
                    this.operationPending=true
                    this.lastMotionDetected=now
                    this.sendNotification('MOTION_DETECTED',result.score)
                    this.sendSocketNotification('ACTIVATE_MONITOR',this.config)
                }
            }
            else {
                //should we turn off the monitor?
                let elapsed= now.getTime() - this.lastMotionDetected
                if(elapsed > (this.config.displayTimeout * 1000)) {
                    this.operationPending=true
                    Logger.info(`Timeout of ${this.config.displayTimeout} seconds elapsed.`)
                    this.sendNotification('MOTION_TIMEOUT',result.score)
                    this.sendSocketNotification('DEACTIVATE_MONITOR',this.config)
                }
            }            
        }
    },    
    startImageCapture(){
        let captureOptions: ICameraDifferenceOptions = {
            captureInterval: this.captureIntervalTime,
            constraints: {
                audio: false,
                video: {
                    width: this.config.captureWidth,
                    height: this.config.captureHeight
                }
            },
            log:Logger,
            video:this.video,
            motionCanvas:this.canvas,
            scoreThreshold:this.config.scoreThreshold,
            includeMotionBox:true,
            includeMotionPixels:true,
            differenceSize:{height:48,width:64},          
            onImageCaptureCallback: (e) => this.onImageCaptureCallback(e),
            onStreamReadyCallback: (e) => this.onStreamReadyCallback(e),
            onStreamStopCallback: (e) => this.onStreamStopCallback(e),
            onDifferenceCallback: (e) => this.onImageScored(e)
        };
        CameraDifferenceEngine.initialize(captureOptions)
            .then(async (a)=>a.start())
    },
    getScripts:() => ModuleDetails.scripts,
    getStyles: () => ModuleDetails.styles,
    start() {
        Log.info(`[${this.name}] Starting up...`);
        this.lastMotionDetected = new Date()
        /** make sure that the monitor is on when starting */
        this.sendSocketNotification('ACTIVATE_MONITOR', {checkState:true,useDPMS:this.config.useDPMS});
    },
    stop() {
        CameraDifferenceEngine.stop()
            .then(a=>{Log.error(`[${this.name}] Usermedia capture stopped.`)})
            .catch(e=>{Log.error(`[${this.name}] Error stopping Usermedia capture. ${e}`)})
        Log.info(`[${this.name}] Module Stopped!`);
    },    
    getDom() {
        Logger.info(`Updating DOM...`);
        
        let wrapper = document.createElement("div");
        let mainContainer = document.createElement("div");
        mainContainer.setAttribute('id',`${ModuleDetails.name}-container`)
        
        let videoFigure=document.createElement('figure')
        videoFigure.setAttribute('id',`${ModuleDetails.name}-videofigure`)
        videoFigure.classList.add('hidden');

        let video=document.createElement('video')
        video.setAttribute('id',`${ModuleDetails.name}-videocapture`)
        videoFigure.append(video)
        this.video=video;
        mainContainer.appendChild(videoFigure)

        let canvasFigure=document.createElement('figure')
        canvasFigure.setAttribute('id',`${ModuleDetails.name}-motionfigure`)
        canvasFigure.classList.add('hidden');

        let canvas=document.createElement('canvas');
        canvas.width=this.config.differenceWidth
        canvas.height=this.config.differenceHeight
        canvas.setAttribute('id',`${ModuleDetails.name}-motioncapture`)
        canvas.classList.add('motion-canvas')
        canvasFigure.append(canvas)
        this.canvas=canvas;

        let caption=document.createElement('figcaption')
        caption.innerHTML=`Score: <span id="score">?</span>`
        canvasFigure.appendChild(caption)
        mainContainer.appendChild(canvasFigure)

        if(this.config.displayPreview){
            canvasFigure.classList.remove('hidden')
            videoFigure.classList.remove('hidden')
        }

        wrapper.appendChild(mainContainer);
        return wrapper;
    },
    notificationReceived(notification:ModuleMessage, payload:any, sender:MagicMirror.IModuleInstance) {
        switch (notification) {
            case 'MODULE_DOM_CREATED':
                Logger.info(`DOM Created!`);
                this.startImageCapture();
                break;
            default:
                //Logger.info(`Received notification ${notification} from ${sender?sender.name : 'system'}`)
                break;
        }
    },    
    socketNotificationReceived(message:SocketMessage,payload:IMonitorStateMessage) {
        Logger.info(`received socket notification ${message}`);
        switch (message) {
            case 'MONITOR_ON':
                Logger.info(`${message} - MonitorState:${payload.monitorState} took ${payload.duration} ms.`)
                this.monitorOff=false
                this.operationPending=false
                break;
            case 'MONITOR_OFF':
                Logger.info(`${message} - MonitorState:${payload.monitorState} took ${payload.duration} ms.`)
                this.monitorOff=true
                this.operationPending=false
                break;
            default:
                break;
        }
    }
}

Module.register(ModuleDetails.name,moduleProperties)