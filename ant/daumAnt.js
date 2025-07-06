const EventEmitter = require('events');
const {AntDevice} = require('incyclist-ant-plus/lib/bindings')
const {Messages} = require("incyclist-ant-plus");
const Logger = require('../logger');

const logger = new Logger('DaumAnt.js');

class DaumAnt extends EventEmitter {
    static DEVICE_TYPE = 0x0b; // power meter
    static TRANSMISSION_TYPE = 1;
    static CHANNEL_PERIOD = 8182; // 8182/32768 ~4hz
    static RF_CHANNEL_FREQUENCY = 57; // 2457 MHz
    static BROADCAST_INTERVAL = DaumAnt.CHANNEL_PERIOD / 32768; // seconds

    power = 0;
    rpm = 0;
    eventCount = 0; // allows receiver to notice missed events
    accumulatedPower = 0; // allows receiver to fill in missed values

    constructor() {
        super();

        console.log(`[daumAnt.js] - ANT+ server starting`);
        const ant = new AntDevice({startupTimeout: 10000});
        ant.open().then(async result => {
            console.log(`[daumAnt.js] - Open result: ${result}`);
            if (result === 'Success' || result === true) {
                const channel = ant.getChannel();
                const deviceId = 22448; // arbitrary value between 1 and 65535, needs to be consistent across runs
                const messages = [
                    Messages.assignChannel(channel.getChannelNo(), 'transmit'),
                    Messages.setDevice(channel.getChannelNo(), deviceId, DaumAnt.DEVICE_TYPE, DaumAnt.TRANSMISSION_TYPE),
                    Messages.setFrequency(channel.getChannelNo(), DaumAnt.RF_CHANNEL_FREQUENCY),
                    Messages.setPeriod(channel.getChannelNo(), DaumAnt.CHANNEL_PERIOD),
                    Messages.openChannel(channel.getChannelNo())
                ];
                for (const message of messages) {
                    await channel.sendMessage(message);
                }
                console.log(`[daumAnt.js] - ANT+ server started with device id '${deviceId}' and channel '${channel.getChannelNo()}'`);
                setInterval(() => {
                        this.accumulatedPower += this.power;
                        this.accumulatedPower &= 0xffff; // wrap around at 65535 to stay within two byte limit
                        const data = [
                            channel.getChannelNo(),
                            0x10, // power only
                            this.eventCount,
                            0xff, // pedal power not used
                            this.rpm,
                            ...Messages.intToLEHexArray(this.accumulatedPower, 2),
                            ...Messages.intToLEHexArray(this.power, 2),
                        ];
                        const message = Messages.broadcastData(data);
                        logger.debug(`ANT+ broadcast power=${this.power}W cadence=${this.rpm}rpm accumulatedPower=${this.accumulatedPower}W eventCount=${this.eventCount} message=${message.toString('hex')}`);
                        channel.sendMessage(message);
                        this.eventCount++;
                        this.eventCount &= 0xff; // wrap around at 255 to stay within one byte limit
                    },
                    DaumAnt.BROADCAST_INTERVAL * 1000);
            }
        })
    }

    notify(event) {
        if ('power' in event) {
            this.power = event.power;
            logger.debug('power: ' + event.power);
        }

        if ('rpm' in event) {
            this.rpm = event.rpm;
            logger.debug('rpm: ' + event.rpm);
        }
    }
}

module.exports = DaumAnt;
