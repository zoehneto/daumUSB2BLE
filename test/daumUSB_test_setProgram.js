var com = require('serialport');
var port = new com.SerialPort("/dev/ttyUSB0", { baudrate: 9600, parser: com.parsers.byteLength(19) }, false); //if bytelength 1, the received buffer changes accordingly to the send bytes of ergobike



// run data 0x40 & 0x00 == 4000
var datas = Buffer.from("230000", "hex");


// these numbers are decimal and have to be converted to hex before entering in dataBits
// e.g.: FP_STEIGUNG 49 == 31hex
// #define FREIES_TRAINING 0
// #define FP_WATT1_PROG 19
// #define FP_WATT2_PROG 28
// #define FP_PULS_PROG 38
// #define FP_KONA 39
// #define FP_ROTH 40
// #define FP_LANZA 41
// #define FP_COOL1 42
// #define FP_COOL3 44
// #define FP_CONCONI1 45
// #define FP_CONCONI2 46
// #define FP_CARDIO 47
// #define FP_RPM_KONST 48
// #define FP_STEIGUNG 49
// #define FP_DREHZAHL15 50
// #define FP_DREHZAHL19 51
// #define FP_TDF_FIRST 52
// #define FP_TDF_MAX 72
// #define FP_THERAPIE_LT 73
// #define FP_IND_WATT 77
// #define FP_IND_PULS 78
// #define FP_IND_SPEED 79

//***2*** open the serialport
port.open(function (error) {
  if ( error ) {
    console.log('failed to open: ', error);
  } else {
    console.log('open');

    //***3*** send command using serialport -> after port opened
    // port.write(hex('@'), function(err, results) {
    port.write(datas, function(err, results) {
      console.log('ERRORS: ', err);
      console.log('RESUTS: ', results);
      console.log('WRITE DATA: ', datas);
    });

    //***1*** listen for events on port
    setTimeout(function(){port.on('data', function (data) {
      s = data.toString('hex');
      ss = s.match(/.{1,2}/g);
      numbers = ss.map(function (x) {return parseInt(x, 16);});
      console.log('RECEIVED DATA: ', numbers);
      // console.log('RECEIVED DATA: ', ConvertBase.hex2dec('data'));

  })},50);
  // var run_Data = port.on.data;
  // var power = (run_Data[4] * 5);
  // var speed = (run_Data[6]);
  // var cadence = (run_Data[5]);
  // console.log('WATT: ', power);
  // console.log('RPM: ', cadence);
  // console.log('SPEED: ', speed);
};
});
