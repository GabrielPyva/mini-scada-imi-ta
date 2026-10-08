const { app, BrowserWindow, ipcMain } = require('electron')
const Modbus = require('jsmodbus')
const net = require('net')
const path = require('path')

const MODBUS_PORT = 502
const UNIT_ID = 1
const SCAN_RATE = 1000
const START_ADDRESS = 302
const REGISTER_122_ADDRESS = 122
const MEASURED_VALUES_START_ADDRESS = 1050
const MEASURED_VALUES_REGISTER_COUNT = 16

let mainWindow = null
let activeSocket = null
let client = null
let modbusConnected = false
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
  if (!client || client.connectionState !== 'online') return

  client.writeMultipleRegisters(START_ADDRESS, valueToRegisters(pendingValue))
    .catch((error) => console.error('Modbus write failed:', error.message))
}

async function readMeasuredValues () {
  if (!client || client.connectionState !== 'online') return null

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

  if (!client || client.connectionState !== 'online') {
    console.error('Cannot write Modbus register 122: connection is offline')
    return
  }

  client.writeSingleRegister(REGISTER_122_ADDRESS, value)
    .catch((error) => console.error('Modbus register 122 write failed:', error.message))
}

function updateConnectionStatus (connected) {
  modbusConnected = connected
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(
      'connection-status-updated',
      connected ? 'connected' : 'not connected'
    )
  }
}

function connectModbus (host) {
  if (net.isIP(host) !== 4) {
    console.error('Invalid Modbus IPv4 address:', host)
    return
  }

  if (activeSocket) activeSocket.destroy()

  const socket = new net.Socket()
  activeSocket = socket
  client = new Modbus.client.TCP(socket, UNIT_ID)
  updateConnectionStatus(false)

  socket.on('connect', () => {
    if (activeSocket !== socket) return

    console.log(`Connected to Modbus TCP ${host}:${MODBUS_PORT}`)
    updateConnectionStatus(true)
    writeSliderValue()
    readMeasuredValues()
  })

  socket.on('error', (error) => {
    if (activeSocket === socket) updateConnectionStatus(false)
    console.error('Modbus TCP connection failed:', error.message)
  })

  socket.on('close', () => {
    if (activeSocket !== socket) return

    updateConnectionStatus(false)
    client = null
  })

  socket.connect({ host, port: MODBUS_PORT })
}

ipcMain.on('modbus-connect-requested', (_event, host) => {
  connectModbus(String(host).trim())
})

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

  mainWindow.webContents.on('did-finish-load', () => {
    updateConnectionStatus(modbusConnected)
  })

  mainWindow.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow()
  setInterval(writeSliderValue, SCAN_RATE)
  setInterval(readMeasuredValues, SCAN_RATE)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
