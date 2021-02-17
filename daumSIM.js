// daumSIM is used to handle physical watt calculation for SIM mode
// the basis for this was found here:
// https://www.gribble.org/cycling/power_v_speed.html

const config = require('config-yml');

function log (msg) {
  if (config.DEBUG.daumSIM) {
    console.log(msg);
  }
}

// ///////////////////////////////////////////////////////////////
// usage: put daum in program 0 = watt mode and toggle ergoFACE to SIM mode.
// in this setting, the gearshift buttons can be used to change gear = speed
// and daumSIM calculates the correct power for the received speed from RS232
// ///////////////////////////////////////////////////////////////

const maxGrade = 8;       // maximum gradient in %

function daumSIM () {
  this.physics = function (windspeedz, gradez, crrz, cwz, rpmd, speedd, geard) {
    log('[daumSIM.js] - physics calculation started');
    // io.emit('raw', 'Bike SIM Mode - physics calculation started')

    //  Rider variables
    const mRider = config.simulation.mRider;        // mass in kg of the rider
    const mBike = config.simulation.mBike;          // mass in kg of the bike
    const mass = mBike + mRider;                    // mass in kg of the bike + rider

    // height in m of rider - this is already included in the cw value sent from ZWIFT or FULLGAZ
    // const h = 1.92
    // cross sectional area of the rider, bike and wheels - this is allready included in the cw value sent from ZWIFT or FULLGAZ
    // const area = 0.0276 * Math.pow(h, 0.725) * Math.pow(mRider, 0.425) + 0.1647;

    // ZWIFT simulation variables
    const grade = gradez;  // gradiant in %

    // check if gradient received is to high for realistic riding experience
    if (gradez > maxGrade) {
      // set to maximum gradient; means, no changes in resistance if gradient is greater than maximum
      const grade = maxGrade;
    }

    // const angle = Math.atan(grade*0.01); // gradient in ° // through testing and reevaluation of algorythm, it is not neccesarry to have this in force calculation
    // const radiant = angle * 0.005555556 * Math.PI; // gradient in radiant (rad)

    // coefficient of rolling resistance
    // the values sent from ZWIFT / FULLGAZ are crazy, specially FULLGAZ, when starting to decent, this drives up the wattage to above 600W
    const crr = crrz;
    // multiply with 1 to parse sting to float
    // the values sent from ZWIFT / FULLGAZ are crazy
    const w = windspeedz * 1;
    // coefficient of drag
    const cd = cwz;

    // DAUM values
    const v = global.globalspeed_daum * 0.2778;     // speed in m/s

    //  Constants
    const g = 9.8067;                               // acceleration in m/s^2 due to gravity
    const p = 1.225;                                // air density in kg/m^3 at 15°C at sea level
    const e = 0.97;                                 // drive chain efficiency
    // const vw = Math.abs(v + w); // have to do this to avoid NaN in Math.pow()

    // Cycling Wattage Calculator - https://www.omnicalculator.com/sports/cycling-wattage
    const forceofgravity = g * Math.sin(Math.atan(grade / 100)) * mass;
    log('[daumSIM.js] - forceofgravity: ', forceofgravity);

    const forcerollingresistance = g * Math.cos(Math.atan(grade / 100)) * mass * crr;
    log('[daumSIM.js] - forcerollingresistance: ', forcerollingresistance);

    const forceaerodynamic = 0.5 * cd * p * Math.pow(v + w, 2);
    log('[daumSIM.js] - forceaerodynamic: ', forceaerodynamic);

    const simpower = (forceofgravity + forcerollingresistance + forceaerodynamic) * v / e;
    log('[daumSIM.js] - SIM calculated power: ', simpower);

    global.globalsimpower_daum = simpower;
  }
}

module.exports = daumSIM;
