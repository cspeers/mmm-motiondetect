//Declarations for the MagicMirror server side node_helper
declare module "node_helper" {
    
    type NotificationType=string;
    type NotificationPayload=object;

    /**
     * Module socket notification event method
     */
    export interface SocketNotifcationEvent {
        /**
         * @param {NotificationType} notification The notfication type
         * @param {NotificationPayload} payload The notification payload
         */
        (notification: NotificationType, payload: NotificationPayload): void
    }
    
    /** Generic interface for node_helper */
    export interface IHelperConfig {
        /** The name of the module */
        name?:string;
        /** the path of the module */
        path?:string;
        /** The version required */
        requiresVersion?:string;
        /** The associate hosting app */
        expressApp?:any;
        /** The associated socket.io instance */
        io?:any;
        /** Called on Start of the helper */
        start(): void ;
        /** Called prior to Start of the helper */
        init?(): void ;
        /** Called on Stop of the helper */
        stop?(): void ;
        /**
         * Callback for socket.io notifications
         * @param {NotificationType} notification The notification being sent
         * @param {T} payload The notification payload
         */
        socketNotificationReceived<T>(notification: NotificationType, payload: T): void;        
        socketNotificationReceived<T extends NotificationPayload>(notification: NotificationType, payload: T): void;

        /** Send a socket.io notification back to the module
         * @param {NotificationType} notification The notification being sent
         * @param {T} payload The notification payload
         */
        sendSocketNotification?<T>(notification:NotificationType,payload:T):void
        sendSocketNotification?<T extends NotificationPayload>(notification:NotificationType,payload:T):void
        
        [key: string]: {};
    }

    /**
     * Initializer method for module node_helper
     * @param {IHelperConfig} config The node helper parameters
     */
    export function create(config:IHelperConfig): void;

    /**
     * Callback for Socket notifications
     */
    export interface ResultCallback<T> {
        /**
         * @param {T} payload The notification payload 
        */
        (payload:T):void
    }

}