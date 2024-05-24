import { pino, levels, stdTimeFunctions } from "pino"


declare global {
    interface globalThis {
      __POLYFEA_LOGS_LEVEL: number;      
      __POLYFEA_SW_LOGS_LEVEL: number;
      process: any;
    }

    interface Window {
        __POLYFEA_LOGS_LEVEL: number;      
        __POLYFEA_SW_LOGS_LEVEL: number;
        process: any;
      }
  }

let loglevel =  (self.__POLYFEA_SW_LOGS_LEVEL === undefined) ?  self.__POLYFEA_LOGS_LEVEL : self.__POLYFEA_SW_LOGS_LEVEL;
if (loglevel === undefined) {

   if (import.meta.env.MODE === "development") {
        loglevel = levels.values.debug;
    } else {
        loglevel = levels.values.info;
    }
}

const logger = pino({
    level: levels.labels[loglevel],
    timestamp: stdTimeFunctions.isoTime,
    browser: {
        asObject: true,
        write: (obj:any) => {
            let color = `#7f8c8d`;
            
            
            const colors: { [level: string]: string | null } = {
                trace: `#95a5a6`,
                debug: `#7f8c8d`,
                log: `#2ecc71`,
                info: `#3498db`,
                warn: `#f39c12`,
                error: `#c0392b`,
                fatal: `#c0392b`,
            };

            const level = levels.labels[obj.level];

            const styles = [
                `background: ${colors[level]|| '#000'}`,
                `border-radius: 0.5em`,
                `color: white`,
                `font-weight: bold`,
                `padding: 2px 0.5em`,
            ];

            let module = "polyfea"
            let e = new Error();
            if (!e.stack) {
                try {throw e;} catch (e) {}
            }
            let stack = e.stack?.toString().split(/\r\n|\n/);    
            if (obj.component) {
                module += "/"+ obj.component
            };
            obj = Object.assign(obj, { module: "polyfea", level: level, src: stack?.[1] || undefined });
            const logPrefix = ['%c'+module, styles.join(';')];
            (console as any)[level](...logPrefix, obj);
        },
    },
}).child({ component: "sw" });

export { logger };
