// daumSIM is used to handle physical watt calculation for SIM mode
// the basis for this was found here:
// https://www.gribble.org/cycling/power_v_speed.html

const config = require('@stefcud/configyml')();
const Logger = require('./logger');

const logger = new Logger('daumSIM.js');

// ///////////////////////////////////////////////////////////////
// usage: put daum in program 0 = watt mode and toggle ergoFACE to SIM mode.
// in this setting, the gearshift buttons can be used to change gear = speed
// and daumSIM calculates the correct power for the received speed from RS232
// ///////////////////////////////////////////////////////////////

class daumSIM {
  physics(windspeedz, gradez, crrz, cwz, speedd) {
    logger.debug('physics calculation started');

    //  Rider variables
    const mRider = config.simulation.mRider;        // mass in kg of the rider
    const mBike = config.simulation.mBike;          // mass in kg of the bike
    const mass = mBike + mRider;                    // mass in kg of the bike + rider

    // height in m of rider - this is already included in the cw value sent from ZWIFT or FULLGAZ
    // const h = 1.92
    // cross-sectional area of the rider, bike and wheels - this is already included in the cw value sent from ZWIFT or FULLGAZ
    // const area = 0.0276 * Math.pow(h, 0.725) * Math.pow(mRider, 0.425) + 0.1647;

    // ZWIFT simulation variables
    let grade = gradez;  // gradiant in %

    // check if gradient received is too high for realistic riding experience
    if (gradez > config.simulation.maxGrade) {
      // set to maximum gradient; means, no changes in resistance if gradient is greater than maximum
      grade = config.simulation.maxGrade;
    }

    // coefficient of rolling resistance
    // the values sent from ZWIFT / FULLGAZ are crazy, specially FULLGAZ, when starting to descend, this drives up the wattage to above 600W
    const crr = crrz;
    // multiply with 1 to parse sting to float
    // the values sent from ZWIFT / FULLGAZ are crazy
    const w = windspeedz * 1;
    // coefficient of drag
    const cd = cwz;

    // DAUM values
    const v = speedd * 0.2778;     // speed in m/s

    //  Constants
    const g = 9.8067;        // acceleration in m/s^2 due to gravity
    const p = config.simulation.p;    // air density in kg/m^3
    const e = config.simulation.e;    // drive train efficiency
    // const vw = Math.abs(v + w);    // have to do this to avoid NaN in Math.pow()

    // Cycling Wattage Calculator - https://www.omnicalculator.com/sports/cycling-wattage
    const forceofgravity = g * Math.sin(Math.atan(grade / 100)) * mass;
    logger.debug('forceofgravity: ' + forceofgravity);

    const forcerollingresistance = g * Math.cos(Math.atan(grade / 100)) * mass * crr;
    logger.debug('forcerollingresistance: ' + forcerollingresistance);

    const forceaerodynamic = 0.5 * cd * p * Math.pow(v + w, 2);
    logger.debug('forceaerodynamic: ' + forceaerodynamic);

    const simpower = (forceofgravity + forcerollingresistance + forceaerodynamic) * v / e;
    logger.debug('SIM calculated power: ' + simpower);

    return simpower;
  }
}

module.exports = daumSIM;
