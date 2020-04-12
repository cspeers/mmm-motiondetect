'use strict'

/** Module constants */
let MotionModuleDetails = {
    name: "mmm-motiondetect",
    version: '1.0.0',
    scripts: ["diff-cam-engine.js"],
    styles: ["magicmirror-motiondetect.css"]
};

/** wrapper for the Magic Mirror logger */
let MotionDetectLogger={
    info:(m:string):void => Log.info(`[${MotionModuleDetails.name}] ${m}`),
    warn:(m:string):void => Log.warn(`[${MotionModuleDetails.name}] ${m}`),
    error:(m:string):void => Log.error(`[${MotionModuleDetails.name}] ${m}`)
};

//#region Declarations

/** the expected socket notifications */
type SocketMessage = 'ACTIVATE_MONITOR'|'DEACTIVATE_MONITOR'|'MONITOR_ON'|'MONITOR_OFF'|'MOTION_DETECTED'|'MOTION_TIMEOUT'|NotificationType
type ModuleMessage = 'MOTION_DETECTED'|'MOTION_TIMEOUT'|ModuleNotificationType

/** simple socket message to convey the monitor power operation */
interface IMonitorStateMessage {
    monitorState:'ON'|'OFF',
    duration:number
}

/** configuration for the module */
interface IModuleConfiguration extends ModuleConfiguration {
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
    /** whether to blank using power */
    usePower:boolean
    /** the time the module fade will be */
    fadeoutTime:number
}

/** module properties */
interface IMotionModuleProperties extends IModuleProperties {
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
    notificationReceived:ModuleNotificationEvent
    /** subclass of the socket notification received event */
    socketNotificationReceived:ISocketNotificationEvent<SocketMessage,IMonitorStateMessage>    
}

//#endregion

