var { SerialPort, ByteLengthParser } = require('serialport');
var port = new SerialPort( { path: "/dev/ttyUSB0", baudRate: 9600 });
var parser = port.pipe(new ByteLengthParser({ length: 19 })) //if bytelength 1, the received buffer changes accordingly to the send bytes of ergobike

var power = 300

// run data 0x40 & 0x00 == 4000
var datas = Buffer.from("5100" + (power/5).toString(16), "hex");

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
    setTimeout(function(){parser.on('data', function (data) {
      s = data.toString('hex');
      ss = s.match(/.{1,2}/g);
      numbers = ss.map(function (x) {return parseInt(x, 16);});
      console.log('RECEIVED DATA: ', numbers);
      // console.log('RECEIVED DATA: ', ConvertBase.hex2dec('data'));

  })},50);
  // var run_Data = parser.on.data;
  // var power = (run_Data[4] * 5);
  // var speed = (run_Data[6]);
  // var cadence = (run_Data[5]);
  // console.log('WATT: ', power);
  // console.log('RPM: ', cadence);
  // console.log('SPEED: ', speed);
};
});
