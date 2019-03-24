// daumSIM is used to handle physical watt calculation for SIM mode
// the basis for this was found here:
// https://www.gribble.org/cycling/power_v_speed.html

// ///////////////////////////////////////////////////////////////
// usage: put daum in program 0 = watt mode and toggle ergoFACE to SIM mode.
// in this setting, the gearshift buttons can be used to change gear = speedd
// and daumSIM calculates the correct power for the received speed from RS232
// ///////////////////////////////////////////////////////////////
var DEBUG = false
var maxGrade = 8 // maximum gradient in %

function daumSIM () {
  this.physics = function (windspeedz, gradez, crrz, cwz, rpmd, speedd) {
    if (DEBUG) console.log('[daumSIM.js] - physics calculation started')
    // io.emit('raw', 'Bike SIM Mode -physics calculation started')
    // ////////////////////////////////////////////////////////////////////////
    //  Rider variables !!! TBD - make a form to change these rider variables per webserver
    // ////////////////////////////////////////////////////////////////////////
    var mRider = 80 // mass in kg of the rider
    var mBike = 7 // mass in kg of the bike
    var mass = mBike + mRider // mass in kg of the bike + rider
    // var h = 1.92 // hight in m of rider - this is allready included in the cw value sent from ZWIFT or FULLGAZ
    // var area = 0.0276 * Math.pow(h, 0.725) * Math.pow(mRider, 0.425) + 0.1647;  //  cross sectional area of the rider, bike and wheels - this is allready included in the cw value sent from ZWIFT or FULLGAZ
    // ////////////////////////////////////////////////////////////////////////
    // ZWIFT simulation variables
    // ////////////////////////////////////////////////////////////////////////
    if (gradez > maxGrade) { // check if gradient received is to high for realistic riding experience
      var grade = maxGrade // set to maximum gradient; means, no changes in resistance if gradient is greater than maximum
    } else {
      grade = gradez // gradiant in %
    }
    // var angle = Math.atan(grade*0.01); // gradient in ° // through testing and reevaluation of algorythm, it is not neccesarry to have this in force calculation
    // var radiant = angle * 0.005555556 * Math.PI; // gradient in radiant (rad)
    var crr = crrz // coefficient of rolling resistance // the values sent from ZWIFT / FULLGAZ are crazy, specially FULLGAZ, when starting to decent, this drives up the wattage to above 600W
    var w = windspeedz * 1 // multiply with 1 to parse sting to float // the values sent from ZWIFT / FULLGAZ are crazy
    var cd = cwz // coefficient of drag
    // ////////////////////////////////////////////////////////////////////////
    // DAUM values
    // ////////////////////////////////////////////////////////////////////////
    var v = speedd * 0.2778 // velocity in m/s
    // var gear =  1; //  gear factor for RPM of DAUM // not needed until now, maybe to have a custom gear ratio
    // var rpm =  rpmd; //  RPM from DAUM
    // ////////////////////////////////////////////////////////////////////////
    //  Constants
    // ////////////////////////////////////////////////////////////////////////
    var g = 9.8067 // acceleration in m/s^2 due to gravity
    var p = 1.225 // air density in kg/m^3 at 15°C at sea level
    var e = 0.97 // drive chain efficiency
    // var vw = Math.abs(v + w); // have to do this to avoid NaN in Math.pow()
    // ////////////////////////////////////////////////////////////////////////
    // Cycling Wattage Calculator - https://www.omnicalculator.com/sports/cycling-wattage
    // ////////////////////////////////////////////////////////////////////////
    var forceofgravity = g * Math.sin(Math.atan(grade / 100)) * mass
    if (DEBUG) console.log('[daumSIM.js] - forceofgravity: ', forceofgravity)
    var forcerollingresistance = g * Math.cos(Math.atan(grade / 100)) * mass * crr
    if (DEBUG) console.log('[daumSIM.js] - forcerollingresistance: ', forcerollingresistance)
    var forceaerodynamic = 0.5 * cd * p * Math.pow(v + w, 2)
    if (DEBUG) console.log('[daumSIM.js] - forceaerodynamic: ', forceaerodynamic)
    var simpower = (forceofgravity + forcerollingresistance + forceaerodynamic) * v / e
    if (DEBUG) console.log('[daumSIM.js] - SIM calculated power: ', simpower)
    global.globalsimpower_daum = simpower
  }
}
module.exports = daumSIM