var motionModuleProperties:IMotionModuleProperties = {
    name:MotionModuleDetails.name,
    version:MotionModuleDetails.version,
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
        displayPreview:false,
        usePower:true,
        fadeoutTime:500
    },
    
    onImageCaptureCallback(helper:ICameraDifferenceEngine){

    },
    onStreamReadyCallback(helper:ICameraDifferenceEngine){
        MotionDetectLogger.info(`Stream ${helper.stream.id} is ready`)
    },
    onStreamStopCallback(helper:ICameraDifferenceEngine){
        MotionDetectLogger.info('Stream is stopped!');
    },
    onImageScored(result:IDifferenceResult) {
        let now=new Date();
        let score = document.getElementById('score');
        score.innerText=`${result.score}`
        let motionDetected=result.score > this.config.scoreThreshold
        if(motionDetected) this.lastMotionDetected=now
        if(this.operationPending) {
            MotionDetectLogger.warn(`A previous power operation is in progress...`);
        }
        else {
            if ((this.monitorOff)) {
                //should we turn off the monitor
                if(motionDetected){
                    this.operationPending=true
                    MotionDetectLogger.info(`Motion Detected with score ${result.score}`)
                    if(this.config.usePower) {
                        this.sendSocketNotification('ACTIVATE_MONITOR',this.config)
                    } 
                    else {
                        MM.getModules().enumerate((module)=>{
                            module.show(0)
                        })
                        this.monitorOff=false
                        this.operationPending=false
                        this.sendSocketNotification('MOTION_DETECTED')
                    }
                    this.sendNotification('MOTION_DETECTED',result)
                }
                else
                {
                    if (!this.config.usePower) {
                        MM.getModules().enumerate((module)=>{
                            if(!module.hidden) module.hide(0,{force:true})
                        })
                    }
                }
            }
            else {
                //should we turn off the monitor?
                let elapsed= now.getTime() - this.lastMotionDetected
                if(elapsed > (this.config.displayTimeout * 1000)) {
                    this.operationPending=true
                    MotionDetectLogger.info(`Timeout of ${this.config.displayTimeout} seconds elapsed.`)
                    this.operationPending=true
                    MotionDetectLogger.info(`Motion Detected with score ${result.score}`)
                    if(this.config.usePower) {
                        this.sendSocketNotification('DEACTIVATE_MONITOR',this.config)
                    }
                    else {
                        MM.getModules().enumerate((module)=>{
                            module.hide(this.config.fadeoutTime,{force:true})
                        })
                        this.monitorOff=true
                        this.operationPending=false
                        this.sendSocketNotification('MOTION_TIMEOUT')
                    }                    
                    this.sendNotification('MOTION_TIMEOUT',{})
                }
            }            
        }
    },   
    startImageCapture(){
        let captureOptions: ICameraDifferenceOptions = {
            captureInterval: this.config.captureIntervalTime,
            constraints: {
                audio: false,
                video: {
                    width: this.config.captureWidth,
                    height: this.config.captureHeight
                }
            },
            log:MotionDetectLogger,
            video:this.video,
            motionCanvas:this.canvas,
            scoreThreshold:this.config.scoreThreshold,
            includeMotionBox:this.config.displayPreview,
            includeMotionPixels:this.config.displayPreview,
            differenceSize:{height:this.config.captureHeight/10,width:this.config.captureWidth/10},          
            onImageCaptureCallback: (e) => this.onImageCaptureCallback(e),
            onStreamReadyCallback: (e) => this.onStreamReadyCallback(e),
            onStreamStopCallback: (e) => this.onStreamStopCallback(e),
            onDifferenceCallback: (e) => this.onImageScored(e)
        };
        CameraDifferenceEngine.initialize(captureOptions)
            .then(async (a)=>{
                a.start();
                MotionDetectLogger.info(`Started watching camera stream on ${this.config.captureIntervalTime}.ms interval.`)
            })
    },

    getScripts:() => MotionModuleDetails.scripts,
    getStyles: () => MotionModuleDetails.styles,
    getDom() {
        MotionDetectLogger.info(`Updating DOM...`);
        
        let wrapper = document.createElement("div");
        let mainContainer = document.createElement("div");
        mainContainer.setAttribute('id',`${MotionModuleDetails.name}-container`)
        
        let videoFigure=document.createElement('figure')
        videoFigure.setAttribute('id',`${MotionModuleDetails.name}-videofigure`)
        videoFigure.classList.add('hidden');

        let video=document.createElement('video')
        video.setAttribute('id',`${MotionModuleDetails.name}-videocapture`)
        videoFigure.append(video)
        this.video=video;
        mainContainer.appendChild(videoFigure)

        let canvasFigure=document.createElement('figure')
        canvasFigure.setAttribute('id',`${MotionModuleDetails.name}-motionfigure`)
        canvasFigure.classList.add('hidden');

        let canvas=document.createElement('canvas');
        canvas.width=this.config.differenceWidth
        canvas.height=this.config.differenceHeight
        canvas.setAttribute('id',`${MotionModuleDetails.name}-motioncapture`)
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

    start() {
        MotionDetectLogger.info(`Starting up...`);
        this.lastMotionDetected = new Date()
        if(this.config.usePower){
            /** make sure that the monitor is on when starting */
            this.sendSocketNotification('ACTIVATE_MONITOR', {checkState:true});
        }
    },
    stop() {
        CameraDifferenceEngine.stop()
            .then(a=>{MotionDetectLogger.error(`Usermedia capture stopped.`)})
            .catch(e=>{MotionDetectLogger.error(`Error stopping Usermedia capture. ${e}`)})
        Log.info(`[${this.name}] Module Stopped!`);
    },
    suspend(){
        MotionDetectLogger.info(`Module Suspended...`)
    },
    resume(){
        MotionDetectLogger.info(`Module Resumed...`)
    },

    notificationReceived(notification:ModuleMessage, payload:any, sender?:IModuleInstance) {
        switch (notification) {
            case 'MODULE_DOM_CREATED':
                MotionDetectLogger.info(`DOM Created!`);
                this.startImageCapture();
                break;
            default:
                // Logger.info(`Received notification ${notification} from ${sender?sender.name : 'system'}`)
                break;
        }
    },    
    socketNotificationReceived(message:SocketMessage,payload:IMonitorStateMessage) {
        MotionDetectLogger.info(`received socket notification ${message}`);
        switch (message) {
            case 'MONITOR_ON':
                MotionDetectLogger.info(`${message} - MonitorState:${payload.monitorState} took ${payload.duration} ms.`)
                this.monitorOff=false
                this.operationPending=false
                break;
            case 'MONITOR_OFF':
                MotionDetectLogger.info(`${message} - MonitorState:${payload.monitorState} took ${payload.duration} ms.`)
                this.monitorOff=true
                this.operationPending=false
                break;
            default:
                break;
        }
    }
}

Module.register(MotionModuleDetails.name,motionModuleProperties)