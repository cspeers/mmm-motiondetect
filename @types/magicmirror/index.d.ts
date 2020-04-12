//Declarations for the MagicMirror client side objects

declare type NotificationType=string;
declare type ModuleNotificationType=string|'ALL_MODULES_STARTED'|'DOM_OBJECTS_CREATED'|'MODULE_DOM_CREATED';
declare type NotificationPayload=object;
declare type NotifcationSender=object;
declare type ModuleConfiguration=object;


/** Module socket notification event method*/
declare interface ISocketNotificationEvent<N,P> {
    (message: N, moduleProperties: P): void
}

/** Module socker notification event method*/
declare type SocketNotifcationEvent=ISocketNotificationEvent<NotificationType,NotificationPayload>

/** module notification event */
declare interface IModuleNotificationEvent<N,P,S> {
    /**
     * @param notification The notfication type
     * @param payload The notification 
     * @param sender The module sending the notification
     */
    (notification: N, payload: P,sender?:S): void
}

/** Module notification event method*/
declare type ModuleNotificationEvent = IModuleNotificationEvent<NotificationType,NotificationPayload,NotifcationSender>;

/** Options for hiding and showing module content */
declare interface IViewableOptions {
    lockString?:string;
    force?:boolean;
}

/** module metadata */
declare interface IModulePropertyData {
    /** classes which are added to the module dom wrapper */
    classes:Array<string>
    /** filename of the core module file */
    file:string
    /** path of the module folder */
    path:string
    /** header added to the module */
    header:any
    /** position in which the instance will be shown */
    position:string
}

/** Interface representing module initialization properties */
declare interface IModuleProperties {
    /** the module name */
    name:string
    /** module unique indentifier */
    identifier?:string
    /** whether the module is currently hidden */
    hidden?:boolean
    /** Set the minimum MagicMirror module version for this module. */ 
    requiresVersion?: string
    /** Timer reference used for showHide animation callbacks. */
    showHideTimer?: any
    /** Array to store lockStrings. These strings are used to lock visibility */
    lockStrings?: Array<string>
    /** Module Setting Defaults */
    defaults?: ModuleConfiguration
    /** Module instance configuration*/
    config?:ModuleConfiguration
    /** Module instance metadata */
    data?:IModulePropertyData
    /** Run prior to module start */
    init?():void
    /** Run on module start */
    start?(): void
    /** Retrieves the module header */
    getHeader?(): string
    /** Retrieves the module template */
    getTemplate?(): string
    /** Retrieves the module template data */
    getTemplateData?(): object
    /** Retreives the dictionary of localization files */
    getTranslations?(): Map<string,string>
    /** Event fired on receipt of a module notification
     * @param {string} notification - The notification to be sent
     * @param {object} payload  - The notification payload
     * @param {object} sender   - The message sender
     */
    notificationReceived?:ModuleNotificationEvent
    /** Event fired on receipt of a socket notification
     * @param {string} notification - The notification to be sent
     * @param {object} payload  - The notification payload
     */
    socketNotificationReceived?:SocketNotifcationEvent
    /** Sends a module notification
     * @param {string} notification - The notification to be sent
     * @param {object} payload  - The notification payload
     */
    sendNotification?:SocketNotifcationEvent
    /** Hides the module
     * @param {number} speed The speed of the animation
     * @param {Function} callback The callback on completion
     * @param {IViewableOptions} options The locking options
     */
    hide?(speed?:number,options?:IViewableOptions):void
    hide?(speed?:number, callback?:Function, options?:IViewableOptions):void
    hide?(speed:number, callback:Function, options?:IViewableOptions):void
    /** Run on module hidden */
    suspend?(): void
    /** Shows the module
     * @param {number} speed The speed of the animation
     * @param {Function} callback The callback on completion
     * @param {IViewableOptions} options The locking options
     */    
    show?(speed?:number,options?:IViewableOptions):void
    show?(speed?:number, callback?:Function, options?:IViewableOptions):void
    show?(speed:number, callback:Function, options?:IViewableOptions):void 
    /** executed when a SIGINT is received */
    stop?():void
    /** Run on module resumption */
    resume?(): void
    /** The DOM object for the module view */
    getDom?(): HTMLElement
    /** Retrieves the bundled scripts */
    getScripts?():Array<String>
    /** Retrieves the bundled css */
    getStyles?(): Array<string>
    /** Retrieves the bundled translations */
    getTranslations?():Map<string,string>
    /** Updates the module view */
    updateDom?(speed?:number):void
    /** Translates the localized string from provided translations */
    translate?(identifier?:string):string

    [key: string]: any
}

/** Interface representing an instance of a module */
declare interface IModuleInstance extends IModuleProperties {
    name: string,
    identifier: string,
    hidden: boolean,
    data:IModulePropertyData,
}

/** Interface representing the magicmirror static Module class*/
declare interface IMagicMirrorModule {
    /**
     * @param {string} moduleName The name of the module (as specified by folder and config.js)
     * @param {IModuleProperties} moduleProperties The module instance initializer
     */
    register(moduleName: string, moduleProperties: IModuleProperties): void;
}

/** Interface representing the MagicMirror static Log class*/
declare interface IMagicMirrorLog {
    info(message?: any, ...optionalParams: any[]): void
    log(message?: any, ...optionalParams: any[]): void
    error(message?: any, ...optionalParams: any[]): void
    warn(message?: any, ...optionalParams: any[]): void
    group(groupTitle?: string, ...optionalParams: any[]): void
    groupCollapsed(groupTitle?: string, ...optionalParams: any[]): void
    groupEnd(): void
    time(timerName?: string): void
    timeEnd(timerName?: string): void
    timeStamp(timerName?: string): void
}

/** signature for module instance callback */
interface IModuleInstanceCallback {
    (module:IModuleInstance):void
}

/** wrapper for instance collection to support fluid methods */
interface IModuleInstanceCollection extends Array<IModuleInstance> {
    /** execute the method across all instances */
    enumerate(callback:IModuleInstanceCallback):IModuleInstanceCollection;
    /** use the selection class
     * @param classnames the class names to include
    */
    withClass(classnames:string|Array<string>):IModuleInstanceCollection;
    /** use the exclusion class
     * @param classnames the class names to exclude
    */
    exceptWithClass(classnames:string|Array<string>):IModuleInstanceCollection;
    /** exclude the module instance
     * @param {IModuleInstance} module the module instance
    */
    exceptModule(module:IModuleInstance):IModuleInstanceCollection;
}

/** Interface representing the magicmirror static MM class*/
declare interface IMagicMirrorStatic {
    /** Called on initialization */
    init:()=>void
    /** Called when all modules are started */
    modulesStarted:(moduleObjects:any)=>void
    /** Sends a notification
     * @param {NotificationType} notification The notification type being sent
     * @param {NotificationPayload} payload The notification payload
     * @param sender The module sending the notification
    */
    sendNotification: (notification:NotificationType, payload:NotificationPayload, sender:object)=>void
    /** Updates a module's DOM
     * @param module the module to update
     * @param speed the speed in milliseconds to delay
    */
    updateDom: (module:any, speed:number)=>Promise<any>
    /** Retrieves the list of configured module names */
    getModules():IModuleInstanceCollection,
    /** hides the module */
    hideModule: (module:any, speed:number, callback:any, options:object)=>void
    /** shows the module */
    showModule: (module:any, speed:number, callback:any, options:object)=>void
}

/** MagicMirror Logger */
declare const Log:IMagicMirrorLog
/** MagicMirror Static Helper */
declare const MM:IMagicMirrorStatic
/** Module Loader */
declare const Module:IMagicMirrorModule