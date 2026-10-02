const { app, BrowserWindow, ipcMain } = require('electron')
const Modbus = require('jsmodbus')
const net = require('net')
const path = require('path')

const MODBUS_HOST = '192.168.2.49'
const MODBUS_PORT = 502
const UNIT_ID = 1
const SCAN_RATE = 1000
const START_ADDRESS = 302
const REGISTER_122_ADDRESS = 122
const MEASURED_VALUES_START_ADDRESS = 1050
const MEASURED_VALUES_REGISTER_COUNT = 16

const socket = new net.Socket()
const client = new Modbus.client.TCP(socket, UNIT_ID)
let mainWindow = null
let pendingValue = 0
let Register122 = null
let MeasuredFlow_unit1 = 0
let MeasuredSupplyTemp_degC = 0
let MeasuredReturnTemp_degC = 0
let MeasuredDeltaT_K = 0
let MeasuredPower_unit1 = 0
let RelativeMeasuredPosition = 0
let EnergyCounterRegime1_unit1 = 0
let EnergyCounterRegime2_unit1 = 0

function valueToRegisters (value) {
  const buffer = Buffer.allocUnsafe(4)
  buffer.writeFloatBE(Number(value), 0)

  return [buffer.readUInt16BE(0), buffer.readUInt16BE(2)]
}

function writeSliderValue () {
  if (client.connectionState !== 'online') return

  client.writeMultipleRegisters(START_ADDRESS, valueToRegisters(pendingValue))
    .catch((error) => console.error('Modbus write failed:', error.message))
}

async function readMeasuredValues () {
  if (client.connectionState !== 'online') return null

  try {
    const { response } = await client.readHoldingRegisters(REGISTER_122_ADDRESS, 1)
    Register122 = response.body.valuesAsBuffer.readUInt16BE(0)
  } catch (error) {
    console.error('Modbus register 122 read failed:', error.message)
  }

  try {
    const { response } = await client.readHoldingRegisters(
      MEASURED_VALUES_START_ADDRESS,
      MEASURED_VALUES_REGISTER_COUNT
    )
    const registerBuffer = response.body.valuesAsBuffer
    const valueAt = (index) => registerBuffer.readFloatBE(index * 4)

    MeasuredFlow_unit1 = valueAt(0)
    MeasuredSupplyTemp_degC = valueAt(1)
    MeasuredReturnTemp_degC = valueAt(2)
    MeasuredDeltaT_K = valueAt(3)
    MeasuredPower_unit1 = valueAt(4)
    RelativeMeasuredPosition = valueAt(5)
    EnergyCounterRegime1_unit1 = valueAt(6)
    EnergyCounterRegime2_unit1 = valueAt(7)

    const measuredValues = {
      Register122,
      MeasuredFlow_unit1,
      MeasuredSupplyTemp_degC,
      MeasuredReturnTemp_degC,
      MeasuredDeltaT_K,
      MeasuredPower_unit1,
      RelativeMeasuredPosition,
      EnergyCounterRegime1_unit1,
      EnergyCounterRegime2_unit1
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('measured-values-updated', measuredValues)
    }

    return measuredValues
  } catch (error) {
    console.error('Modbus read failed:', error.message)
    return null
  }
}

function writeRegister122 (value) {
  if (!Number.isInteger(value) || value < 1 || value > 4) {
    console.error('Invalid value for Modbus register 122:', value)
    return
  }

  if (client.connectionState !== 'online') {
    console.error('Cannot write Modbus register 122: connection is offline')
    return
  }

  client.writeSingleRegister(REGISTER_122_ADDRESS, value)
    .catch((error) => console.error('Modbus register 122 write failed:', error.message))
}

function connectModbus () {
  socket.on('connect', () => {
    console.log(`Connected to Modbus TCP ${MODBUS_HOST}:${MODBUS_PORT}`)
    writeSliderValue()
    readMeasuredValues()
  })

  socket.on('error', (error) => {
    console.error('Modbus TCP connection failed:', error.message)
  })

  socket.connect({ host: MODBUS_HOST, port: MODBUS_PORT })
  setInterval(writeSliderValue, SCAN_RATE)
  setInterval(readMeasuredValues, SCAN_RATE)
}

ipcMain.on('slider-value-changed', (_event, value) => {
  pendingValue = Number(value)
  writeSliderValue()
})

ipcMain.on('register-122-value-changed', (_event, value) => {
  writeRegister122(value)
})

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.loadFile('index.html')
}

app.whenReady().then(() => {
  connectModbus()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
